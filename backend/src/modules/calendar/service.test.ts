import type { CalendarEvent, Company, Contact, Lead, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/service.js';
import type { CalendarEventCreateInput } from './schemas.js';
import {
  CalendarEventNotFoundError,
  CalendarService,
  CalendarRelatedEntityNotFoundError,
  ForbiddenError,
} from './service.js';

interface FakeDb {
  calendarEvents: Map<string, CalendarEvent>;
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
  leads: Map<string, Lead>;
}

interface CalendarEventWhere {
  id?: string;
  deletedAt?: null;
  visibility?: CalendarEvent['visibility'];
  ownerId?: string;
  endsAt?: { gte?: Date };
  startsAt?: { lte?: Date };
  OR?: Array<{ visibility: 'general' } | { ownerId: string }>;
}

interface CalendarEventCreateData {
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  visibility: CalendarEvent['visibility'];
  relatedEntityType: CalendarEvent['relatedEntityType'];
  relatedEntityId: string | null;
  color: string | null;
  createdBy: { connect: { id: string } };
  owner?: { connect: { id: string } };
}

interface CalendarEventUpdateData {
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  allDay?: boolean;
  visibility?: CalendarEvent['visibility'];
  relatedEntityType?: CalendarEvent['relatedEntityType'];
  relatedEntityId?: string | null;
  color?: string | null;
  owner?: { connect: { id: string } } | { disconnect: true };
  deletedAt?: Date;
}

function buildFakeDb(): FakeDb {
  return {
    calendarEvents: new Map(),
    companies: new Map(),
    contacts: new Map(),
    leads: new Map(),
  };
}

function matchesCalendarEventWhere(row: CalendarEvent, where: CalendarEventWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.visibility !== undefined && row.visibility !== where.visibility) return false;
  if (where.ownerId !== undefined && row.ownerId !== where.ownerId) return false;
  if (where.endsAt?.gte && row.endsAt.getTime() < where.endsAt.gte.getTime()) return false;
  if (where.startsAt?.lte && row.startsAt.getTime() > where.startsAt.lte.getTime()) return false;
  if (
    where.OR &&
    !where.OR.some((clause) =>
      'visibility' in clause
        ? row.visibility === clause.visibility
        : row.ownerId === clause.ownerId,
    )
  ) {
    return false;
  }
  return true;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const calendarEventDelegate = {
    findMany: async ({ where }: { where: CalendarEventWhere; orderBy: unknown }) =>
      [...db.calendarEvents.values()]
        .filter((row) => matchesCalendarEventWhere(row, where))
        .sort(
          (a, b) =>
            a.startsAt.getTime() - b.startsAt.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        ),
    findFirst: async ({ where }: { where: CalendarEventWhere }) =>
      [...db.calendarEvents.values()].find((row) => matchesCalendarEventWhere(row, where)) ?? null,
    create: async ({ data }: { data: CalendarEventCreateData }) => {
      const now = new Date();
      const row = makeCalendarEvent({
        id: `calendar_${db.calendarEvents.size + 1}`,
        ownerId: data.owner?.connect.id ?? null,
        createdById: data.createdBy.connect.id,
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        allDay: data.allDay,
        visibility: data.visibility,
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
        color: data.color,
        createdAt: now,
        updatedAt: now,
      });
      db.calendarEvents.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: CalendarEventUpdateData }) => {
      const existing = db.calendarEvents.get(where.id);
      if (!existing) throw new Error('calendar event not found');
      const updated: CalendarEvent = {
        ...existing,
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        location: data.location ?? existing.location,
        startsAt: data.startsAt ?? existing.startsAt,
        endsAt: data.endsAt ?? existing.endsAt,
        allDay: data.allDay ?? existing.allDay,
        visibility: data.visibility ?? existing.visibility,
        relatedEntityType: data.relatedEntityType ?? existing.relatedEntityType,
        relatedEntityId: data.relatedEntityId ?? existing.relatedEntityId,
        color: data.color ?? existing.color,
        ownerId:
          data.owner === undefined
            ? existing.ownerId
            : 'connect' in data.owner
              ? data.owner.connect.id
              : null,
        deletedAt: data.deletedAt ?? existing.deletedAt,
        updatedAt: new Date(),
      };
      db.calendarEvents.set(updated.id, updated);
      return updated;
    },
  };

  const prisma = {
    calendarEvent: calendarEventDelegate,
    company: {
      findFirst: async ({ where }: { where: { id: string; deletedAt: null } }) =>
        [...db.companies.values()].find((row) => row.id === where.id && row.deletedAt === null) ??
        null,
    },
    contact: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; deletedAt: null; anonymizedAt: null };
      }) =>
        [...db.contacts.values()].find(
          (row) => row.id === where.id && row.deletedAt === null && row.anonymizedAt === null,
        ) ?? null,
    },
    lead: {
      findFirst: async ({ where }: { where: { id: string; deletedAt: null } }) =>
        [...db.leads.values()].find((row) => row.id === where.id && row.deletedAt === null) ?? null,
    },
  };

  return prisma as unknown as PrismaClient;
}

