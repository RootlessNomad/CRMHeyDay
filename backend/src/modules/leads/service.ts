import type {
  Company,
  Contact,
  Lead,
  Pipeline,
  PipelineStage,
  Prisma,
  PrismaClient,
  User,
} from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type { PublicUserDto } from '../auth/service.js';
import {
  InvalidLeadTransitionError,
  LeadCompanyMismatchError,
  LeadNotFoundError,
  StageNotInPipelineError,
  type LeadDto,
} from './domain.js';
import type { CreateLeadInput, ListLeadsQuery, UpdateLeadInput } from './schemas.js';

type LeadWithRelations = Lead & {
  company?: Pick<Company, 'id' | 'name' | 'domain'>;
  primaryContact?: Pick<Contact, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  owner?: Pick<User, 'id' | 'name' | 'email'>;
  stage?: Pick<PipelineStage, 'id' | 'name' | 'kind' | 'color' | 'orderIndex'>;
  pipeline?: Pick<Pipeline, 'id' | 'name'>;
};

function toStatusFromStageKind(kind: PipelineStage['kind']): 'open' | 'won' | 'lost' {
  return kind === 'open' ? 'open' : kind;
}

function toDto(row: LeadWithRelations): LeadDto {
  return {
    id: row.id,
    companyId: row.companyId,
    primaryContactId: row.primaryContactId,
    pipelineId: row.pipelineId,
    stageId: row.stageId,
    ownerId: row.ownerId,
    source: row.source,
    status: row.status,
    priorityScore: row.priorityScore,
    priorityManual: row.priorityManual,
    nextActionAt: row.nextActionAt?.toISOString() ?? null,
    lostReason: row.lostReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    ...(row.company
      ? {
          company: {
            id: row.company.id,
            name: row.company.name,
            websiteDomain: row.company.domain,
          },
        }
      : {}),
    ...(row.primaryContact
      ? {
          primaryContact: {
            id: row.primaryContact.id,
            firstName: row.primaryContact.firstName,
            lastName: row.primaryContact.lastName,
            email: row.primaryContact.email,
          },
        }
      : row.primaryContact === null
        ? { primaryContact: null }
        : {}),
    ...(row.owner
      ? {
          owner: {
            id: row.owner.id,
            name: row.owner.name,
            email: row.owner.email,
          },
        }
      : {}),
    ...(row.stage
      ? {
          stage: {
            id: row.stage.id,
            name: row.stage.name,
            kind: row.stage.kind,
            color: row.stage.color,
            orderIndex: row.stage.orderIndex,
          },
        }
      : {}),
    ...(row.pipeline
      ? {
          pipeline: {
            id: row.pipeline.id,
            name: row.pipeline.name,
          },
        }
      : {}),
  };
}

function buildListWhere(query: ListLeadsQuery): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
  };

  if (query.stageId) where.stageId = query.stageId;
  if (query.pipelineId) where.pipelineId = query.pipelineId;
  if (query.ownerId) where.ownerId = query.ownerId;
  if (query.status) where.status = query.status;
  if (query.companyId) where.companyId = query.companyId;
  if (query.priorityMin !== undefined) where.priorityScore = { gte: query.priorityMin };
  if (query.q) {
    where.OR = [
      { company: { name: { contains: query.q, mode: 'insensitive' } } },
      { primaryContact: { firstName: { contains: query.q, mode: 'insensitive' } } },
      { primaryContact: { lastName: { contains: query.q, mode: 'insensitive' } } },
      { primaryContact: { email: { contains: query.q, mode: 'insensitive' } } },
    ];
  }

  return where;
}

function toCreateData(input: CreateLeadInput, stage: PipelineStage): Prisma.LeadCreateInput {
  return {
    company: { connect: { id: input.companyId } },
    pipeline: { connect: { id: input.pipelineId } },
    stage: { connect: { id: input.stageId } },
    owner: { connect: { id: input.ownerId } },
    ...(input.primaryContactId
      ? { primaryContact: { connect: { id: input.primaryContactId } } }
      : {}),
    source: input.source,
    status: toStatusFromStageKind(stage.kind),
    priorityManual: input.priorityManual ?? null,
    nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
  };
}

function toUpdateData(
  input: UpdateLeadInput,
  resolvedStatus?: 'open' | 'won' | 'lost',
): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = {};

  if (input.companyId !== undefined) data.company = { connect: { id: input.companyId } };
  if (input.ownerId !== undefined) data.owner = { connect: { id: input.ownerId } };
  if (input.primaryContactId !== undefined) {
    data.primaryContact = input.primaryContactId
      ? { connect: { id: input.primaryContactId } }
      : { disconnect: true };
  }
  if (input.stageId !== undefined) data.stage = { connect: { id: input.stageId } };
  if (input.source !== undefined) data.source = input.source;
  if (input.priorityManual !== undefined) data.priorityManual = input.priorityManual;
  if (input.nextActionAt !== undefined) data.nextActionAt = new Date(input.nextActionAt);
  if (input.status !== undefined) data.status = input.status;
  if (input.lostReason !== undefined) data.lostReason = input.lostReason;
  if (resolvedStatus !== undefined) data.status = resolvedStatus;

  return data;
}

