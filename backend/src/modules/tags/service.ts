import type { PrismaClient, Tag, TaggableEntityType } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  TagAssignInput,
  TagCreateInput,
  TagDto,
  TagListQuery,
  TagUpdateInput,
} from './schemas.js';

export class TagNotFoundError extends Error {
  constructor(id: string, message = `Tag "${id}" no encontrada`) {
    super(message);
    this.name = 'TagNotFoundError';
  }
}

export class TagNameConflictError extends Error {
  constructor(name: string) {
    super(`Ya existe una tag con el nombre "${name}"`);
    this.name = 'TagNameConflictError';
  }
}

export class TagAssignmentEntityNotFoundError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`Entidad "${entityType}" con id "${entityId}" no encontrada`);
    this.name = 'TagAssignmentEntityNotFoundError';
  }
}

export class TagAssignmentConflictError extends Error {
  constructor(tagId: string, entityType: string, entityId: string) {
    super(`La tag "${tagId}" ya está asignada a "${entityType}" con id "${entityId}"`);
    this.name = 'TagAssignmentConflictError';
  }
}

function toDto(row: Tag): TagDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    kind: row.kind,
    created_at: row.createdAt.toISOString(),
  };
}

function toCreateData(input: TagCreateInput): Prisma.TagCreateInput {
  return {
    name: input.name,
    color: input.color ?? null,
    kind: input.kind,
  };
}

function toUpdateData(patch: TagUpdateInput): Prisma.TagUpdateInput {
  const data: Prisma.TagUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.kind !== undefined) data.kind = patch.kind;
  return data;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002')
  );
}

export class TagsService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async list(query: TagListQuery): Promise<TagDto[]> {
    const where: Prisma.TagWhereInput = {};
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };
    if (query.kind) where.kind = query.kind;

    const rows = await this.db.tag.findMany({ where, orderBy: { name: 'asc' } });
    return rows.map(toDto);
  }

  async getById(id: string): Promise<TagDto> {
    const row = await this.db.tag.findUnique({ where: { id } });
    if (!row) throw new TagNotFoundError(id);
    return toDto(row);
  }

  async create(input: TagCreateInput): Promise<TagDto> {
    try {
      const created = await this.db.tag.create({ data: toCreateData(input) });

      await this.audit.record({
        action: 'tag.create',
        actorUserId: null,
        entityType: 'tag',
        entityId: created.id,
        metadata: {
          name: created.name,
          kind: created.kind,
        } satisfies Prisma.InputJsonValue,
        ip: null,
      });

      return toDto(created);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new TagNameConflictError(input.name);
      throw error;
    }
  }

  async update(id: string, patch: TagUpdateInput): Promise<TagDto> {
    const existing = await this.db.tag.findUnique({ where: { id } });
    if (!existing) throw new TagNotFoundError(id);

    try {
      const updated = await this.db.tag.update({ where: { id }, data: toUpdateData(patch) });

      await this.audit.record({
        action: 'tag.update',
        actorUserId: null,
        entityType: 'tag',
        entityId: updated.id,
        metadata: {
          name: updated.name,
          kind: updated.kind,
        } satisfies Prisma.InputJsonValue,
        ip: null,
      });

      return toDto(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TagNameConflictError(patch.name ?? existing.name);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const existing = await this.db.tag.findUnique({ where: { id } });
    if (!existing) throw new TagNotFoundError(id);

    await this.db.tag.delete({ where: { id } });

    await this.audit.record({
      action: 'tag.delete',
      actorUserId: null,
      entityType: 'tag',
      entityId: id,
      metadata: {
        name: existing.name,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });
  }

  async assign(input: TagAssignInput): Promise<TagDto> {
    const tag = await this.db.tag.findUnique({ where: { id: input.tag_id } });
    if (!tag) throw new TagNotFoundError(input.tag_id);

    await this.ensureEntityExists(input.entity_type, input.entity_id);

    try {
      await this.db.taggable.create({
        data: {
          tagId: input.tag_id,
          entityType: input.entity_type,
          entityId: input.entity_id,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new TagAssignmentConflictError(input.tag_id, input.entity_type, input.entity_id);
      }
      throw error;
    }

    await this.audit.record({
      action: 'tag.assign',
      actorUserId: null,
      entityType: 'tag',
      entityId: tag.id,
      metadata: {
        tag_id: input.tag_id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });

    return toDto(tag);
  }

  async unassign(input: TagAssignInput): Promise<void> {
    await this.db.taggable.deleteMany({
      where: {
        tagId: input.tag_id,
        entityType: input.entity_type,
        entityId: input.entity_id,
      },
    });

    await this.audit.record({
      action: 'tag.unassign',
      actorUserId: null,
      entityType: 'tag',
      entityId: input.tag_id,
      metadata: {
        tag_id: input.tag_id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });
  }

  async getForEntity(entityType: TaggableEntityType, entityId: string): Promise<TagDto[]> {
    const rows = await this.db.taggable.findMany({
      where: { entityType, entityId },
      include: { tag: true },
    });

    return rows
      .map((row) => toDto(row.tag))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }

  private async ensureEntityExists(
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<void> {
    const existing =
      entityType === 'company'
        ? await this.db.company.findFirst({ where: { id: entityId, deletedAt: null } })
        : entityType === 'contact'
          ? await this.db.contact.findFirst({
              where: { id: entityId, deletedAt: null, anonymizedAt: null },
            })
          : entityType === 'lead'
            ? await this.db.lead.findFirst({
                where: { id: entityId, deletedAt: null, company: { deletedAt: null } },
              })
            : null;

    if (entityType === 'content_item') {
      // TODO(M5): habilitar tagging de content items cuando exista el módulo correspondiente.
      throw new TagAssignmentEntityNotFoundError(entityType, entityId);
    }

    if (!existing) throw new TagAssignmentEntityNotFoundError(entityType, entityId);
  }
}

export const tagsService = new TagsService();
