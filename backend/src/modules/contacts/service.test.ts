import type { Company, Contact, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/service.js';
import type { ContactCreateInput } from './schemas.js';
import { ContactsService, ContactCompanyNotFoundError, ContactNotFoundError } from './service.js';

interface FakeDb {
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
}

interface CompanyWhere {
  id?: string;
  deletedAt?: null;
}

interface ContactWhere {
  id?: string | { not: string };
  companyId?: string;
  firstName?: { contains: string; mode: 'insensitive' };
  lastName?: { contains: string; mode: 'insensitive' };
  email?: { contains: string; mode: 'insensitive' };
  isPrimary?: boolean;
  deletedAt?: null;
  OR?: ContactWhere[];
}

interface ContactCreateData {
  firstName: string;
  lastName: string | null;
  roleTitle: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  linkedinUrl: string | null;
  isPrimary: boolean;
  consentStatus: Contact['consentStatus'];
  createdBy: { connect: { id: string } };
  company?: { connect: { id: string } };
}

interface ContactUpdateData {
  firstName?: string;
  lastName?: string | null;
  roleTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedinUrl?: string | null;
  isPrimary?: boolean;
  consentStatus?: Contact['consentStatus'];
  anonymizedAt?: Date | null;
  deletedAt?: Date | null;
  company?: { connect: { id: string } } | { disconnect: true };
}

function buildFakeDb(): FakeDb {
  return { companies: new Map(), contacts: new Map() };
}

function matchesText(value: string | null, filter: { contains: string }): boolean {
  return (value ?? '').toLowerCase().includes(filter.contains.toLowerCase());
}

function matchesCompanyWhere(row: Company, where: CompanyWhere): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  return true;
}

function matchesContactWhere(row: Contact, where: ContactWhere): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.id === 'object' && row.id === where.id.not) return false;
  if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
  if (where.firstName !== undefined && !matchesText(row.firstName, where.firstName)) return false;
  if (where.lastName !== undefined && !matchesText(row.lastName, where.lastName)) return false;
  if (where.email !== undefined && !matchesText(row.email, where.email)) return false;
  if (where.isPrimary !== undefined && row.isPrimary !== where.isPrimary) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.OR && !where.OR.some((part) => matchesContactWhere(row, part))) return false;
  return true;
}

function applyContactUpdate(existing: Contact, data: ContactUpdateData): Contact {
  const updated: Contact = {
    ...existing,
    updatedAt: new Date(),
  };
  if (data.firstName !== undefined) updated.firstName = data.firstName;
  if (data.lastName !== undefined) updated.lastName = data.lastName;
  if (data.roleTitle !== undefined) updated.roleTitle = data.roleTitle;
  if (data.email !== undefined) updated.email = data.email;
  if (data.phone !== undefined) updated.phone = data.phone;
  if (data.whatsapp !== undefined) updated.whatsapp = data.whatsapp;
  if (data.linkedinUrl !== undefined) updated.linkedinUrl = data.linkedinUrl;
  if (data.isPrimary !== undefined) updated.isPrimary = data.isPrimary;
  if (data.consentStatus !== undefined) updated.consentStatus = data.consentStatus;
  if (data.anonymizedAt !== undefined) updated.anonymizedAt = data.anonymizedAt;
  if (data.deletedAt !== undefined) updated.deletedAt = data.deletedAt;
  if (data.company !== undefined) {
    updated.companyId = 'disconnect' in data.company ? null : data.company.connect.id;
  }
  return updated;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const contactDelegate = {
    findFirst: async ({ where }: { where: ContactWhere }) =>
      [...db.contacts.values()].find((row) => matchesContactWhere(row, where)) ?? null,
    findMany: async ({
      where,
      skip,
      take,
    }: {
      where: ContactWhere;
      orderBy: { updatedAt: 'desc' };
      skip: number;
      take: number;
    }) =>
      [...db.contacts.values()]
        .filter((row) => matchesContactWhere(row, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(skip, skip + take),
    count: async ({ where }: { where: ContactWhere }) =>
      [...db.contacts.values()].filter((row) => matchesContactWhere(row, where)).length,
    create: async ({ data }: { data: ContactCreateData }) => {
      const now = new Date();
      const row = makeContact({
        id: `contact_${db.contacts.size + 1}`,
        companyId: data.company?.connect.id ?? null,
        firstName: data.firstName,
        lastName: data.lastName,
        roleTitle: data.roleTitle,
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp,
        linkedinUrl: data.linkedinUrl,
        isPrimary: data.isPrimary,
        consentStatus: data.consentStatus,
        createdById: data.createdBy.connect.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        anonymizedAt: null,
      });
      db.contacts.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: ContactUpdateData }) => {
      const existing = db.contacts.get(where.id);
      if (!existing) throw new Error('contact not found');
      const updated = applyContactUpdate(existing, data);
      db.contacts.set(updated.id, updated);
      return updated;
    },
    updateMany: async ({ where, data }: { where: ContactWhere; data: ContactUpdateData }) => {
      let count = 0;
      for (const row of db.contacts.values()) {
        if (!matchesContactWhere(row, where)) continue;
        const updated = applyContactUpdate(row, data);
        db.contacts.set(updated.id, updated);
        count++;
      }
      return { count };
    },
  };

  const companyDelegate = {
    findFirst: async ({ where }: { where: CompanyWhere }) =>
      [...db.companies.values()].find((row) => matchesCompanyWhere(row, where)) ?? null,
  };

  const prisma = {
    contact: contactDelegate,
    company: companyDelegate,
    $transaction: async <T>(
      input:
        | Promise<T>[]
        | ((tx: {
            contact: typeof contactDelegate;
            company: typeof companyDelegate;
          }) => Promise<T>),
    ) => {
      if (typeof input === 'function') {
        return input({ contact: contactDelegate, company: companyDelegate });
      }
      return Promise.all(input);
    },
  };

  return prisma as unknown as PrismaClient;
}

function makeCompany(
  input: Partial<Company> & { id: string; name: string; createdById: string },
): Company {
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
    demoLink: input.demoLink ?? null,
    createdById: input.createdById,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  };
}

