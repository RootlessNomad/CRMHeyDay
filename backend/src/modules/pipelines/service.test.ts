import type { Lead, Pipeline, PipelineStage, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidStageKindError,
  PipelineNotFoundError,
  StageHasLeadsError,
  StageNotFoundError,
} from './domain.js';
import { PipelinesService } from './service.js';

interface FakeDb {
  pipelines: Map<string, Pipeline>;
  stages: Map<string, PipelineStage>;
  leads: Map<string, Lead>;
}

interface PipelineWhereUnique {
  id: string;
}

interface StageOrderFilter {
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

interface StageWhere {
  id?: string;
  pipelineId?: string;
  orderIndex?: number | StageOrderFilter;
}

interface LeadWhere {
  stageId?: string;
  deletedAt?: null;
}

interface StageCreateData {
  pipeline: { connect: { id: string } };
  name: string;
  kind: PipelineStage['kind'];
  color: string | null;
  orderIndex: number;
}

interface StageUpdateData {
  name?: string;
  color?: string | null;
  orderIndex?: number;
}

interface StageUpdateManyData {
  orderIndex?: { increment?: number; decrement?: number };
}

function buildFakeDb(): FakeDb {
  return {
    pipelines: new Map(),
    stages: new Map(),
    leads: new Map(),
  };
}

function matchesOrderIndex(value: number, filter: number | StageOrderFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (typeof filter === 'number') return value === filter;
  if (filter.gt !== undefined && !(value > filter.gt)) return false;
  if (filter.gte !== undefined && !(value >= filter.gte)) return false;
  if (filter.lt !== undefined && !(value < filter.lt)) return false;
  if (filter.lte !== undefined && !(value <= filter.lte)) return false;
  return true;
}

function matchesStageWhere(row: PipelineStage, where: StageWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.pipelineId !== undefined && row.pipelineId !== where.pipelineId) return false;
  if (!matchesOrderIndex(row.orderIndex, where.orderIndex)) return false;
  return true;
}

function matchesLeadWhere(row: Lead, where: LeadWhere): boolean {
  if (where.stageId !== undefined && row.stageId !== where.stageId) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  return true;
}

function applyStageUpdate(row: PipelineStage, data: StageUpdateData): PipelineStage {
  const updated: PipelineStage = { ...row };
  if (data.name !== undefined) updated.name = data.name;
  if (data.color !== undefined) updated.color = data.color;
  if (data.orderIndex !== undefined) updated.orderIndex = data.orderIndex;
  return updated;
}

