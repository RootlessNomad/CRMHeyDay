import type { Activity, Company, Contact, Lead, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/service.js';
import type { ActivityCreateInput } from './schemas.js';
import {
  ActivitiesService,
  ActivityEntityNotFoundError,
  ActivityNotFoundError,
} from './service.js';

interface FakeDb {
  activities: Map<string, Activity>;
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
  leads: Map<string, Lead>;
}

interface ActivityWhere {
  id?: string;
  entityType?: Activity['entityType'];
  entityId?: string;
  kind?: Activity['kind'];
  ownerId?: string;
  completedAt?: null | { not: null };
  dueAt?: { gte?: Date; lte?: Date };
}

interface ActivityCreateData {
  entityType: Activity['entityType'];
  entityId: string;
  kind: Activity['kind'];
  title: string | null;
  body: string | null;
  owner: { connect: { id: string } };
  createdBy: { connect: { id: string } };
  dueAt: Date | null;
  completedAt: Date | null;
  remindAt: Date | null;
}

interface ActivityUpdateData {
  kind?: Activity['kind'];
  title?: string | null;
  body?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  remindAt?: Date | null;
  owner?: { connect: { id: string } };
}

function buildFakeDb(): FakeDb {
  return {
    activities: new Map(),
    companies: new Map(),
    contacts: new Map(),
    leads: new Map(),
  };
}

function matchesActivityWhere(row: Activity, where: ActivityWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.entityType !== undefined && row.entityType !== where.entityType) return false;
  if (where.entityId !== undefined && row.entityId !== where.entityId) return false;
  if (where.kind !== undefined && row.kind !== where.kind) return false;
  if (where.ownerId !== undefined && row.ownerId !== where.ownerId) return false;
  if (where.completedAt === null && row.completedAt !== null) return false;
  if (where.completedAt && row.completedAt === null) return false;
  if (where.dueAt?.gte && (!row.dueAt || row.dueAt.getTime() < where.dueAt.gte.getTime())) {
    return false;
  }
  if (where.dueAt?.lte && (!row.dueAt || row.dueAt.getTime() > where.dueAt.lte.getTime())) {
    return false;
  }
  return true;
}

