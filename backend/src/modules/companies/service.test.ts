import type { Company, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';

import { normalizeDomain } from './domain.js';
import type { CompanyCreateInput } from './schemas.js';
import { CompaniesService, CompanyDomainConflictError, CompanyNotFoundError } from './service.js';

interface FakeDb {
  companies: Map<string, Company>;
}

interface CompanyWhere {
  id?: string | { not: string };
  name?: { contains: string; mode: 'insensitive' };
  domain?: string | { contains: string; mode: 'insensitive' };
  deletedAt?: null;
  icpVertical?: Company['icpVertical'];
  city?: string | { contains: string; mode: 'insensitive' };
  OR?: CompanyWhere[];
}

function buildFakeDb(): FakeDb {
  return { companies: new Map() };
}

function matchesText(value: string | null, filter: { contains: string }): boolean {
  return (value ?? '').toLowerCase().includes(filter.contains.toLowerCase());
}

function matchesWhere(row: Company, where: CompanyWhere): boolean {
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.id === 'object' && row.id === where.id.not) return false;
  if (where.name !== undefined && !matchesText(row.name, where.name)) return false;
  if (typeof where.domain === 'string' && row.domain !== where.domain) return false;
  if (typeof where.domain === 'object' && !matchesText(row.domain, where.domain)) return false;
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (where.icpVertical !== undefined && row.icpVertical !== where.icpVertical) return false;
  if (typeof where.city === 'string' && row.city !== where.city) return false;
  if (typeof where.city === 'object' && !matchesText(row.city, where.city)) return false;
  if (where.OR && !where.OR.some((part) => matchesWhere(row, part))) return false;
  return true;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const prisma = {
    company: {
      findFirst: async ({ where }: { where: CompanyWhere }) =>
        [...db.companies.values()].find((row) => matchesWhere(row, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.companies.get(where.id) ?? null,
      findMany: async ({
        where,
        skip,
        take,
      }: {
        where: CompanyWhere;
        orderBy: { updatedAt: 'desc' };
        skip: number;
        take: number;
      }) =>
        [...db.companies.values()]
          .filter((row) => matchesWhere(row, where))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(skip, skip + take),
      count: async ({ where }: { where: CompanyWhere }) =>
        [...db.companies.values()].filter((row) => matchesWhere(row, where)).length,
      create: async ({
        data,
      }: {
        data: CompanyCreateInput & { createdBy: { connect: { id: string } } };
      }) => {
        const now = new Date();
        const row = makeCompany({
          ...data,
          id: `company_${db.companies.size + 1}`,
          createdById: data.createdBy.connect.id,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        db.companies.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Company> }) => {
        const existing = db.companies.get(where.id);
        if (!existing) throw new Error('company not found');
        const updated = { ...existing, ...data, updatedAt: new Date() } as Company;
        db.companies.set(updated.id, updated);
        return updated;
      },
      updateMany: async ({ where, data }: { where: CompanyWhere; data: Partial<Company> }) => {
        let count = 0;
        for (const row of db.companies.values()) {
          if (!matchesWhere(row, where)) continue;
          Object.assign(row, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
    $transaction: async <T>(promises: Promise<T>[]) => Promise.all(promises),
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
    createdById: input.createdById,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    deletedAt: input.deletedAt ?? null,
  };
}

describe('CompaniesService', () => {
  let db: FakeDb;
  let service: CompaniesService;
  let seq = 0;

  beforeEach(() => {
    db = buildFakeDb();
    service = new CompaniesService(makePrismaMock(db));
    seq = 0;
  });

  function nextDomain(label: string): string {
    seq += 1;
    return `${label}-${seq}.service.test`;
  }

  async function createCompany(overrides: Partial<CompanyCreateInput> = {}) {
    const input: CompanyCreateInput = {
      name: `Company ${seq + 1}`,
      country: 'ES',
      domain: nextDomain('company'),
      ...overrides,
    };
    return service.create(input, 'user_alex');
  }

  it('normalizeDomain normaliza entradas comunes', () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('HeyDay.io')).toBe('heyday.io');
    expect(normalizeDomain('https://www.HeyDay.io/')).toBe('heyday.io');
    expect(normalizeDomain('http://heyday.io/path?q=1')).toBe('heyday.io');
  });

  it('create con dominio único devuelve DTO público', async () => {
    const company = await createCompany({ name: 'HeyDay', domain: 'HeyDay.io' });

    expect(company.domain).toBe('heyday.io');
    expect(company.created_by_id).toBe('user_alex');
    expect(company).not.toHaveProperty('deleted_at');
  });

  it('create deriva el dominio desde website si domain es null', async () => {
    const company = await createCompany({
      name: 'Website Only',
      domain: null,
      website: 'https://www.derived.test/path',
    });

    expect(company.domain).toBe('derived.test');
  });

  it('create rechaza dominio activo duplicado con existingId', async () => {
    const existing = await createCompany({ domain: 'duplicate.test' });

    await expect(createCompany({ domain: 'https://www.duplicate.test/' })).rejects.toMatchObject({
      existingId: existing.id,
    });
    await expect(createCompany({ domain: 'duplicate.test' })).rejects.toBeInstanceOf(
      CompanyDomainConflictError,
    );
  });

  it('create permite reutilizar dominio de empresa soft-deleted', async () => {
    const deleted = await createCompany({ domain: 'reusable.test' });
    await service.softDelete(deleted.id);

    const recreated = await createCompany({ name: 'Recreated', domain: 'reusable.test' });

    expect(recreated.id).not.toBe(deleted.id);
    expect(recreated.domain).toBe('reusable.test');
  });

  it('update rechaza cambiar al dominio de otra empresa activa', async () => {
    const first = await createCompany({ domain: 'first.test' });
    const second = await createCompany({ domain: 'second.test' });

    await expect(service.update(second.id, { domain: 'first.test' })).rejects.toMatchObject({
      existingId: first.id,
    });
  });

  it('update cambia otros campos sin tocar domain y actualiza updated_at', async () => {
    const company = await createCompany({ domain: 'stable.test' });
    const before = company.updated_at;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = await service.update(company.id, { city: 'Madrid', notes: 'Nueva nota' });

    expect(updated.domain).toBe('stable.test');
    expect(updated.city).toBe('Madrid');
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });

  it('softDelete oculta la empresa y el segundo delete lanza NotFound', async () => {
    const company = await createCompany({ domain: 'delete-me.test' });

    await service.softDelete(company.id);
    expect(db.companies.get(company.id)?.deletedAt).toBeInstanceOf(Date);

    await expect(service.softDelete(company.id)).rejects.toBeInstanceOf(CompanyNotFoundError);
    await expect(service.getById(company.id)).rejects.toBeInstanceOf(CompanyNotFoundError);
    const list = await service.list({ page: 1, pageSize: 20, sort: 'updated_at_desc' });
    expect(list.items.some((item) => item.id === company.id)).toBe(false);
  });

  it('list filtra por q, icp_vertical, city, pagina y ordena por updated_at desc', async () => {
    for (let i = 0; i < 25; i++) {
      await createCompany({
        name: `Batch ${i}`,
        domain: nextDomain('batch'),
        icp_vertical: i % 2 === 0 ? 'physiotherapy' : 'cafe',
        city: i % 3 === 0 ? 'Madrid' : 'Valencia',
      });
    }
    const latest = await createCompany({
      name: 'Needle Clinic',
      domain: 'needle.test',
      icp_vertical: 'physiotherapy',
      city: 'Madrid',
    });

    const filtered = await service.list({
      q: 'needle',
      icp_vertical: 'physiotherapy',
      city: 'Madrid',
      page: 1,
      pageSize: 10,
      sort: 'updated_at_desc',
    });
    expect(filtered.total).toBe(1);
    expect(filtered.items[0]?.id).toBe(latest.id);

    const paged = await service.list({ page: 2, pageSize: 10, sort: 'updated_at_desc' });
    expect(paged.page).toBe(2);
    expect(paged.pageSize).toBe(10);
    expect(paged.total).toBe(26);
    expect(paged.items).toHaveLength(10);
    for (let i = 1; i < paged.items.length; i++) {
      expect(new Date(paged.items[i - 1]!.updated_at).getTime()).toBeGreaterThanOrEqual(
        new Date(paged.items[i]!.updated_at).getTime(),
      );
    }
  });
});