const leadDetailInclude = {
  company: {
    select: {
      id: true,
      name: true,
      domain: true,
    },
  },
  primaryContact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  stage: {
    select: {
      id: true,
      name: true,
      kind: true,
      color: true,
      orderIndex: true,
    },
  },
  pipeline: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.LeadInclude;

export class LeadsService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async list(
    query: ListLeadsQuery,
  ): Promise<{ items: LeadDto[]; page: number; pageSize: number; total: number }> {
    const where = buildListWhere(query);
    const [items, total] = await this.db.$transaction([
      this.db.lead.findMany({
        where,
        include: leadDetailInclude,
        orderBy: [{ priorityScore: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.lead.count({ where }),
    ]);

    return {
      items: items.map((item) => toDto(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<LeadDto> {
    const row = await this.db.lead.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: leadDetailInclude,
    });
    if (!row) throw new LeadNotFoundError(id);
    return toDto(row);
  }

  async create(input: CreateLeadInput, actor: PublicUserDto): Promise<LeadDto> {
    void actor;
    const stage = await this.requireStageInPipeline(input.stageId, input.pipelineId);
    if (input.primaryContactId) {
      await this.ensureContactBelongsToCompany(input.primaryContactId, input.companyId);
    }

    const created = await this.db.lead.create({
      data: toCreateData(input, stage),
      include: leadDetailInclude,
    });
    return toDto(created);
  }

  async update(id: string, input: UpdateLeadInput, actor: PublicUserDto): Promise<LeadDto> {
    void actor;
    // TODO(roles): owner check when operator/viewer roles land
    const existing = await this.db.lead.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        stage: {
          select: {
            id: true,
            kind: true,
          },
        },
      },
    });
    if (!existing) throw new LeadNotFoundError(id);

    if (input.pipelineId !== undefined && input.pipelineId !== existing.pipelineId) {
      throw new InvalidLeadTransitionError('No se permite cambiar de pipeline en v1');
    }

    const companyId = input.companyId ?? existing.companyId;
    if (input.primaryContactId !== undefined && input.primaryContactId) {
      await this.ensureContactBelongsToCompany(input.primaryContactId, companyId);
    }

    let resolvedStatus: 'open' | 'won' | 'lost' | undefined;
    if (input.stageId !== undefined) {
      const stage = await this.requireStageInPipeline(input.stageId, existing.pipelineId);
      if (stage.kind === 'won' || stage.kind === 'lost') {
        resolvedStatus = stage.kind;
      }
    }

    const updated = await this.db.lead.update({
      where: { id },
      data: toUpdateData(input, resolvedStatus),
      include: leadDetailInclude,
    });
    return toDto(updated);
  }

  async markWon(id: string, actor: PublicUserDto): Promise<LeadDto> {
    void actor;
    const existing = await this.db.lead.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        stage: true,
      },
    });
    if (!existing) throw new LeadNotFoundError(id);

    const wonStage =
      existing.stage.kind === 'won'
        ? existing.stage
        : await this.findFirstStageByKind(existing.pipelineId, 'won');

    const updated = await this.db.lead.update({
      where: { id },
      data: {
        status: 'won',
        stage: existing.stage.kind === 'won' ? undefined : { connect: { id: wonStage.id } },
      },
      include: leadDetailInclude,
    });
    return toDto(updated);
  }

  async markLost(id: string, lostReason: string, actor: PublicUserDto): Promise<LeadDto> {
    void actor;
    const existing = await this.db.lead.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        stage: true,
      },
    });
    if (!existing) throw new LeadNotFoundError(id);

    const lostStage =
      existing.stage.kind === 'lost'
        ? existing.stage
        : await this.findFirstStageByKind(existing.pipelineId, 'lost');

    const updated = await this.db.lead.update({
      where: { id },
      data: {
        status: 'lost',
        lostReason,
        stage: existing.stage.kind === 'lost' ? undefined : { connect: { id: lostStage.id } },
      },
      include: leadDetailInclude,
    });
    return toDto(updated);
  }

  async softDelete(id: string, actor: PublicUserDto): Promise<void> {
    void actor;
    // TODO(roles): owner check when operator/viewer roles land
    const existing = await this.db.lead.findUnique({ where: { id } });
    if (!existing) throw new LeadNotFoundError(id);
    if (existing.deletedAt) return;

    await this.db.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async requireStageInPipeline(
    stageId: string,
    pipelineId: string,
  ): Promise<PipelineStage> {
    const stage = await this.db.pipelineStage.findUnique({ where: { id: stageId } });
    if (!stage || stage.pipelineId !== pipelineId) {
      throw new StageNotInPipelineError(stageId, pipelineId);
    }
    return stage;
  }

  private async ensureContactBelongsToCompany(contactId: string, companyId: string): Promise<void> {
    const contact = await this.db.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.companyId !== companyId) {
      throw new LeadCompanyMismatchError(contactId, companyId);
    }
  }

  private async findFirstStageByKind(
    pipelineId: string,
    kind: PipelineStage['kind'],
  ): Promise<PipelineStage> {
    const stage = await this.db.pipelineStage.findFirst({
      where: { pipelineId, kind },
      orderBy: { orderIndex: 'asc' },
    });
    if (!stage) {
      throw new InvalidLeadTransitionError(
        `El pipeline "${pipelineId}" no tiene un stage ${kind} disponible`,
      );
    }
    return stage;
  }
}

export const leadsService = new LeadsService();