function compareActivities(a: Activity, b: Activity): number {
  if (a.dueAt === null && b.dueAt === null) return b.createdAt.getTime() - a.createdAt.getTime();
  if (a.dueAt === null) return 1;
  if (b.dueAt === null) return -1;
  const byDue = a.dueAt.getTime() - b.dueAt.getTime();
  if (byDue !== 0) return byDue;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function applyActivityUpdate(existing: Activity, data: ActivityUpdateData): Activity {
  const updated: Activity = { ...existing, updatedAt: new Date() };
  if (data.kind !== undefined) updated.kind = data.kind;
  if (data.title !== undefined) updated.title = data.title;
  if (data.body !== undefined) updated.body = data.body;
  if (data.dueAt !== undefined) updated.dueAt = data.dueAt;
  if (data.completedAt !== undefined) updated.completedAt = data.completedAt;
  if (data.remindAt !== undefined) updated.remindAt = data.remindAt;
  if (data.owner !== undefined) updated.ownerId = data.owner.connect.id;
  return updated;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const activityDelegate = {
    findUnique: async ({ where }: { where: { id: string } }) => db.activities.get(where.id) ?? null,
    findMany: async ({
      where,
      skip,
      take,
    }: {
      where: ActivityWhere;
      orderBy: unknown;
      skip: number;
      take: number;
    }) =>
      [...db.activities.values()]
        .filter((row) => matchesActivityWhere(row, where))
        .sort(compareActivities)
        .slice(skip, skip + take),
    count: async ({ where }: { where: ActivityWhere }) =>
      [...db.activities.values()].filter((row) => matchesActivityWhere(row, where)).length,
    create: async ({ data }: { data: ActivityCreateData }) => {
      const now = new Date();
      const row = makeActivity({
        id: `activity_${db.activities.size + 1}`,
        entityType: data.entityType,
        entityId: data.entityId,
        kind: data.kind,
        title: data.title,
        body: data.body,
        ownerId: data.owner.connect.id,
        createdById: data.createdBy.connect.id,
        dueAt: data.dueAt,
        completedAt: data.completedAt,
        remindAt: data.remindAt,
        createdAt: now,
        updatedAt: now,
      });
      db.activities.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: ActivityUpdateData }) => {
      const existing = db.activities.get(where.id);
      if (!existing) throw new Error('activity not found');
      const updated = applyActivityUpdate(existing, data);
      db.activities.set(updated.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = db.activities.get(where.id);
      if (!existing) throw new Error('activity not found');
      db.activities.delete(where.id);
      return existing;
    },
  };

  const prisma = {
    activity: activityDelegate,
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
    $transaction: async <T>(input: Promise<T>[]) => Promise.all(input),
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

function makeActivity(
  input: Partial<Activity> & {
    id: string;
    entityType: Activity['entityType'];
    entityId: string;
    kind: Activity['kind'];
    ownerId: string;
    createdById: string;
  },
) {
  const now = new Date();
  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    kind: input.kind,
    title: input.title ?? null,
    body: input.body ?? null,
    ownerId: input.ownerId,
    dueAt: input.dueAt ?? null,
    completedAt: input.completedAt ?? null,
    remindAt: input.remindAt ?? null,
    createdById: input.createdById,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  } satisfies Activity;
}

describe('ActivitiesService', () => {
  let db: FakeDb;
  let service: ActivitiesService;
  let auditRecord: ReturnType<typeof vi.fn<(entry: AuditEntry) => Promise<void>>>;

  beforeEach(() => {
    db = buildFakeDb();
    auditRecord = vi.fn(async () => undefined);
    service = new ActivitiesService(makePrismaMock(db), { record: auditRecord } as never);
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
        ownerId: 'user_owner',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        companyId: 'company_1',
      }),
    );
  });

  async function createActivity(overrides: Partial<ActivityCreateInput> = {}) {
    const input: ActivityCreateInput = {
      entity_type: 'company',
      entity_id: 'company_1',
      kind: 'task',
      title: 'Follow up',
      body: 'Call tomorrow',
      due_at: '2026-04-29T10:00:00.000Z',
      remind_at: '2026-04-29T09:00:00.000Z',
      completed_at: undefined,
      owner_id: 'user_owner',
      ...overrides,
    };
    return service.create(input, 'user_alex');
  }

  function seedActivity(input: Parameters<typeof makeActivity>[0]) {
    const row = makeActivity(input);
    db.activities.set(row.id, row);
    return row;
  }

  it('list aplica filtros, paginación y ordena por due_at asc con nulls last y created_at desc', async () => {
    seedActivity({
      id: 'activity_older_same_due',
      entityType: 'company',
      entityId: 'company_1',
      kind: 'task',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      dueAt: new Date('2026-05-02T10:00:00.000Z'),
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
      updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    });
    seedActivity({
      id: 'activity_newer_same_due',
      entityType: 'company',
      entityId: 'company_1',
      kind: 'task',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      dueAt: new Date('2026-05-02T10:00:00.000Z'),
      createdAt: new Date('2026-04-21T10:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    });
    seedActivity({
      id: 'activity_first_due',
      entityType: 'company',
      entityId: 'company_1',
      kind: 'task',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      dueAt: new Date('2026-05-01T10:00:00.000Z'),
    });
    seedActivity({
      id: 'activity_null_due',
      entityType: 'company',
      entityId: 'company_1',
      kind: 'task',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      dueAt: null,
    });
    seedActivity({
      id: 'activity_other_kind',
      entityType: 'company',
      entityId: 'company_1',
      kind: 'note',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      dueAt: new Date('2026-05-01T12:00:00.000Z'),
      completedAt: new Date('2026-05-01T13:00:00.000Z'),
    });

    const filtered = await service.list({
      entity_type: 'company',
      entity_id: 'company_1',
      kind: 'task',
      owner_id: 'user_owner',
      completed: 'false',
      due_from: '2026-05-01T00:00:00.000Z',
      due_to: '2026-05-31T23:59:59.000Z',
      page: 1,
      page_size: 2,
    });

    expect(filtered.total).toBe(3);
    expect(filtered.rows.map((row) => row.id)).toEqual([
      'activity_first_due',
      'activity_newer_same_due',
    ]);
    expect(filtered.page_size).toBe(2);

    const secondPage = await service.list({
      entity_type: 'company',
      entity_id: 'company_1',
      page: 2,
      page_size: 2,
    });
    expect(secondPage.rows).toHaveLength(2);
    expect(secondPage.rows.at(-1)?.id).toBe('activity_older_same_due');
  });

  it('list filtra completed=true', async () => {
    seedActivity({
      id: 'activity_done',
      entityType: 'contact',
      entityId: 'contact_1',
      kind: 'call_log',
      ownerId: 'user_owner',
      createdById: 'user_alex',
      completedAt: new Date('2026-05-01T11:00:00.000Z'),
    });
    seedActivity({
      id: 'activity_open',
      entityType: 'contact',
      entityId: 'contact_1',
      kind: 'call_log',
      ownerId: 'user_owner',
      createdById: 'user_alex',
    });

    const list = await service.list({
      entity_type: 'contact',
      entity_id: 'contact_1',
      completed: 'true',
      page: 1,
      page_size: 20,
    });

    expect(list.total).toBe(1);
    expect(list.rows[0]?.id).toBe('activity_done');
  });

  it('getById devuelve la actividad', async () => {
    const created = await createActivity();
    const found = await service.getById(created.id);
    expect(found.id).toBe(created.id);
  });

  it('getById lanza ActivityNotFoundError si no existe', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(ActivityNotFoundError);
  });

  it('create crea actividad y escribe audit mínimo sin title/body', async () => {
    const created = await createActivity({ title: 'Sensitive', body: 'Private note' });

    expect(created.owner_id).toBe('user_owner');
    expect(created.created_by_id).toBe('user_alex');
    expect(auditRecord).toHaveBeenCalledTimes(1);
    expect(auditRecord.mock.calls[0]?.[0]).toMatchObject({
      action: 'activity.create',
      actorUserId: 'user_alex',
      entityType: 'activity',
      entityId: created.id,
      metadata: {
        kind: 'task',
        entity_type: 'company',
        entity_id: 'company_1',
      },
      ip: null,
    });
    expect(JSON.stringify(auditRecord.mock.calls[0]?.[0].metadata)).not.toContain('Sensitive');
    expect(JSON.stringify(auditRecord.mock.calls[0]?.[0].metadata)).not.toContain('Private note');
  });

  it('create usa createdById como owner fallback si owner_id no viene', async () => {
    const created = await createActivity({ owner_id: undefined });
    expect(created.owner_id).toBe('user_alex');
  });

  it('create falla para company inexistente o borrada', async () => {
    await expect(
      createActivity({ entity_type: 'company', entity_id: 'company_missing' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);

    db.companies.set(
      'company_deleted',
      makeCompany({
        id: 'company_deleted',
        name: 'Deleted',
        createdById: 'user_alex',
        deletedAt: new Date(),
      }),
    );

    await expect(
      createActivity({ entity_type: 'company', entity_id: 'company_deleted' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);
  });

  it('create falla para contact inexistente', async () => {
    await expect(
      createActivity({ entity_type: 'contact', entity_id: 'contact_missing' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);
  });

  it('create bloquea contacto anonimizado', async () => {
    db.contacts.set(
      'contact_anon',
      makeContact({
        id: 'contact_anon',
        firstName: 'Anon',
        createdById: 'user_alex',
        consentStatus: 'revoked',
        anonymizedAt: new Date(),
      }),
    );

    await expect(
      createActivity({ entity_type: 'contact', entity_id: 'contact_anon' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);
  });

  it('create falla para lead inexistente o borrado', async () => {
    await expect(
      createActivity({ entity_type: 'lead', entity_id: 'lead_missing' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);

    db.leads.set(
      'lead_deleted',
      makeLead({
        id: 'lead_deleted',
        ownerId: 'user_owner',
        pipelineId: 'pipeline_1',
        stageId: 'stage_1',
        companyId: 'company_1',
        deletedAt: new Date(),
      }),
    );

    await expect(
      createActivity({ entity_type: 'lead', entity_id: 'lead_deleted' }),
    ).rejects.toBeInstanceOf(ActivityEntityNotFoundError);
  });

  it('update modifica campos permitidos y registra audit', async () => {
    const created = await createActivity();

    const updated = await service.update(created.id, {
      kind: 'meeting_log',
      title: 'Updated',
      completed_at: '2026-04-30T10:00:00.000Z',
      owner_id: 'user_new_owner',
    });

    expect(updated.kind).toBe('meeting_log');
    expect(updated.title).toBe('Updated');
    expect(updated.completed_at).toBe('2026-04-30T10:00:00.000Z');
    expect(updated.owner_id).toBe('user_new_owner');
    expect(auditRecord).toHaveBeenCalledTimes(2);
  });

  it('update lanza ActivityNotFoundError si no existe', async () => {
    await expect(service.update('missing', { title: 'Nope' })).rejects.toBeInstanceOf(
      ActivityNotFoundError,
    );
  });

  it('delete elimina duro y registra audit', async () => {
    const created = await createActivity();

    await service.delete(created.id);

    expect(db.activities.has(created.id)).toBe(false);
    expect(auditRecord).toHaveBeenCalledTimes(2);
    expect(auditRecord.mock.calls[1]?.[0]).toMatchObject({
      action: 'activity.delete',
      entityId: created.id,
      metadata: {
        kind: 'task',
        entity_type: 'company',
        entity_id: 'company_1',
      },
    });
  });

  it('delete lanza ActivityNotFoundError si no existe', async () => {
    await expect(service.delete('missing')).rejects.toBeInstanceOf(ActivityNotFoundError);
  });
});