function applyStageUpdateMany(row: PipelineStage, data: StageUpdateManyData): PipelineStage {
  const updated: PipelineStage = { ...row };
  if (data.orderIndex?.increment !== undefined) updated.orderIndex += data.orderIndex.increment;
  if (data.orderIndex?.decrement !== undefined) updated.orderIndex -= data.orderIndex.decrement;
  return updated;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const pipelineStageDelegate = {
    findUnique: async ({ where }: { where: { id: string } }) => db.stages.get(where.id) ?? null,
    findMany: async ({ where, orderBy }: { where: StageWhere; orderBy: { orderIndex: 'asc' } }) =>
      [...db.stages.values()]
        .filter((row) => matchesStageWhere(row, where))
        .sort((a, b) =>
          orderBy.orderIndex === 'asc' ? a.orderIndex - b.orderIndex : b.orderIndex - a.orderIndex,
        ),
    create: async ({ data }: { data: StageCreateData }) => {
      const row = makeStage({
        id: `stage_${db.stages.size + 1}`,
        pipelineId: data.pipeline.connect.id,
        name: data.name,
        kind: data.kind,
        color: data.color,
        orderIndex: data.orderIndex,
      });
      db.stages.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: StageUpdateData }) => {
      const existing = db.stages.get(where.id);
      if (!existing) throw new Error('stage not found');
      const updated = applyStageUpdate(existing, data);
      db.stages.set(updated.id, updated);
      return updated;
    },
    updateMany: async ({ where, data }: { where: StageWhere; data: StageUpdateManyData }) => {
      let count = 0;
      for (const row of db.stages.values()) {
        if (!matchesStageWhere(row, where)) continue;
        db.stages.set(row.id, applyStageUpdateMany(row, data));
        count++;
      }
      return { count };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.stages.get(where.id);
      if (!existing) throw new Error('stage not found');
      db.stages.delete(where.id);
      return existing;
    },
  };

  const pipelineDelegate = {
    findMany: async ({
      include,
      orderBy,
    }: {
      include: { stages: { orderBy: { orderIndex: 'asc' } } };
      orderBy: Array<{ isDefault: 'desc' } | { createdAt: 'asc' }>;
    }) => {
      void include;
      void orderBy;
      return [...db.pipelines.values()]
        .sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        })
        .map((row) => ({
          ...row,
          stages: [...db.stages.values()]
            .filter((stage) => stage.pipelineId === row.id)
            .sort((a, b) => a.orderIndex - b.orderIndex),
        }));
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: PipelineWhereUnique;
      include?: { stages: { orderBy: { orderIndex: 'asc' } } };
    }) => {
      const row = db.pipelines.get(where.id);
      if (!row) return null;
      if (!include) return row;
      return {
        ...row,
        stages: [...db.stages.values()]
          .filter((stage) => stage.pipelineId === row.id)
          .sort((a, b) => a.orderIndex - b.orderIndex),
      };
    },
    count: async () => db.pipelines.size,
    create: async ({
      data,
      include,
    }: {
      data: { name: string; isDefault: boolean };
      include: { stages: { orderBy: { orderIndex: 'asc' } } };
    }) => {
      void include;
      const now = new Date();
      const row = makePipeline({
        id: `pipeline_${db.pipelines.size + 1}`,
        name: data.name,
        isDefault: data.isDefault,
        createdAt: now,
        updatedAt: now,
      });
      db.pipelines.set(row.id, row);
      return { ...row, stages: [] };
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: PipelineWhereUnique;
      data: { name?: string };
      include: { stages: { orderBy: { orderIndex: 'asc' } } };
    }) => {
      void include;
      const existing = db.pipelines.get(where.id);
      if (!existing) throw new Error('pipeline not found');
      const updated: Pipeline = {
        ...existing,
        name: data.name ?? existing.name,
        updatedAt: new Date(),
      };
      db.pipelines.set(updated.id, updated);
      return {
        ...updated,
        stages: [...db.stages.values()]
          .filter((stage) => stage.pipelineId === updated.id)
          .sort((a, b) => a.orderIndex - b.orderIndex),
      };
    },
  };

  const leadDelegate = {
    count: async ({ where }: { where: LeadWhere }) =>
      [...db.leads.values()].filter((row) => matchesLeadWhere(row, where)).length,
  };

  const prisma = {
    pipeline: pipelineDelegate,
    pipelineStage: pipelineStageDelegate,
    lead: leadDelegate,
    $transaction: async <T>(
      input:
        | Promise<T>[]
        | ((tx: {
            pipeline: typeof pipelineDelegate;
            pipelineStage: typeof pipelineStageDelegate;
            lead: typeof leadDelegate;
          }) => Promise<T>),
    ) => {
      if (typeof input === 'function') {
        return input({
          pipeline: pipelineDelegate,
          pipelineStage: pipelineStageDelegate,
          lead: leadDelegate,
        });
      }
      return Promise.all(input);
    },
  };

  return prisma as unknown as PrismaClient;
}