function makeCompany(input: Partial<Company> & { id: string; name: string; createdById: string }) {
  const now = new Date();
  return {
    id: input.id,
    name: input.name,
    website: input.website ?? null,
    domain: input.domain ?? null,
    industry: input.industry ?? null,
    icpVertical: input.icpVertical ?? null,
    country: input.country ?? 'ES',
    region: input.region ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    address: input.address ?? null,
    sizeSignal: input.sizeSignal ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    instagramHandle: input.instagramHandle ?? null,
    notes: input.notes ?? null,
    createdById: input.createdById,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  } satisfies Company;
}

function makeContact(
  input: Partial<Contact> & {
    id: string;
    firstName: string;
    createdById: string;
    consentStatus: Contact['consentStatus'];
  },
) {
  const now = new Date();
  return {
    id: input.id,
    companyId: input.companyId ?? null,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    roleTitle: input.roleTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    isPrimary: input.isPrimary ?? false,
    consentStatus: input.consentStatus,
    createdById: input.createdById,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    anonymizedAt: input.anonymizedAt ?? null,
    deletedAt: input.deletedAt ?? null,
  } satisfies Contact;
}

function makeLead(
  input: Partial<Lead> & {
    id: string;
    ownerId: string;
    pipelineId: string;
    stageId: string;
    companyId: string;
  },
) {
  const now = new Date();
  return {
    id: input.id,
    ownerId: input.ownerId,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    companyId: input.companyId,
    primaryContactId: input.primaryContactId ?? null,
    source: input.source ?? 'manual',
    status: input.status ?? 'open',
    priorityScore: input.priorityScore ?? 0,
    priorityManual: input.priorityManual ?? null,
    nextActionAt: input.nextActionAt ?? null,
    lostReason: input.lostReason ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  } satisfies Lead;
}

function makeCalendarEvent(
  input: Partial<CalendarEvent> & {
    id: string;
    createdById: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    visibility: CalendarEvent['visibility'];
  },
) {
  const now = new Date();
  return {
    id: input.id,
    ownerId: input.ownerId ?? null,
    createdById: input.createdById,
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDay: input.allDay,
    visibility: input.visibility,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    color: input.color ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  } satisfies CalendarEvent;
}

