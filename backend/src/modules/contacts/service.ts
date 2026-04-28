import type { Company, Contact, Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  ContactCreateInput,
  ContactDto,
  ContactListQuery,
  ContactUpdateInput,
} from './schemas.js';

export class ContactNotFoundError extends Error {
  constructor(id: string, message = `Contacto "${id}" no encontrado`) {
    super(message);
    this.name = 'ContactNotFoundError';
  }
}

export class ContactPrimaryConflictError extends Error {
  constructor(companyId: string) {
    super(`Ya existe un contacto principal activo para la empresa "${companyId}"`);
    this.name = 'ContactPrimaryConflictError';
  }
}

export class ContactCompanyNotFoundError extends Error {
  constructor(companyId: string) {
    super(`Empresa "${companyId}" no encontrada`);
    this.name = 'ContactCompanyNotFoundError';
  }
}

function toDto(row: Contact): ContactDto {
  return {
    id: row.id,
    company_id: row.companyId,
    first_name: row.firstName,
    last_name: row.lastName,
    role_title: row.roleTitle,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    linkedin_url: row.linkedinUrl,
    is_primary: row.isPrimary,
    consent_status: row.consentStatus,
    created_by_id: row.createdById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    anonymized_at: row.anonymizedAt?.toISOString() ?? null,
  };
}

function toCreateData(input: ContactCreateInput, createdById: string): Prisma.ContactCreateInput {
  return {
    firstName: input.first_name,
    lastName: input.last_name ?? null,
    roleTitle: input.role_title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    linkedinUrl: input.linkedin_url ?? null,
    isPrimary: input.is_primary,
    consentStatus: input.consent_status,
    createdBy: { connect: { id: createdById } },
    ...(input.company_id ? { company: { connect: { id: input.company_id } } } : {}),
  };
}

function toUpdateData(patch: ContactUpdateInput): Prisma.ContactUpdateInput {
  const data: Prisma.ContactUpdateInput = {};
  if (patch.first_name !== undefined) data.firstName = patch.first_name;
  if (patch.last_name !== undefined) data.lastName = patch.last_name;
  if (patch.role_title !== undefined) data.roleTitle = patch.role_title;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.whatsapp !== undefined) data.whatsapp = patch.whatsapp;
  if (patch.linkedin_url !== undefined) data.linkedinUrl = patch.linkedin_url;
  if (patch.company_id !== undefined) {
    data.company = patch.company_id ? { connect: { id: patch.company_id } } : { disconnect: true };
  }
  if (patch.is_primary !== undefined) data.isPrimary = patch.is_primary;
  if (patch.consent_status !== undefined) data.consentStatus = patch.consent_status;
  return data;
}

interface ActiveCompanyReader {
  company: {
    findFirst(args: { where: { id: string; deletedAt: null } }): Promise<Company | null>;
  };
}

export class ContactsService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async list(
    query: ContactListQuery,
  ): Promise<{ items: ContactDto[]; page: number; pageSize: number; total: number }> {
    const where: Prisma.ContactWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.company_id) where.companyId = query.company_id;
    if (query.is_primary !== undefined) where.isPrimary = query.is_primary;

    const [items, total] = await this.db.$transaction([
      this.db.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.contact.count({ where }),
    ]);

    return { items: items.map(toDto), page: query.page, pageSize: query.pageSize, total };
  }

  async getById(id: string): Promise<ContactDto> {
    const row = await this.db.contact.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new ContactNotFoundError(id);
    return toDto(row);
  }

  async create(input: ContactCreateInput, createdById: string): Promise<ContactDto> {
    if (input.company_id) await this.ensureCompanyExists(input.company_id);

    if (input.is_primary && input.company_id) {
      const companyId = input.company_id;
      return this.db.$transaction(async (tx) => {
        await this.unmarkPrimaryForCompany(tx, companyId);
        const created = await tx.contact.create({ data: toCreateData(input, createdById) });
        return toDto(created);
      });
    }

    const created = await this.db.contact.create({ data: toCreateData(input, createdById) });
    return toDto(created);
  }

  async update(id: string, patch: ContactUpdateInput): Promise<ContactDto> {
    const existing = await this.db.contact.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ContactNotFoundError(id);

    if (patch.company_id !== undefined && patch.company_id !== null) {
      await this.ensureCompanyExists(patch.company_id);
    }

    const effectiveCompanyId =
      patch.company_id !== undefined ? patch.company_id : existing.companyId;
    const effectiveIsPrimary =
      patch.is_primary !== undefined ? patch.is_primary : existing.isPrimary;
    const shouldResetPrimary =
      Boolean(effectiveCompanyId) &&
      effectiveIsPrimary &&
      (patch.is_primary === true || patch.company_id !== undefined);

    if (shouldResetPrimary && effectiveCompanyId) {
      return this.db.$transaction(async (tx) => {
        await this.unmarkPrimaryForCompany(tx, effectiveCompanyId, id);
        const updated = await tx.contact.update({ where: { id }, data: toUpdateData(patch) });
        return toDto(updated);
      });
    }

    const updated = await this.db.contact.update({ where: { id }, data: toUpdateData(patch) });
    return toDto(updated);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.db.contact.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isPrimary: false },
    });
    if (result.count === 0) throw new ContactNotFoundError(id);
  }

  async anonymize(id: string, actorUserId: string, ip: string | null): Promise<ContactDto> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.contact.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new ContactNotFoundError(id);
      if (existing.anonymizedAt) throw new ContactNotFoundError(id, 'Ya anonimizado');

      const updated = await tx.contact.update({
        where: { id },
        data: {
          firstName: 'Anonymized',
          lastName: `#${id.slice(-6).toUpperCase()}`,
          roleTitle: null,
          email: null,
          phone: null,
          whatsapp: null,
          linkedinUrl: null,
          isPrimary: false,
          consentStatus: 'revoked',
          anonymizedAt: new Date(),
        },
      });

      await this.audit.record({
        action: 'contact.anonymize',
        actorUserId,
        entityType: 'contact',
        entityId: id,
        metadata: {
          had_email: Boolean(existing.email),
          had_phone: Boolean(existing.phone),
          had_company: Boolean(existing.companyId),
        } satisfies Prisma.InputJsonValue,
        ip,
      });

      return toDto(updated);
    });
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const existing = await this.findActiveCompany(this.db, companyId);
    if (!existing) throw new ContactCompanyNotFoundError(companyId);
  }

  private async findActiveCompany(
    db: ActiveCompanyReader,
    companyId: string,
  ): Promise<Company | null> {
    return db.company.findFirst({ where: { id: companyId, deletedAt: null } });
  }

  private async unmarkPrimaryForCompany(
    db: Prisma.TransactionClient,
    companyId: string,
    excludeId?: string,
  ): Promise<void> {
    await db.contact.updateMany({
      where: {
        companyId,
        deletedAt: null,
        isPrimary: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: { isPrimary: false },
    });
  }
}

export const contactsService = new ContactsService();