function makeContact(
  input: Partial<Contact> & {
    id: string;
    firstName: string;
    createdById: string;
    consentStatus: Contact['consentStatus'];
  },
): Contact {
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
  };
}

describe('ContactsService', () => {
  let db: FakeDb;
  let service: ContactsService;
  let auditRecord: ReturnType<typeof vi.fn<(entry: AuditEntry) => Promise<void>>>;

  beforeEach(() => {
    db = buildFakeDb();
    auditRecord = vi.fn(async () => undefined);
    service = new ContactsService(makePrismaMock(db), { record: auditRecord } as never);
    db.companies.set(
      'company_1',
      makeCompany({ id: 'company_1', name: 'HeyDay', createdById: 'user_alex' }),
    );
  });

  async function createContact(overrides: Partial<ContactCreateInput> = {}) {
    const input: ContactCreateInput = {
      first_name: 'Alex',
      last_name: 'Avila',
      role_title: 'Founder',
      email: `alex-${db.contacts.size + 1}@heyday.test`,
      phone: '+34123456789',
      whatsapp: '+34123456789',
      linkedin_url: 'https://linkedin.com/in/alex-avila',
      company_id: 'company_1',
      is_primary: false,
      consent_status: 'public_business_data_only',
      ...overrides,
    };
    return service.create(input, 'user_alex');
  }

  it('list filtra por q, company_id, is_primary, excluye soft-deleted y pagina', async () => {
    for (let i = 0; i < 25; i++) {
      await createContact({
        first_name: `Batch ${i}`,
        last_name: i % 2 === 0 ? 'Needle' : 'Other',
        email: `batch-${i}@heyday.test`,
        company_id: i % 2 === 0 ? 'company_1' : null,
        is_primary: i % 5 === 0,
      });
    }
    const deleted = await createContact({
      first_name: 'Delete',
      email: 'delete@heyday.test',
      company_id: 'company_1',
      is_primary: true,
    });
    await service.softDelete(deleted.id);

    const filtered = await service.list({
      q: 'needle',
      company_id: 'company_1',
      is_primary: false,
      page: 1,
      pageSize: 10,
      sort: 'updated_at_desc',
    });

    expect(filtered.total).toBeGreaterThan(0);
    expect(filtered.items.every((item) => item.company_id === 'company_1')).toBe(true);
    expect(filtered.items.every((item) => item.is_primary === false)).toBe(true);
    expect(filtered.items.every((item) => item.last_name === 'Needle')).toBe(true);
    expect(filtered.items.some((item) => item.id === deleted.id)).toBe(false);

    const paged = await service.list({ page: 2, pageSize: 10, sort: 'updated_at_desc' });
    expect(paged.page).toBe(2);
    expect(paged.pageSize).toBe(10);
    expect(paged.total).toBe(25);
    expect(paged.items).toHaveLength(10);
  });

  it('getById devuelve el contacto activo', async () => {
    const created = await createContact({ first_name: 'Laura' });

    const contact = await service.getById(created.id);

    expect(contact.first_name).toBe('Laura');
    expect(contact.id).toBe(created.id);
  });

  it('getById lanza ContactNotFoundError si no existe o está borrado', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(ContactNotFoundError);

    const created = await createContact();
    await service.softDelete(created.id);

    await expect(service.getById(created.id)).rejects.toBeInstanceOf(ContactNotFoundError);
  });

  it('create crea contacto básico', async () => {
    const contact = await createContact({ first_name: 'Basic', company_id: null });

    expect(contact.first_name).toBe('Basic');
    expect(contact.company_id).toBeNull();
    expect(contact.created_by_id).toBe('user_alex');
  });

  it('create falla si company_id no existe', async () => {
    await expect(createContact({ company_id: 'company_missing' })).rejects.toBeInstanceOf(
      ContactCompanyNotFoundError,
    );
  });

  it('create con is_primary=true desmarca otros primarios activos de la misma empresa', async () => {
    const first = await createContact({ first_name: 'First', is_primary: true });
    const second = await createContact({ first_name: 'Second', is_primary: true });

    expect(db.contacts.get(first.id)?.isPrimary).toBe(false);
    expect(db.contacts.get(second.id)?.isPrimary).toBe(true);
  });

  it('update modifica campos básicos', async () => {
    const created = await createContact({ first_name: 'Before', role_title: 'SDR' });

    const updated = await service.update(created.id, {
      first_name: 'After',
      role_title: 'AE',
      email: 'after@heyday.test',
    });

    expect(updated.first_name).toBe('After');
    expect(updated.role_title).toBe('AE');
    expect(updated.email).toBe('after@heyday.test');
  });

  it('update con is_primary=true desmarca otros primarios y valida company_id cambiado', async () => {
    db.companies.set(
      'company_2',
      makeCompany({ id: 'company_2', name: 'Second', createdById: 'user_alex' }),
    );

    const first = await createContact({ first_name: 'First', is_primary: true });
    const second = await createContact({ first_name: 'Second', is_primary: false });
    const third = await createContact({
      first_name: 'Third',
      company_id: 'company_2',
      is_primary: true,
    });

    const updated = await service.update(second.id, { is_primary: true });
    expect(updated.is_primary).toBe(true);
    expect(db.contacts.get(first.id)?.isPrimary).toBe(false);

    const moved = await service.update(third.id, { company_id: 'company_1' });
    expect(moved.company_id).toBe('company_1');
    expect(db.contacts.get(second.id)?.isPrimary).toBe(false);
    expect(db.contacts.get(third.id)?.isPrimary).toBe(true);

    await expect(
      service.update(second.id, { company_id: 'company_missing' }),
    ).rejects.toBeInstanceOf(ContactCompanyNotFoundError);
  });

  it('softDelete marca deletedAt e isPrimary=false', async () => {
    const created = await createContact({ is_primary: true });

    await service.softDelete(created.id);

    expect(db.contacts.get(created.id)?.deletedAt).toBeInstanceOf(Date);
    expect(db.contacts.get(created.id)?.isPrimary).toBe(false);
    await expect(service.softDelete(created.id)).rejects.toBeInstanceOf(ContactNotFoundError);
  });

  it('anonymize reemplaza PII, marca anonymizedAt y escribe audit sin PII', async () => {
    const created = await createContact({
      first_name: 'Marina',
      last_name: 'Costa',
      email: 'marina@heyday.test',
      phone: '+34999999999',
      whatsapp: '+34999999999',
      linkedin_url: 'https://linkedin.com/in/marina-costa',
      is_primary: true,
    });

    const anonymized = await service.anonymize(created.id, 'user_admin', '127.0.0.1');

    expect(anonymized.first_name).toBe('Anonymized');
    expect(anonymized.last_name).toBe(`#${created.id.slice(-6).toUpperCase()}`);
    expect(anonymized.email).toBeNull();
    expect(anonymized.phone).toBeNull();
    expect(anonymized.whatsapp).toBeNull();
    expect(anonymized.linkedin_url).toBeNull();
    expect(anonymized.is_primary).toBe(false);
    expect(anonymized.consent_status).toBe('revoked');
    expect(anonymized.anonymized_at).not.toBeNull();

    expect(auditRecord).toHaveBeenCalledTimes(1);
    const entry = auditRecord.mock.calls[0]?.[0];
    expect(entry).toMatchObject({
      action: 'contact.anonymize',
      actorUserId: 'user_admin',
      entityType: 'contact',
      entityId: created.id,
      metadata: {
        had_email: true,
        had_phone: true,
        had_company: true,
      },
      ip: '127.0.0.1',
    });
    expect(JSON.stringify(entry?.metadata)).not.toContain('marina@heyday.test');
    expect(JSON.stringify(entry?.metadata)).not.toContain('+34999999999');
    expect(JSON.stringify(entry?.metadata)).not.toContain('Marina');
  });

  it('anonymize lanza si ya estaba anonimizado', async () => {
    const created = await createContact();
    await service.anonymize(created.id, 'user_admin', '127.0.0.1');

    await expect(service.anonymize(created.id, 'user_admin', '127.0.0.1')).rejects.toMatchObject({
      message: 'Ya anonimizado',
    });
  });
});