function makePipeline(input: {
  id: string;
  name: string;
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): Pipeline {
  const now = new Date();
  return {
    id: input.id,
    name: input.name,
    isDefault: input.isDefault ?? false,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function makeStage(input: {
  id: string;
  pipelineId: string;
  name: string;
  kind: PipelineStage['kind'];
  orderIndex: number;
  color?: string | null;
}): PipelineStage {
  return {
    id: input.id,
    pipelineId: input.pipelineId,
    name: input.name,
    kind: input.kind,
    orderIndex: input.orderIndex,
    color: input.color ?? null,
  };
}

function makeLead(input: {
  id: string;
  companyId: string;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  source?: Lead['source'];
  status?: Lead['status'];
  priorityScore?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}): Lead {
  const now = new Date();
  return {
    id: input.id,
    companyId: input.companyId,
    primaryContactId: null,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    ownerId: input.ownerId,
    source: input.source ?? 'manual',
    status: input.status ?? 'open',
    priorityScore: input.priorityScore ?? 0,
    priorityManual: null,
    nextActionAt: null,
    lostReason: null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  };
}

describe('PipelinesService', () => {
  let db: FakeDb;
  let service: PipelinesService;

  beforeEach(() => {
    db = buildFakeDb();
    service = new PipelinesService(makePrismaMock(db));
  });

  function seedPipeline(id = 'pipeline_1', isDefault = false) {
    const pipeline = makePipeline({ id, name: `Pipeline ${id}`, isDefault });
    db.pipelines.set(id, pipeline);
    return pipeline;
  }

  function seedStage(
    id: string,
    pipelineId: string,
    orderIndex: number,
    kind: PipelineStage['kind'] = 'open',
  ) {
    const stage = makeStage({ id, pipelineId, orderIndex, kind, name: `Stage ${id}` });
    db.stages.set(id, stage);
    return stage;
  }

  it('list devuelve pipelines con default primero y stages ordenados', async () => {
    seedPipeline('pipeline_a');
    seedPipeline('pipeline_b', true);
    seedStage('stage_1', 'pipeline_b', 2);
    seedStage('stage_2', 'pipeline_b', 0);
    seedStage('stage_3', 'pipeline_b', 1);

    const result = await service.list();

    expect(result[0]?.id).toBe('pipeline_b');
    expect(result[0]?.stages.map((stage) => stage.orderIndex)).toEqual([0, 1, 2]);
  });

  it('getById devuelve pipeline con stages', async () => {
    seedPipeline();
    seedStage('stage_1', 'pipeline_1', 0, 'open');

    const result = await service.getById('pipeline_1');

    expect(result.id).toBe('pipeline_1');
    expect(result.stages[0]).toMatchObject({ id: 'stage_1', kind: 'open' });
  });

  it('getById lanza PipelineNotFoundError si no existe', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(PipelineNotFoundError);
  });

  it('create marca isDefault=true si no existen pipelines previos', async () => {
    const created = await service.create({ name: 'First Pipeline' });

    expect(created.isDefault).toBe(true);
    expect(created.name).toBe('First Pipeline');
  });

  it('create marca isDefault=false si ya existe otro pipeline', async () => {
    seedPipeline('existing', true);

    const created = await service.create({ name: 'Second Pipeline' });

    expect(created.isDefault).toBe(false);
  });

  it('addStage asigna orderIndex max+1 por defecto', async () => {
    seedPipeline();
    seedStage('stage_1', 'pipeline_1', 0);
    seedStage('stage_2', 'pipeline_1', 1);

    const created = await service.addStage('pipeline_1', {
      name: 'New Stage',
      kind: 'open',
    });

    expect(created.orderIndex).toBe(2);
  });

  it('addStage lanza PipelineNotFoundError si el pipeline no existe', async () => {
    await expect(
      service.addStage('missing', { name: 'Nope', kind: 'open' }),
    ).rejects.toBeInstanceOf(PipelineNotFoundError);
  });

  it('update modifica el pipeline existente', async () => {
    seedPipeline();

    const updated = await service.update('pipeline_1', { name: 'Updated' });

    expect(updated.name).toBe('Updated');
  });

  it('update lanza PipelineNotFoundError si no existe', async () => {
    await expect(service.update('missing', { name: 'Updated' })).rejects.toBeInstanceOf(
      PipelineNotFoundError,
    );
  });

  it('updateStage reordena evitando colisiones y conserva el resto', async () => {
    seedPipeline();
    seedStage('stage_1', 'pipeline_1', 0);
    seedStage('stage_2', 'pipeline_1', 1);
    seedStage('stage_3', 'pipeline_1', 2);

    const updated = await service.updateStage('stage_3', { orderIndex: 0, color: '#FF0000' });

    expect(updated.orderIndex).toBe(0);
    expect(updated.color).toBe('#FF0000');
    const ordered = [...db.stages.values()]
      .filter((stage) => stage.pipelineId === 'pipeline_1')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((stage) => stage.id);
    expect(ordered).toEqual(['stage_3', 'stage_1', 'stage_2']);
  });

  it('updateStage lanza StageNotFoundError si no existe', async () => {
    await expect(service.updateStage('missing', { name: 'Updated' })).rejects.toBeInstanceOf(
      StageNotFoundError,
    );
  });

  it('deleteStage lanza StageHasLeadsError si tiene leads activos', async () => {
    seedPipeline();
    seedStage('stage_1', 'pipeline_1', 0, 'open');
    db.leads.set(
      'lead_1',
      makeLead({
        id: 'lead_1',
        companyId: 'company_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        ownerId: 'user_1',
      }),
    );

    await expect(service.deleteStage('stage_1')).rejects.toBeInstanceOf(StageHasLeadsError);
  });

  it('deleteStage lanza InvalidStageKindError si es el último won o lost', async () => {
    seedPipeline();
    seedStage('stage_open', 'pipeline_1', 0, 'open');
    seedStage('stage_won', 'pipeline_1', 1, 'won');
    seedStage('stage_lost', 'pipeline_1', 2, 'lost');

    await expect(service.deleteStage('stage_won')).rejects.toBeInstanceOf(InvalidStageKindError);
    await expect(service.deleteStage('stage_lost')).rejects.toBeInstanceOf(InvalidStageKindError);
  });

  it('deleteStage elimina y compacta orderIndex cuando es válido', async () => {
    seedPipeline();
    seedStage('stage_open', 'pipeline_1', 0, 'open');
    seedStage('stage_won_1', 'pipeline_1', 1, 'won');
    seedStage('stage_won_2', 'pipeline_1', 2, 'won');
    seedStage('stage_lost', 'pipeline_1', 3, 'lost');

    await service.deleteStage('stage_won_1');

    expect(db.stages.has('stage_won_1')).toBe(false);
    expect(db.stages.get('stage_won_2')?.orderIndex).toBe(1);
    expect(db.stages.get('stage_lost')?.orderIndex).toBe(2);
  });
});
