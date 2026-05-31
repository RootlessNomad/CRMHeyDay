import type {
  Company,
  Contact,
  Lead,
  Pipeline,
  PipelineStage,
  PrismaClient,
  User,
} from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PublicUserDto } from '../auth/service.js';
import {
  InvalidLeadTransitionError,
  LeadCompanyMismatchError,
  LeadNotFoundError,
  StageNotInPipelineError,
} from './domain.js';
import type { CreateLeadInput } from './schemas.js';
import { LeadsService } from './service.js';

interface FakeDb {
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
  pipelines: Map<string, Pipeline>;
  stages: Map<string, PipelineStage>;
  leads: Map<string, Lead>;
  users: Map<string, User>;
}

interface LeadWhere {
  id?: string;
  companyId?: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  status?: Lead['status'];
  deletedAt?: null;
  priorityScore?: { gte: number };
  OR?: Array<{
    company?: { name: { contains: string; mode: 'insensitive' } };
    primaryContact?: {
      firstName?: { contains: string; mode: 'insensitive' };
      lastName?: { contains: string; mode: 'insensitive' };
      email?: { contains: string; mode: 'insensitive' };
    };
  }>;
}

interface LeadCreateData {
  company: { connect: { id: string } };
  pipeline: { connect: { id: string } };
  stage: { connect: { id: string } };
  owner: { connect: { id: string } };
  primaryContact?: { connect: { id: string } };
  source: Lead['source'];
  status: Lead['status'];
  priorityManual: number | null;
  nextActionAt: Date | null;
}

interface LeadUpdateData {
  company?: { connect: { id: string } };
  owner?: { connect: { id: string } };
  primaryContact?: { connect: { id: string } } | { disconnect: true };
  stage?: { connect: { id: string } };
  source?: Lead['source'];
  status?: Lead['status'];
  priorityManual?: number | null;
  nextActionAt?: Date;
  lostReason?: string | null;
  deletedAt?: Date;
}

function buildFakeDb(): FakeDb {
  return {
    companies: new Map(),
    contacts: new Map(),
    pipelines: new Map(),
    stages: new Map(),
    leads: new Map(),
    users: new Map(),
  };
}

function includesInsensitive(value: string | null | undefined, needle: string): boolean {
  return (value ?? '').toLowerCase().includes(needle.toLowerCase());
}

function matchesLeadWhere(db: FakeDb, row: Lead, where: LeadWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
  if (where.pipelineId !== undefined && row.pipelineId !== where.pipelineId) return false;
  if (where.stageId !== undefined && row.stageId !== where.stageId) return false;
  if (where.ownerId !== undefined && row.ownerId !== where.ownerId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.priorityScore?.gte !== undefined && row.priorityScore < where.priorityScore.gte) {
    return false;
  }
  if (where.OR) {
    const company = db.companies.get(row.companyId) ?? null;
    const contact = row.primaryContactId ? (db.contacts.get(row.primaryContactId) ?? null) : null;
    const matched = where.OR.some((part) => {
      if (part.company) {
        return includesInsensitive(company?.name, part.company.name.contains);
      }
      if (part.primaryContact?.firstName) {
        return includesInsensitive(contact?.firstName, part.primaryContact.firstName.contains);
      }
      if (part.primaryContact?.lastName) {
        return includesInsensitive(contact?.lastName, part.primaryContact.lastName.contains);
      }
      if (part.primaryContact?.email) {
        return includesInsensitive(contact?.email, part.primaryContact.email.contains);
      }
      return false;
    });
    if (!matched) return false;
  }
  return true;
}

function makeLeadWithRelations(db: FakeDb, row: Lead) {
  return {
    ...row,
    company: db.companies.get(row.companyId),
    primaryContact: row.primaryContactId ? (db.contacts.get(row.primaryContactId) ?? null) : null,
    owner: db.users.get(row.ownerId),
    stage: db.stages.get(row.stageId),
    pipeline: db.pipelines.get(row.pipelineId),
  };
}

