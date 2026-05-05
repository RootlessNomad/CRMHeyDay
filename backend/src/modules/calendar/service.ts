import type {
  CalendarEvent,
  CalendarRelatedEntityType,
  CalendarVisibility,
  Company,
  Contact,
  Lead,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { ERROR_CODES } from '@heyday/shared';

import { AuthError } from '../../core/auth/errors.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { ActivityEntityNotFoundError, ActivityNotFoundError } from '../activities/service.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  CalendarEventCreateInput,
  CalendarEventDto,
  CalendarEventListQuery,
  CalendarEventUpdateInput,
} from './schemas.js';
import { parseCalendarEventInputDate } from './schemas.js';

interface CalendarActor {
  id: string;
  role: string;
}

interface ResolvedCalendarEventValues {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  visibility: CalendarVisibility;
  relatedEntityType: CalendarRelatedEntityType | null;
  relatedEntityId: string | null;
  color: string | null;
  ownerId: string | null;
}

type RelatedEntityRecord = Company | Contact | Lead;

export class CalendarEventNotFoundError extends ActivityNotFoundError {
  constructor(id: string) {
    super(id, `Evento de calendario "${id}" no encontrado`);
    this.name = 'CalendarEventNotFoundError';
  }
}

export class CalendarRelatedEntityNotFoundError extends ActivityEntityNotFoundError {
  constructor(entityType: string, entityId: string) {
    super(entityType, entityId);
    this.name = 'CalendarRelatedEntityNotFoundError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = 'FORBIDDEN') {
    super(ERROR_CODES.FORBIDDEN, message, 403);
    this.name = 'ForbiddenError';
  }
}

