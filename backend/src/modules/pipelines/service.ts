import type { Pipeline, PipelineStage, Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import {
  InvalidStageKindError,
  InvalidStageOrderError,
  PipelineNotFoundError,
  StageHasLeadsError,
  StageNotFoundError,
  type PipelineDto,
  type PipelineStageDto,
} from './domain.js';
import type {
  CreatePipelineInput,
  CreateStageInput,
  UpdatePipelineInput,
  UpdateStageInput,
} from './schemas.js';

type PipelineWithStages = Pipeline & { stages: PipelineStage[] };

function toStageDto(row: PipelineStage): PipelineStageDto {
  return {
    id: row.id,
    pipelineId: row.pipelineId,
    name: row.name,
    orderIndex: row.orderIndex,
    kind: row.kind,
    color: row.color,
  };
}

function toPipelineDto(row: PipelineWithStages): PipelineDto {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stages: row.stages
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(toStageDto),
  };
}

function toPipelineUpdateData(input: UpdatePipelineInput): Prisma.PipelineUpdateInput {
  const data: Prisma.PipelineUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  return data;
}

function assertStageOrder(orderIndex: number, max: number): void {
  if (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > max) {
    throw new InvalidStageOrderError(orderIndex);
  }
}

function sortStages(stages: PipelineStage[]): PipelineStage[] {
  return stages.slice().sort((a, b) => a.orderIndex - b.orderIndex);
}

export class PipelinesService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async list(): Promise<PipelineDto[]> {
    const rows = await this.db.pipeline.findMany({
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map(toPipelineDto);
  }

  async getById(id: string): Promise<PipelineDto> {
    const row = await this.db.pipeline.findUnique({
      where: { id },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!row) throw new PipelineNotFoundError(id);
    return toPipelineDto(row);
  }

  async create(input: CreatePipelineInput): Promise<PipelineDto> {
    const existingCount = await this.db.pipeline.count();
    const created = await this.db.pipeline.create({
      data: {
        name: input.name,
        isDefault: existingCount === 0,
      },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    return toPipelineDto(created);
  }

  async update(id: string, input: UpdatePipelineInput): Promise<PipelineDto> {
    const existing = await this.db.pipeline.findUnique({ where: { id } });
    if (!existing) throw new PipelineNotFoundError(id);

    const updated = await this.db.pipeline.update({
      where: { id },
      data: toPipelineUpdateData(input),
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    return toPipelineDto(updated);
  }

  async addStage(pipelineId: string, input: CreateStageInput): Promise<PipelineStageDto> {
    const pipeline = await this.db.pipeline.findUnique({
      where: { id: pipelineId },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
    if (!pipeline) throw new PipelineNotFoundError(pipelineId);

    const siblings = sortStages(pipeline.stages);
    const nextIndex = siblings.length;
    const orderIndex = input.orderIndex ?? nextIndex;
    assertStageOrder(orderIndex, nextIndex);

    return this.db.$transaction(async (tx) => {
      if (input.orderIndex !== undefined) {
        await tx.pipelineStage.updateMany({
          where: {
            pipelineId,
            orderIndex: { gte: orderIndex },
          },
          data: {
            orderIndex: { increment: 1 },
          },
        });
      }

      const created = await tx.pipelineStage.create({
        data: {
          pipeline: { connect: { id: pipelineId } },
          name: input.name,
          kind: input.kind,
          color: input.color ?? null,
          orderIndex,
        },
      });
      return toStageDto(created);
    });
  }

  async updateStage(stageId: string, input: UpdateStageInput): Promise<PipelineStageDto> {
    const existing = await this.db.pipelineStage.findUnique({
      where: { id: stageId },
    });
    if (!existing) throw new StageNotFoundError(stageId);

    const siblingRows = await this.db.pipelineStage.findMany({
      where: { pipelineId: existing.pipelineId },
      orderBy: { orderIndex: 'asc' },
    });
    const siblings = sortStages(siblingRows);
    const maxOrderIndex = siblings.length - 1;
    const targetOrderIndex = input.orderIndex ?? existing.orderIndex;
    assertStageOrder(targetOrderIndex, maxOrderIndex);

    return this.db.$transaction(async (tx) => {
      if (targetOrderIndex !== existing.orderIndex) {
        await tx.pipelineStage.update({
          where: { id: stageId },
          data: { orderIndex: -1 },
        });

        if (targetOrderIndex < existing.orderIndex) {
          await tx.pipelineStage.updateMany({
            where: {
              pipelineId: existing.pipelineId,
              orderIndex: {
                gte: targetOrderIndex,
                lt: existing.orderIndex,
              },
            },
            data: {
              orderIndex: { increment: 1 },
            },
          });
        } else {
          await tx.pipelineStage.updateMany({
            where: {
              pipelineId: existing.pipelineId,
              orderIndex: {
                gt: existing.orderIndex,
                lte: targetOrderIndex,
              },
            },
            data: {
              orderIndex: { decrement: 1 },
            },
          });
        }
      }

      const updated = await tx.pipelineStage.update({
        where: { id: stageId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.orderIndex !== undefined ? { orderIndex: targetOrderIndex } : {}),
        },
      });
      return toStageDto(updated);
    });
  }

  async deleteStage(stageId: string): Promise<void> {
    const existing = await this.db.pipelineStage.findUnique({
      where: { id: stageId },
    });
    if (!existing) throw new StageNotFoundError(stageId);

    const activeLeads = await this.db.lead.count({
      where: {
        stageId,
        deletedAt: null,
      },
    });
    if (activeLeads > 0) throw new StageHasLeadsError(stageId);

    const siblings = await this.db.pipelineStage.findMany({
      where: { pipelineId: existing.pipelineId },
      orderBy: { orderIndex: 'asc' },
    });
    const sameKindCount = siblings.filter((stage) => stage.kind === existing.kind).length;
    if ((existing.kind === 'won' || existing.kind === 'lost') && sameKindCount <= 1) {
      throw new InvalidStageKindError(
        `No se puede eliminar el último stage ${existing.kind} del pipeline "${existing.pipelineId}"`,
      );
    }

    await this.db.$transaction(async (tx) => {
      await tx.pipelineStage.delete({ where: { id: stageId } });
      await tx.pipelineStage.updateMany({
        where: {
          pipelineId: existing.pipelineId,
          orderIndex: { gt: existing.orderIndex },
        },
        data: {
          orderIndex: { decrement: 1 },
        },
      });
    });
  }
}

export const pipelinesService = new PipelinesService();