describe('CalendarService', () => {
  let db: FakeDb;
  let service: CalendarService;
  let auditRecord: ReturnType<typeof vi.fn<(entry: AuditEntry) => Promise<void>>>;

  beforeEach(() => {
    db = buildFakeDb();
    auditRecord = vi.fn(async () => undefined);
    service = new CalendarService(makePrismaMock(db), { record: auditRecord } as never);

    db.companies.set(
      'company_1',
      makeCompany({ id: 'company_1', name: 'HeyDay', createdById: 'user_alex' }),
    );
    db.contacts.set(
      'contact_1',
      makeContact({
        id: 'contact_1',
        firstName: 'Alex',
        companyId: 'company_1',
        createdById: 'user_alex',
        consentStatus: 'public_business_data_only',
      }),
    );
    db.leads.set(
      'lead_1',
      makeLead({
        id: 'lead_1',
        ownerId: 'user_alex',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        companyId: 'company_1',
      }),
    );
  });

  async function createEvent(overrides: Partial<CalendarEventCreateInput> = {}) {
    const input: CalendarEventCreateInput = {
      title: 'Discovery call',
      starts_at: '2026-05-05T09:00:00.000Z',
      ends_at: '2026-05-05T10:00:00.000Z',
      all_day: false,
      visibility: 'personal',
      description: 'Con cliente',
      location: 'Madrid',
      related_entity_type: 'lead',
      related_entity_id: 'lead_1',
      color: '#0044ff',
      ...overrides,
    };
    return service.create(input, 'user_alex');
  }

  function seedCalendarEvent(input: Parameters<typeof makeCalendarEvent>[0]) {
    const row = makeCalendarEvent(input);
    db.calendarEvents.set(row.id, row);
    return row;
  }

  it('list aplica RBAC y solo devuelve eventos propios + generales', async () => {
    seedCalendarEvent({
      id: 'general_event',
      createdById: 'user_alex',
      title: 'General',
      startsAt: new Date('2026-05-05T09:00:00.000Z'),
      endsAt: new Date('2026-05-05T10:00:00.000Z'),
      allDay: false,
      visibility: 'general',
    });
    seedCalendarEvent({
      id: 'alex_personal',
      ownerId: 'user_alex',
      createdById: 'user_alex',
      title: 'Alex',
      startsAt: new Date('2026-05-05T11:00:00.000Z'),
      endsAt: new Date('2026-05-05T12:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
    });
    seedCalendarEvent({
      id: 'alba_personal',
      ownerId: 'user_alba',
      createdById: 'user_alba',
      title: 'Alba',
      startsAt: new Date('2026-05-05T13:00:00.000Z'),
      endsAt: new Date('2026-05-05T14:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
    });

    const rows = await service.list(
      {
        from: '2026-05-05T00:00:00.000Z',
        to: '2026-05-05T23:59:59.000Z',
        visibility: 'both',
      },
      'user_alex',
    );

    expect(rows.map((row) => row.id)).toEqual(['general_event', 'alex_personal']);
  });

  it('create personal asigna owner_id al usuario actual', async () => {
    const created = await createEvent({ visibility: 'personal' });

    expect(created.owner_id).toBe('user_alex');
    expect(created.visibility).toBe('personal');
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'calendar_event.create', actorUserId: 'user_alex' }),
    );
  });

  it('create general deja owner_id en null', async () => {
    const created = await createEvent({ visibility: 'general' });

    expect(created.owner_id).toBeNull();
    expect(created.visibility).toBe('general');
  });

  it('create all_day normaliza fechas a medianoche UTC', async () => {
    const created = await createEvent({
      all_day: true,
      starts_at: '2026-05-07',
      ends_at: '2026-05-08',
      visibility: 'personal',
    });

    expect(created.starts_at).toBe('2026-05-07T00:00:00.000Z');
    expect(created.ends_at).toBe('2026-05-08T00:00:00.000Z');
    expect(created.all_day).toBe(true);
  });

  it('update devuelve 403 si un usuario intenta tocar un personal ajeno', async () => {
    seedCalendarEvent({
      id: 'calendar_private',
      ownerId: 'user_alba',
      createdById: 'user_alba',
      title: 'Privado',
      startsAt: new Date('2026-05-05T09:00:00.000Z'),
      endsAt: new Date('2026-05-05T10:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
    });

    await expect(
      service.update(
        'calendar_private',
        { title: 'Intento' },
        { id: 'user_alex', role: 'operator' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('delete devuelve 403 si un usuario no admin intenta borrar un general', async () => {
    seedCalendarEvent({
      id: 'calendar_general',
      createdById: 'user_alba',
      title: 'General',
      startsAt: new Date('2026-05-05T09:00:00.000Z'),
      endsAt: new Date('2026-05-05T10:00:00.000Z'),
      allDay: false,
      visibility: 'general',
    });

    await expect(
      service.softDelete('calendar_general', { id: 'user_alex', role: 'operator' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('update valida que ends_at sea mayor o igual que starts_at sobre el estado final', async () => {
    seedCalendarEvent({
      id: 'calendar_owned',
      ownerId: 'user_alex',
      createdById: 'user_alex',
      title: 'Propio',
      startsAt: new Date('2026-05-05T09:00:00.000Z'),
      endsAt: new Date('2026-05-05T10:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
    });

    await expect(
      service.update(
        'calendar_owned',
        { ends_at: '2026-05-05T08:00:00.000Z' },
        { id: 'user_alex', role: 'operator' },
      ),
    ).rejects.toThrow('Rango de fechas inválido');
  });

  it('list excluye soft delete', async () => {
    seedCalendarEvent({
      id: 'calendar_active',
      ownerId: 'user_alex',
      createdById: 'user_alex',
      title: 'Activo',
      startsAt: new Date('2026-05-05T09:00:00.000Z'),
      endsAt: new Date('2026-05-05T10:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
    });
    seedCalendarEvent({
      id: 'calendar_deleted',
      ownerId: 'user_alex',
      createdById: 'user_alex',
      title: 'Borrado',
      startsAt: new Date('2026-05-05T11:00:00.000Z'),
      endsAt: new Date('2026-05-05T12:00:00.000Z'),
      allDay: false,
      visibility: 'personal',
      deletedAt: new Date('2026-05-05T12:30:00.000Z'),
    });

    const rows = await service.list(
      {
        from: '2026-05-05T00:00:00.000Z',
        to: '2026-05-05T23:59:59.000Z',
        visibility: 'both',
      },
      'user_alex',
    );

    expect(rows.map((row) => row.id)).toEqual(['calendar_active']);
  });

  it('lanza CalendarEventNotFoundError si intenta borrar uno inexistente', async () => {
    await expect(
      service.softDelete('missing_event', { id: 'user_alex', role: 'admin' }),
    ).rejects.toBeInstanceOf(CalendarEventNotFoundError);
  });

  it('lanza CalendarRelatedEntityNotFoundError si la entidad relacionada no existe', async () => {
    await expect(
      createEvent({ related_entity_type: 'company', related_entity_id: 'missing_company' }),
    ).rejects.toBeInstanceOf(CalendarRelatedEntityNotFoundError);
  });
});
