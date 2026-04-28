import type { Company, Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { normalizeDomain } from './domain.js';
import type {
  CompanyCreateInput,
  CompanyDto,
  CompanyListQuery,
  CompanyUpdateInput,
} from './schemas.js';

export class CompanyDomainConflictError extends Error {
  constructor(
    public readonly existingId: string,
    domain: string,
  ) {
    super(`Ya existe una empresa con el dominio "${domain}"`);
    this.name = 'CompanyDomainConflictError';
  }
}

export class CompanyNotFoundError extends Error {
  constructor(id: string) {
    super(`Empresa "${id}" no encontrada`);
    this.name = 'CompanyNotFoundError';
  }
}

function toDto(row: Company): CompanyDto {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    domain: row.domain,
    industry: row.industry,
    icp_vertical: row.icpVertical,
    country: row.country,
    region: row.region,
    city: row.city,
    postal_code: row.postalCode,
    address: row.address,
    size_signal: row.sizeSignal,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp,
    linkedin_url: row.linkedinUrl,
    instagram_handle: row.instagramHandle,
    notes: row.notes,
    created_by_id: row.createdById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function resolveDomain(input: Pick<CompanyCreateInput, 'domain' | 'website'>): string | null {
  return normalizeDomain(input.domain) ?? normalizeDomain(input.website);
}

function toCreateData(
  input: CompanyCreateInput,
  createdById: string,
  domain: string | null,
): Prisma.CompanyCreateInput {
  return {
    name: input.name,
    website: input.website ?? null,
    domain,
    industry: input.industry ?? null,
    icpVertical: input.icp_vertical ?? null,
    country: input.country,
    region: input.region ?? null,
    city: input.city ?? null,
    postalCode: input.postal_code ?? null,
    address: input.address ?? null,
    sizeSignal: input.size_signal ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedinUrl: input.linkedin_url ?? null,
    instagramHandle: input.instagram_handle ?? null,
    notes: input.notes ?? null,
    createdBy: { connect: { id: createdById } },
  };
}

function toUpdateData(
  patch: CompanyUpdateInput,
  domain?: string | null,
): Prisma.CompanyUpdateInput {
  const data: Prisma.CompanyUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.website !== undefined) data.website = patch.website;
  if (patch.domain !== undefined || domain !== undefined) data.domain = domain ?? null;
  if (patch.industry !== undefined) data.industry = patch.industry;
  if (patch.icp_vertical !== undefined) data.icpVertical = patch.icp_vertical;
  if (patch.country !== undefined) data.country = patch.country;
  if (patch.region !== undefined) data.region = patch.region;
  if (patch.city !== undefined) data.city = patch.city;
  if (patch.postal_code !== undefined) data.postalCode = patch.postal_code;
  if (patch.address !== undefined) data.address = patch.address;
  if (patch.size_signal !== undefined) data.sizeSignal = patch.size_signal;
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.whatsapp !== undefined) data.whatsapp = patch.whatsapp;
  if (patch.linkedin_url !== undefined) data.linkedinUrl = patch.linkedin_url;
  if (patch.instagram_handle !== undefined) data.instagramHandle = patch.instagram_handle;
  if (patch.notes !== undefined) data.notes = patch.notes;
  return data;
}

export class CompaniesService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async list(
    query: CompanyListQuery,
  ): Promise<{ items: CompanyDto[]; page: number; pageSize: number; total: number }> {
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { domain: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.icp_vertical) where.icpVertical = query.icp_vertical;
    if (query.city) where.city = query.city;

    const [items, total] = await this.db.$transaction([
      this.db.company.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.company.count({ where }),
    ]);

    return { items: items.map(toDto), page: query.page, pageSize: query.pageSize, total };
  }

  async getById(id: string): Promise<CompanyDto> {
    const row = await this.db.company.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new CompanyNotFoundError(id);
    return toDto(row);
  }

  async create(input: CompanyCreateInput, createdById: string): Promise<CompanyDto> {
    const domain = resolveDomain(input);
    if (domain) await this.ensureDomainAvailable(domain);

    const created = await this.db.company.create({
      data: toCreateData(input, createdById, domain),
    });
    return toDto(created);
  }

  async update(id: string, patch: CompanyUpdateInput): Promise<CompanyDto> {
    const existing = await this.db.company.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new CompanyNotFoundError(id);

    let domain: string | null | undefined;
    if (patch.domain !== undefined) {
      domain = normalizeDomain(patch.domain);
      if (domain !== existing.domain) await this.ensureDomainAvailable(domain, id);
    }

    const updated = await this.db.company.update({
      where: { id },
      data: toUpdateData(patch, domain),
    });
    return toDto(updated);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.db.company.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        // Decisión UJ-02: un soft-delete libera el dominio para recrear la empresa.
        domain: null,
      },
    });
    if (result.count === 0) throw new CompanyNotFoundError(id);
  }

  private async ensureDomainAvailable(domain: string | null, excludeId?: string): Promise<void> {
    if (!domain) return;
    const existing = await this.db.company.findFirst({
      where: {
        domain,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) throw new CompanyDomainConflictError(existing.id, domain);
  }
}

export const companiesService = new CompaniesService();