function toDto(row: CalendarEvent): CalendarEventDto {
  return {
    id: row.id,
    owner_id: row.ownerId,
    created_by_id: row.createdById,
    title: row.title,
    description: row.description,
    location: row.location,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    all_day: row.allDay,
    visibility: row.visibility,
    related_entity_type: row.relatedEntityType,
    related_entity_id: row.relatedEntityId,
    color: row.color,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function resolveCalendarEventValues(
  input: {
    title: string;
    description?: string | undefined;
    location?: string | undefined;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    visibility: CalendarVisibility;
    related_entity_type?: CalendarRelatedEntityType | undefined;
    related_entity_id?: string | undefined;
    color?: string | undefined;
  },
  ownerId: string,
): ResolvedCalendarEventValues {
  const startsAt = parseCalendarEventInputDate(input.starts_at, input.all_day);
  const endsAt = parseCalendarEventInputDate(input.ends_at, input.all_day);

  if (!startsAt || !endsAt || endsAt.getTime() < startsAt.getTime()) {
    throw new Error('Rango de fechas inválido');
  }

  return {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startsAt,
    endsAt,
    allDay: input.all_day,
    visibility: input.visibility,
    relatedEntityType: input.related_entity_type ?? null,
    relatedEntityId: input.related_entity_id ?? null,
    color: input.color ?? null,
    ownerId: input.visibility === 'personal' ? ownerId : null,
  };
}

function toCreateData(
  values: ResolvedCalendarEventValues,
  createdById: string,
): Prisma.CalendarEventCreateInput {
  return {
    title: values.title,
    description: values.description,
    location: values.location,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    allDay: values.allDay,
    visibility: values.visibility,
    relatedEntityType: values.relatedEntityType,
    relatedEntityId: values.relatedEntityId,
    color: values.color,
    createdBy: { connect: { id: createdById } },
    ...(values.ownerId ? { owner: { connect: { id: values.ownerId } } } : {}),
  };
}

function toUpdateData(values: ResolvedCalendarEventValues): Prisma.CalendarEventUpdateInput {
  return {
    title: values.title,
    description: values.description,
    location: values.location,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    allDay: values.allDay,
    visibility: values.visibility,
    relatedEntityType: values.relatedEntityType,
    relatedEntityId: values.relatedEntityId,
    color: values.color,
    owner: values.ownerId ? { connect: { id: values.ownerId } } : { disconnect: true },
  };
}

function buildDiffMetadata(existing: CalendarEvent, updated: CalendarEvent): Prisma.InputJsonValue {
  const changes: Record<
    string,
    { before: string | boolean | null; after: string | boolean | null }
  > = {};

  const fields = [
    ['title', existing.title, updated.title],
    ['description', existing.description, updated.description],
    ['location', existing.location, updated.location],
    ['starts_at', existing.startsAt.toISOString(), updated.startsAt.toISOString()],
    ['ends_at', existing.endsAt.toISOString(), updated.endsAt.toISOString()],
    ['all_day', existing.allDay, updated.allDay],
    ['visibility', existing.visibility, updated.visibility],
    ['owner_id', existing.ownerId, updated.ownerId],
    ['related_entity_type', existing.relatedEntityType, updated.relatedEntityType],
    ['related_entity_id', existing.relatedEntityId, updated.relatedEntityId],
    ['color', existing.color, updated.color],
  ] as const;

  for (const [field, before, after] of fields) {
    if (before !== after) {
      changes[field] = { before, after };
    }
  }

  return {
    visibility: updated.visibility,
    related_entity_type: updated.relatedEntityType,
    related_entity_id: updated.relatedEntityId,
    changes,
  } satisfies Prisma.InputJsonValue;
}

export class CalendarService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async list(query: CalendarEventListQuery, currentUserId: string): Promise<CalendarEventDto[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const where: Prisma.CalendarEventWhereInput = {
      deletedAt: null,
      endsAt: { gte: from },
      startsAt: { lte: to },
      OR: [{ visibility: 'general' }, { ownerId: currentUserId }],
      ...(query.visibility === 'personal'
        ? { visibility: 'personal', ownerId: currentUserId }
        : query.visibility === 'general'
          ? { visibility: 'general' }
          : {}),
    };

    const rows = await this.db.calendarEvent.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map(toDto);
  }

  async create(input: CalendarEventCreateInput, createdById: string): Promise<CalendarEventDto> {
    const values = resolveCalendarEventValues(input, createdById);
    await this.ensureRelatedEntityExists(values.relatedEntityType, values.relatedEntityId);

    const created = await this.db.calendarEvent.create({
      data: toCreateData(values, createdById),
    });

    await this.audit.record({
      action: 'calendar_event.create',
      actorUserId: createdById,
      entityType: 'calendar_event',
      entityId: created.id,
      metadata: {
        visibility: created.visibility,
        owner_id: created.ownerId,
        related_entity_type: created.relatedEntityType,
        related_entity_id: created.relatedEntityId,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });

    return toDto(created);
  }

  async update(
    id: string,
    patch: CalendarEventUpdateInput,
    actor: CalendarActor,
  ): Promise<CalendarEventDto> {
    const existing = await this.db.calendarEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new CalendarEventNotFoundError(id);

    this.assertCanMutate(existing, actor);

    const mergedInput = {
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description ?? undefined,
      location: patch.location ?? existing.location ?? undefined,
      starts_at: patch.starts_at ?? existing.startsAt.toISOString(),
      ends_at: patch.ends_at ?? existing.endsAt.toISOString(),
      all_day: patch.all_day ?? existing.allDay,
      visibility: patch.visibility ?? existing.visibility,
      related_entity_type: patch.related_entity_type ?? existing.relatedEntityType ?? undefined,
      related_entity_id: patch.related_entity_id ?? existing.relatedEntityId ?? undefined,
      color: patch.color ?? existing.color ?? undefined,
    } satisfies CalendarEventCreateInput;

    if (mergedInput.visibility === 'general' && actor.role !== 'admin') {
      throw new ForbiddenError();
    }

    const values = resolveCalendarEventValues(mergedInput, actor.id);
    await this.ensureRelatedEntityExists(values.relatedEntityType, values.relatedEntityId);

    const updated = await this.db.calendarEvent.update({
      where: { id },
      data: toUpdateData(values),
    });

    await this.audit.record({
      action: 'calendar_event.update',
      actorUserId: actor.id,
      entityType: 'calendar_event',
      entityId: updated.id,
      metadata: buildDiffMetadata(existing, updated),
      ip: null,
    });

    return toDto(updated);
  }

  async softDelete(id: string, actor: CalendarActor): Promise<void> {
    const existing = await this.db.calendarEvent.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new CalendarEventNotFoundError(id);

    this.assertCanMutate(existing, actor);

    await this.db.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'calendar_event.delete',
      actorUserId: actor.id,
      entityType: 'calendar_event',
      entityId: id,
      metadata: {
        visibility: existing.visibility,
        owner_id: existing.ownerId,
        related_entity_type: existing.relatedEntityType,
        related_entity_id: existing.relatedEntityId,
      } satisfies Prisma.InputJsonValue,
      ip: null,
    });
  }

  private assertCanMutate(existing: CalendarEvent, actor: CalendarActor): void {
    if (existing.visibility === 'personal' && existing.ownerId === actor.id) return;
    if (existing.visibility === 'general' && actor.role === 'admin') return;
    throw new ForbiddenError();
  }

  private async ensureRelatedEntityExists(
    entityType: CalendarRelatedEntityType | null,
    entityId: string | null,
  ): Promise<void> {
    if (!entityType && !entityId) return;
    if (!entityType || !entityId) {
      throw new CalendarRelatedEntityNotFoundError(entityType ?? 'unknown', entityId ?? 'unknown');
    }

    const existing: RelatedEntityRecord | null =
      entityType === 'company'
        ? await this.db.company.findFirst({ where: { id: entityId, deletedAt: null } })
        : entityType === 'contact'
          ? await this.db.contact.findFirst({
              where: { id: entityId, deletedAt: null, anonymizedAt: null },
            })
          : await this.db.lead.findFirst({ where: { id: entityId, deletedAt: null } });

    if (!existing) throw new CalendarRelatedEntityNotFoundError(entityType, entityId);
  }
}

export const calendarService = new CalendarService();