function applyLeadUpdate(existing: Lead, data: LeadUpdateData): Lead {
  const updated: Lead = {
    ...existing,
    updatedAt: new Date(),
  };
  if (data.company) updated.companyId = data.company.connect.id;
  if (data.owner) updated.ownerId = data.owner.connect.id;
  if (data.primaryContact) {
    updated.primaryContactId =
      'disconnect' in data.primaryContact ? null : data.primaryContact.connect.id;
  }
  if (data.stage) updated.stageId = data.stage.connect.id;
  if (data.source !== undefined) updated.source = data.source;
  if (data.status !== undefined) updated.status = data.status;
  if (data.priorityManual !== undefined) updated.priorityManual = data.priorityManual;
  if (data.nextActionAt !== undefined) updated.nextActionAt = data.nextActionAt;
  if (data.lostReason !== undefined) updated.lostReason = data.lostReason;
  if (data.deletedAt !== undefined) updated.deletedAt = data.deletedAt;
  return updated;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const pipelineStageDelegate = {
    findUnique: async ({ where }: { where: { id: string } }) => db.stages.get(where.id) ?? null,
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { pipelineId: string; kind: PipelineStage['kind'] };
      orderBy: { orderIndex: 'asc' };
    }) =>
      [...db.stages.values()]
        .filter((stage) => stage.pipelineId === where.pipelineId && stage.kind === where.kind)
        .sort((a, b) =>
          orderBy.orderIndex === 'asc' ? a.orderIndex - b.orderIndex : b.orderIndex - a.orderIndex,
        )[0] ?? null,
  };

  const contactDelegate = {
    findUnique: async ({ where }: { where: { id: string } }) => db.contacts.get(where.id) ?? null,
  };

  const leadDelegate = {
    findMany: async ({
      where,
      orderBy,
      skip,
      take,
    }: {
      where: LeadWhere;
      include: unknown;
      orderBy: Array<{ priorityScore: 'desc' } | { createdAt: 'desc' }>;
      skip: number;
      take: number;
    }) => {
      void orderBy;
      return [...db.leads.values()]
        .filter((row) => matchesLeadWhere(db, row, where))
        .sort((a, b) => {
          if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
          return b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(skip, skip + take)
        .map((row) => makeLeadWithRelations(db, row));
    },
    count: async ({ where }: { where: LeadWhere }) =>
      [...db.leads.values()].filter((row) => matchesLeadWhere(db, row, where)).length,
    findFirst: async ({ where, include }: { where: LeadWhere; include?: unknown }) => {
      const row = [...db.leads.values()].find((lead) => matchesLeadWhere(db, lead, where)) ?? null;
      if (!row) return null;
      return include ? makeLeadWithRelations(db, row) : row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => db.leads.get(where.id) ?? null,
    create: async ({ data, include }: { data: LeadCreateData; include?: unknown }) => {
      const now = new Date();
      const row = makeLead({
        id: `lead_${db.leads.size + 1}`,
        companyId: data.company.connect.id,
        primaryContactId: data.primaryContact?.connect.id ?? null,
        pipelineId: data.pipeline.connect.id,
        stageId: data.stage.connect.id,
        ownerId: data.owner.connect.id,
        source: data.source,
        status: data.status,
        priorityManual: data.priorityManual,
        nextActionAt: data.nextActionAt,
        createdAt: now,
        updatedAt: now,
      });
      db.leads.set(row.id, row);
      return include ? makeLeadWithRelations(db, row) : row;
    },
    update: async ({
      where,
      data,
      include,
    }: {
      where: { id: string };
      data: LeadUpdateData;
      include?: unknown;
    }) => {
      const existing = db.leads.get(where.id);
      if (!existing) throw new Error('lead not found');
      const updated = applyLeadUpdate(existing, data);
      db.leads.set(updated.id, updated);
      return include ? makeLeadWithRelations(db, updated) : updated;
    },
  };

  const prisma = {
    lead: leadDelegate,
    pipelineStage: pipelineStageDelegate,
    contact: contactDelegate,
    $transaction: async <T>(input: Promise<T>[]) => Promise.all(input),
  };

  return prisma as unknown as PrismaClient;
}

function makeCompany(input: { id: string; name: string; domain?: string | null }): Company {
  const now = new Date();
  return {
    id: input.id,
    name: input.name,
    website: null,
    domain: input.domain ?? null,
    industry: null,
    icpVertical: null,
    country: 'ES',
    region: null,
    city: null,
    postalCode: null,
    address: null,
    sizeSignal: null,
    phone: null,
    email: null,
    whatsapp: null,
    linkedinUrl: null,
    instagramHandle: null,
    notes: null,
    demoLink: null,
    createdById: 'user_admin',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function makeContact(input: {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
}): Contact {
  const now = new Date();
  return {
    id: input.id,
    companyId: input.companyId,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    roleTitle: null,
    email: input.email ?? null,
    phone: null,
    whatsapp: null,
    linkedinUrl: null,
    isPrimary: false,
    consentStatus: 'public_business_data_only',
    createdById: 'user_admin',
    createdAt: now,
    updatedAt: now,
    anonymizedAt: null,
    deletedAt: null,
  };
}

function makePipeline(input: { id: string; name: string }): Pipeline {
  const now = new Date();
  return {
    id: input.id,
    name: input.name,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}

function makeStage(input: {
  id: string;
  pipelineId: string;
  name: string;
  kind: PipelineStage['kind'];
  orderIndex: number;
}): PipelineStage {
  return {
    id: input.id,
    pipelineId: input.pipelineId,
    name: input.name,
    kind: input.kind,
    color: null,
    orderIndex: input.orderIndex,
  };
}

function makeUser(input: { id: string; name: string; email: string }): User {
  const now = new Date();
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    passwordHash: 'hash',
    role: 'admin',
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeLead(input: {
  id: string;
  companyId: string;
  primaryContactId?: string | null;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  source?: Lead['source'];
  status?: Lead['status'];
  priorityScore?: number;
  priorityManual?: number | null;
  nextActionAt?: Date | null;
  lostReason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}): Lead {
  const now = new Date();
  return {
    id: input.id,
    companyId: input.companyId,
    primaryContactId: input.primaryContactId ?? null,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    ownerId: input.ownerId,
    source: input.source ?? 'manual',
    status: input.status ?? 'open',
    priorityScore: input.priorityScore ?? 0,
    priorityManual: input.priorityManual ?? null,
    nextActionAt: input.nextActionAt ?? null,
    lostReason: input.lostReason ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  };
}

describe('LeadsService', () => {
  const actor: PublicUserDto = {
    id: 'user_admin',
    email: 'alex@heyday.test',
    name: 'Alex',
    role: 'admin',
    isActive: true,
    lastLoginAt: null,
  };

  let db: FakeDb;
  let service: LeadsService;

  beforeEach(() => {
    db = buildFakeDb();
    service = new LeadsService(makePrismaMock(db));

    db.companies.set(
      'company_1',
      makeCompany({ id: 'company_1', name: 'HeyDay', domain: 'heyday.test' }),
    );
    db.companies.set(
      'company_2',
      makeCompany({ id: 'company_2', name: 'OtherCo', domain: 'other.test' }),
    );

    db.contacts.set(
      'contact_1',
      makeContact({
        id: 'contact_1',
        companyId: 'company_1',
        firstName: 'Marina',
        lastName: 'Costa',
        email: 'marina@heyday.test',
      }),
    );
    db.contacts.set(
      'contact_2',
      makeContact({
        id: 'contact_2',
        companyId: 'company_2',
        firstName: 'Other',
        lastName: 'Contact',
        email: 'other@heyday.test',
      }),
    );

    db.users.set(
      'user_1',
      makeUser({ id: 'user_1', name: 'Owner One', email: 'owner1@heyday.test' }),
    );
    db.users.set(
      'user_2',
      makeUser({ id: 'user_2', name: 'Owner Two', email: 'owner2@heyday.test' }),
    );

    db.pipelines.set('pipeline_1', makePipeline({ id: 'pipeline_1', name: 'Sales' }));
    db.pipelines.set('pipeline_2', makePipeline({ id: 'pipeline_2', name: 'Expansion' }));

    db.stages.set(
      'stage_open_1',
      makeStage({
        id: 'stage_open_1',
        pipelineId: 'pipeline_1',
        name: 'Open',
        kind: 'open',
        orderIndex: 0,
      }),
    );
    db.stages.set(
      'stage_won_1',
      makeStage({
        id: 'stage_won_1',
        pipelineId: 'pipeline_1',
        name: 'Won',
        kind: 'won',
        orderIndex: 1,
      }),
    );
    db.stages.set(
      'stage_lost_1',
      makeStage({
        id: 'stage_lost_1',
        pipelineId: 'pipeline_1',
        name: 'Lost',
        kind: 'lost',
        orderIndex: 2,
      }),
    );
    db.stages.set(
      'stage_open_2',
      makeStage({
        id: 'stage_open_2',
        pipelineId: 'pipeline_2',
        name: 'Open 2',
        kind: 'open',
        orderIndex: 0,
      }),
    );
    db.stages.set(
      'stage_won_2',
      makeStage({
        id: 'stage_won_2',
        pipelineId: 'pipeline_2',
        name: 'Won 2',
        kind: 'won',
        orderIndex: 1,
      }),
    );
    db.stages.set(
      'stage_lost_2',
      makeStage({
        id: 'stage_lost_2',
        pipelineId: 'pipeline_2',
        name: 'Lost 2',
        kind: 'lost',
        orderIndex: 2,
      }),
    );
  });

  async function createLead(overrides: Partial<CreateLeadInput> = {}) {
    return service.create(
      {
        companyId: 'company_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_open_1',
        ownerId: 'user_1',
        primaryContactId: 'contact_1',
        source: 'manual',
        priorityManual: 25,
        nextActionAt: '2026-04-28T10:00:00.000Z',
        ...overrides,
      },
      actor,
    );
  }

  it('list filtra por stageId, pipelineId, ownerId, status, priorityMin y pagina', async () => {
    for (let i = 0; i < 15; i++) {
      const row = makeLead({
        id: `lead_${i}`,
        companyId: i % 2 === 0 ? 'company_1' : 'company_2',
        primaryContactId: i % 2 === 0 ? 'contact_1' : 'contact_2',
        pipelineId: i % 2 === 0 ? 'pipeline_1' : 'pipeline_2',
        stageId: i % 2 === 0 ? 'stage_open_1' : 'stage_open_2',
        ownerId: i % 3 === 0 ? 'user_1' : 'user_2',
        status: i % 4 === 0 ? 'won' : 'open',
        priorityScore: i,
        createdAt: new Date(Date.UTC(2026, 3, 1, 0, i, 0)),
      });
      db.leads.set(row.id, row);
    }
    db.leads.set(
      'deleted_lead',
      makeLead({
        id: 'deleted_lead',
        companyId: 'company_1',
        primaryContactId: 'contact_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_open_1',
        ownerId: 'user_1',
        status: 'won',
        priorityScore: 99,
        deletedAt: new Date(),
      }),
    );

    const result = await service.list({
      stageId: 'stage_open_1',
      pipelineId: 'pipeline_1',
      ownerId: 'user_1',
      status: 'won',
      priorityMin: 4,
      companyId: 'company_1',
      page: 1,
      pageSize: 10,
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.stageId === 'stage_open_1')).toBe(true);
    expect(result.items.every((item) => item.pipelineId === 'pipeline_1')).toBe(true);
    expect(result.items.every((item) => item.ownerId === 'user_1')).toBe(true);
    expect(result.items.every((item) => item.status === 'won')).toBe(true);
    expect(result.items.every((item) => item.companyId === 'company_1')).toBe(true);
    expect(result.items.some((item) => item.id === 'deleted_lead')).toBe(false);
  });

  it('list aplica q sobre company y primaryContact', async () => {
    db.leads.set(
      'lead_company',
      makeLead({
        id: 'lead_company',
        companyId: 'company_1',
        primaryContactId: 'contact_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_open_1',
        ownerId: 'user_1',
      }),
    );
    db.leads.set(
      'lead_contact',
      makeLead({
        id: 'lead_contact',
        companyId: 'company_2',
        primaryContactId: 'contact_2',
        pipelineId: 'pipeline_2',
        stageId: 'stage_open_2',
        ownerId: 'user_2',
      }),
    );

    const byCompany = await service.list({ q: 'heyday', page: 1, pageSize: 25 });
    expect(byCompany.items.map((item) => item.id)).toContain('lead_company');

    const byContact = await service.list({ q: 'other@heyday.test', page: 1, pageSize: 25 });
    expect(byContact.items.map((item) => item.id)).toContain('lead_contact');
  });

  it('getById devuelve lead con relaciones', async () => {
    const created = await createLead();

    const lead = await service.getById(created.id);

    expect(lead.company).toMatchObject({
      id: 'company_1',
      name: 'HeyDay',
      websiteDomain: 'heyday.test',
    });
    expect(lead.primaryContact).toMatchObject({ id: 'contact_1', firstName: 'Marina' });
    expect(lead.owner).toMatchObject({ id: 'user_1', name: 'Owner One' });
    expect(lead.stage).toMatchObject({ id: 'stage_open_1', kind: 'open' });
    expect(lead.pipeline).toMatchObject({ id: 'pipeline_1', name: 'Sales' });
  });

  it('getById lanza LeadNotFoundError si no existe o está soft-deleted', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(LeadNotFoundError);

    const created = await createLead();
    await service.softDelete(created.id, actor);

    await expect(service.getById(created.id)).rejects.toBeInstanceOf(LeadNotFoundError);
  });

  it('create valida stage-pipeline mismatch', async () => {
    await expect(
      createLead({ pipelineId: 'pipeline_1', stageId: 'stage_open_2' }),
    ).rejects.toBeInstanceOf(StageNotInPipelineError);
  });

  it('create valida primaryContact-company mismatch', async () => {
    await expect(
      createLead({ companyId: 'company_1', primaryContactId: 'contact_2' }),
    ).rejects.toBeInstanceOf(LeadCompanyMismatchError);
  });

  it('create deriva status desde el kind del stage', async () => {
    const wonLead = await createLead({ stageId: 'stage_won_1' });
    const lostLead = await createLead({ stageId: 'stage_lost_1' });

    expect(wonLead.status).toBe('won');
    expect(lostLead.status).toBe('lost');
  });

  it('update rechaza pipeline change en v1', async () => {
    const created = await createLead();

    await expect(
      service.update(created.id, { pipelineId: 'pipeline_2' }, actor),
    ).rejects.toBeInstanceOf(InvalidLeadTransitionError);
  });

  it('update valida stageId dentro del mismo pipeline', async () => {
    const created = await createLead();

    await expect(
      service.update(created.id, { stageId: 'stage_open_2' }, actor),
    ).rejects.toBeInstanceOf(StageNotInPipelineError);
  });

  it('update sincroniza status al cambiar a stage won o lost', async () => {
    const created = await createLead();

    const won = await service.update(created.id, { stageId: 'stage_won_1' }, actor);
    expect(won.status).toBe('won');

    const lost = await service.update(created.id, { stageId: 'stage_lost_1' }, actor);
    expect(lost.status).toBe('lost');
  });

  it('update valida primaryContactId contra companyId efectivo', async () => {
    const created = await createLead();

    await expect(
      service.update(created.id, { primaryContactId: 'contact_2' }, actor),
    ).rejects.toBeInstanceOf(LeadCompanyMismatchError);
  });

  it('markWon mueve al primer stage won del pipeline si hace falta', async () => {
    const created = await createLead();

    const updated = await service.markWon(created.id, actor);

    expect(updated.status).toBe('won');
    expect(updated.stageId).toBe('stage_won_1');
  });

  it('markLost mueve al primer stage lost del pipeline y guarda lostReason', async () => {
    const created = await createLead();

    const updated = await service.markLost(created.id, 'No fit', actor);

    expect(updated.status).toBe('lost');
    expect(updated.stageId).toBe('stage_lost_1');
    expect(updated.lostReason).toBe('No fit');
  });

  it('softDelete marca deletedAt', async () => {
    const created = await createLead();

    await service.softDelete(created.id, actor);

    expect(db.leads.get(created.id)?.deletedAt).toBeInstanceOf(Date);
  });

  it('softDelete es idempotente para leads ya eliminados', async () => {
    const created = await createLead();

    await service.softDelete(created.id, actor);
    const firstDeletedAt = db.leads.get(created.id)?.deletedAt ?? null;
    await service.softDelete(created.id, actor);

    expect(db.leads.get(created.id)?.deletedAt).toEqual(firstDeletedAt);
  });
});
