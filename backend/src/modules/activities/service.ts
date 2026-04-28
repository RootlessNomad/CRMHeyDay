import type { Activity, Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  ActivityCreateInput,
  ActivityDto,
  ActivityListQuery,
  ActivityUpdateInput,
} from './schemas.js';

export class ActivityNotFoundError extends Error {
  constructor(id: string, message = `Actividad "${id}" no encontrada`) {
    super(message);
    this.name = 'ActivityNotFoundError';
  }
}

export class ActivityEntityNotFoundError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`Entidad "${entityType}" con id "${entityId}" no encontrada`);
    this.name = 'ActivityEntityNotFoundError';
  }
}

function toDto(row: Activity): ActivityDto {
  return {
    id: row.id,
    entity_type: row.entityType,
    entity_id: row.entityId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    owner_id: row.ownerId,
    due_at: row.dueAt?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    remind_at: row.remindAt?.toISOString() ?? null,
    created_by_id: row.createdById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toCreateData(input: ActivityCreateInput, createdById: string): Prisma.ActivityCreateInput {
  return {
    entityType: input.entity_type,
    entityId: input.entity_id,
    kind: input.kind,
    title: input.title ?? null,
    body: input.body ?? null,
    dueAt: input.due_at ? new Date(input.due_at) : null,
    remindAt: input.remind_at ? new Date(input.remind_at) : null,
    completedAt: input.completed_at ? new Date(input.completed_at) : null,
    owner: { connect: { id: input.owner_id ?? createdById } },
    createdBy: { connect: { id: createdById } },
  };
}

function toUpdateData(patch: ActivityUpdateInput): Prisma.ActivityUpdateInput {
  const data: Prisma.ActivityUpdateInput = {};
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.title !== undefined) data.title = patch.title ?? null;
  if (patch.body !== undefined) data.body = patch.body ?? null;
  if (patch.due_at !== undefined) data.dueAt = patch.due_at ? new Date(patch.due_at) : null;
  if (patch.remind_at !== undefined) {
    data.remindAt = patch.remind_at ? new Date(patch.remind_at) : null;
  }
  if (patch.completed_at !== undefined) {
    data.completedAt = patch.completed_at ? new Date(patch.completed_at) : null;
  }
  if (patch.owner_id !== undefined) data.owner = { connect: { id: patch.owner_id } };
  return data;
}

export class ActivitiesService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async list(
    query: ActivityListQuery,
  ): Promise<{ rows: ActivityDto[]; total: number; page: number; page_size: number }> {
    const where: Prisma.ActivityWhereInput = {
      entityType: query.entity_type,
      entityId: query.entity_id,
    };
    if (query.kind) where.kind = query.kind;
    if (query.owner_id) where.ownerId = query.owner_id;
    if (query.completed === 'true') where.completedAt = { not: null };
    if (query.completed === 'false') where.completedAt = null;
    if (query.due_from || query.due_to) {
      where.dueAt = {
        ...(query.due_from ? { gte: new Date(query.due_from) } : {}),
        ...(query.due_to ? { lte: new Date(query.due_to) } : {}),
      };
    }

    const [rows, total] = await this.db.$transaction([
      this.db.activity.findMany({
        where,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.db.activity.count({ where }),
    ]);

    return { rows: rows.map(toDto), total, page: query.page, page_size: query.page_size };
  }

  async getById(id: string): Promise<ActivityDto> {
    const row = await this.db.activity.findUnique({ where: { id } });
    if (!row) throw new ActivityNotFoundError(id);
    return toDto(row);
  }

  async create(input: ActivityCreateInput, createdById: string): Promise<ActivityDto> {
    await this.ensureEntityExists(input.entity_type, input.entity_id);

    const created = await this.db.activity.create({ data: toCreateData(input, createdById) });

    await this.audit.record({
      action: 'activity.create',
      actorUserId: createdById,
      entityType: 'activity',
      entityId: created.id,
      metadata: {
        kind: created.kind,
        entity_type: created.entityType,
        entity_id: created.entityId,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });

    return toDto(created);
  }

  async update(id: string, patch: ActivityUpdateInput): Promise<ActivityDto> {
    const existing = await this.db.activity.findUnique({ where: { id } });
    if (!existing) throw new ActivityNotFoundError(id);

    // TODO(roles): aplicar controles de ownership/RBAC cuando exista la matriz de permisos.
    const updated = await this.db.activity.update({ where: { id }, data: toUpdateData(patch) });

    await this.audit.record({
      action: 'activity.update',
      actorUserId: null,
      entityType: 'activity',
      entityId: updated.id,
      metadata: {
        kind: updated.kind,
        entity_type: updated.entityType,
        entity_id: updated.entityId,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });

    return toDto(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db.activity.findUnique({ where: { id } });
    if (!existing) throw new ActivityNotFoundError(id);

    // TODO(roles): validar autorización de borrado cuando exista RBAC.
    await this.db.activity.delete({ where: { id } });

    await this.audit.record({
      action: 'activity.delete',
      actorUserId: null,
      entityType: 'activity',
      entityId: id,
      metadata: {
        kind: existing.kind,
        entity_type: existing.entityType,
        entity_id: existing.entityId,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });
  }

  private async ensureEntityExists(
    entityType: ActivityCreateInput['entity_type'],
    entityId: string,
  ): Promise<void> {
    const existing =
      entityType === 'company'
        ? await this.db.company.findFirst({ where: { id: entityId, deletedAt: null } })
        : entityType === 'contact'
          ? await this.db.contact.findFirst({
              where: { id: entityId, deletedAt: null, anonymizedAt: null },
            })
          : await this.db.lead.findFirst({ where: { id: entityId, deletedAt: null } });

    if (!existing) throw new ActivityEntityNotFoundError(entityType, entityId);
  }
}

export const activitiesService = new ActivitiesService();
