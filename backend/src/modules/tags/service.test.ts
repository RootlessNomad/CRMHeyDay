import type { Company, Contact, Lead, PrismaClient, Tag } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/service.js';
import type { TagAssignInput, TagCreateInput } from './schemas.js';
import {
  TagAssignmentConflictError,
  TagAssignmentEntityNotFoundError,
  TagNameConflictError,
  TagNotFoundError,
  TagsService,
} from './service.js';

interface TaggableRow {
  id: string;
  tagId: string;
  entityType: 'company' | 'contact' | 'lead' | 'content_item';
  entityId: string;
}

interface FakeDb {
  tags: Map<string, Tag>;
  taggables: Map<string, TaggableRow>;
  companies: Map<string, Company>;
  contacts: Map<string, Contact>;
  leads: Map<string, Lead>;
}

function buildFakeDb(): FakeDb {
  return {
    tags: new Map(),
    taggables: new Map(),
    companies: new Map(),
    contacts: new Map(),
    leads: new Map(),
  };
}

function includesInsensitive(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const prisma = {
    tag: {
      findMany: async ({
        where,
      }: {
        where: { name?: { contains: string; mode: 'insensitive' }; kind?: Tag['kind'] };
        orderBy: { name: 'asc' };
      }) =>
        [...db.tags.values()]
          .filter((row) => {
            if (where.kind && row.kind !== where.kind) return false;
            if (where.name && !includesInsensitive(row.name, where.name.contains)) return false;
            return true;
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      findUnique: async ({ where }: { where: { id: string } }) => db.tags.get(where.id) ?? null,
      create: async ({
        data,
      }: {
        data: { name: string; color: string | null; kind: Tag['kind'] };
      }) => {
        if ([...db.tags.values()].some((row) => row.name === data.name)) {
          throw { code: 'P2002' };
        }
        const row = makeTag({
          id: `tag_${db.tags.size + 1}`,
          name: data.name,
          color: data.color,
          kind: data.kind,
        });
        db.tags.set(row.id, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { name?: string; color?: string; kind?: Tag['kind'] };
      }) => {
        const existing = db.tags.get(where.id);
        if (!existing) throw new Error('tag not found');
        if (
          data.name &&
          [...db.tags.values()].some((row) => row.id !== where.id && row.name === data.name)
        ) {
          throw { code: 'P2002' };
        }
        const updated = {
          ...existing,
          name: data.name ?? existing.name,
          color: data.color ?? existing.color,
          kind: data.kind ?? existing.kind,
        } satisfies Tag;
        db.tags.set(updated.id, updated);
        return updated;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const existing = db.tags.get(where.id);
        if (!existing) throw new Error('tag not found');
        db.tags.delete(where.id);
        for (const [key, row] of db.taggables.entries()) {
          if (row.tagId === where.id) db.taggables.delete(key);
        }
        return existing;
      },
    },
    taggable: {
      create: async ({
        data,
      }: {
        data: { tagId: string; entityType: TaggableRow['entityType']; entityId: string };
      }) => {
        const existing = [...db.taggables.values()].find(
          (row) =>
            row.tagId === data.tagId &&
            row.entityType === data.entityType &&
            row.entityId === data.entityId,
        );
        if (existing) throw { code: 'P2002' };
        const row: TaggableRow = {
          id: `taggable_${db.taggables.size + 1}`,
          tagId: data.tagId,
          entityType: data.entityType,
          entityId: data.entityId,
        };
        db.taggables.set(row.id, row);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: { tagId: string; entityType: TaggableRow['entityType']; entityId: string };
      }) => {
        let count = 0;
        for (const [key, row] of db.taggables.entries()) {
          if (
            row.tagId === where.tagId &&
            row.entityType === where.entityType &&
            row.entityId === where.entityId
          ) {
            db.taggables.delete(key);
            count += 1;
          }
        }
        return { count };
      },
      findMany: async ({
        where,
        include,
      }: {
        where: { entityType: TaggableRow['entityType']; entityId: string };
        include: { tag: true };
      }) => {
        void include;
        return [...db.taggables.values()]
          .filter((row) => row.entityType === where.entityType && row.entityId === where.entityId)
          .map((row) => ({ ...row, tag: db.tags.get(row.tagId)! }));
      },
    },
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
      findFirst: async ({
        where,
      }: {
        where: { id: string; deletedAt: null; company: { deletedAt: null } };
      }) => {
        const lead = db.leads.get(where.id);
        if (!lead || lead.deletedAt !== null) return null;
        const company = db.companies.get(lead.companyId);
        return company?.deletedAt === null ? lead : null;
      },
    },
  };

  return prisma as unknown as PrismaClient;
}

function makeTag(input: { id: string; name: string; color?: string | null; kind?: Tag['kind'] }) {
  return {
    id: input.id,
    name: input.name,
    color: input.color ?? null,
    kind: input.kind ?? 'general',
    createdAt: new Date('2026-04-01T10:00:00.000Z'),
  } satisfies Tag;
}

function makeCompany(input: Partial<Company> & { id: string; name: string; createdById: string }) {
  const now = new Date('2026-04-01T10:00:00.000Z');
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
  const now = new Date('2026-04-01T10:00:00.000Z');
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
  const now = new Date('2026-04-01T10:00:00.000Z');
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

describe('tags service', () => {
  let db: FakeDb;
  let auditEntries: AuditEntry[];
  let service: TagsService;

  beforeEach(() => {
    db = buildFakeDb();
    auditEntries = [];
    db.tags.set('tag_a', makeTag({ id: 'tag_a', name: 'Alpha', kind: 'general' }));
    db.tags.set(
      'tag_b',
      makeTag({ id: 'tag_b', name: 'Beta', kind: 'vertical', color: '#123456' }),
    );
    db.companies.set(
      'company_1',
      makeCompany({ id: 'company_1', name: 'Acme', createdById: 'user_1' }),
    );
    db.companies.set(
      'company_deleted',
      makeCompany({
        id: 'company_deleted',
        name: 'Gone',
        createdById: 'user_1',
        deletedAt: new Date('2026-04-02T10:00:00.000Z'),
      }),
    );
    db.contacts.set(
      'contact_1',
      makeContact({
        id: 'contact_1',
        companyId: 'company_1',
        firstName: 'Ana',
        createdById: 'user_1',
        consentStatus: 'explicit_granted',
      }),
    );
    db.contacts.set(
      'contact_anon',
      makeContact({
        id: 'contact_anon',
        companyId: 'company_1',
        firstName: 'Anon',
        createdById: 'user_1',
        consentStatus: 'revoked',
        anonymizedAt: new Date('2026-04-02T10:00:00.000Z'),
      }),
    );
    db.leads.set(
      'lead_1',
      makeLead({
        id: 'lead_1',
        companyId: 'company_1',
        ownerId: 'user_1',
        pipelineId: 'pipe_1',
        stageId: 'stage_1',
      }),
    );
    db.leads.set(
      'lead_with_deleted_company',
      makeLead({
        id: 'lead_with_deleted_company',
        companyId: 'company_deleted',
        ownerId: 'user_1',
        pipelineId: 'pipe_1',
        stageId: 'stage_1',
      }),
    );

    service = new TagsService(makePrismaMock(db), {
      record: vi.fn(async (entry: AuditEntry) => {
        auditEntries.push(entry);
      }),
    } as never);
  });

  it('list filtra por q y kind y ordena por nombre', async () => {
    const rows = await service.list({ q: 'a', kind: 'general' });
    expect(rows.map((row) => row.name)).toEqual(['Alpha']);
  });

  it('getById devuelve DTO', async () => {
    await expect(service.getById('tag_b')).resolves.toMatchObject({
      id: 'tag_b',
      color: '#123456',
      kind: 'vertical',
    });
  });

  it('getById lanza not found', async () => {
    await expect(service.getById('missing')).rejects.toBeInstanceOf(TagNotFoundError);
  });

  it('create crea tag y registra audit', async () => {
    const created = await service.create({
      name: 'Persona',
      kind: 'persona',
      color: '#ABCDEF',
    } satisfies TagCreateInput);

    expect(created).toMatchObject({
      name: 'Persona',
      kind: 'persona',
      color: '#ABCDEF',
    });
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'tag.create',
      metadata: { name: 'Persona', kind: 'persona' },
    });
  });

  it('create detecta conflicto de nombre', async () => {
    await expect(service.create({ name: 'Alpha', kind: 'general' })).rejects.toBeInstanceOf(
      TagNameConflictError,
    );
  });

  it('update modifica campos y registra audit', async () => {
    const updated = await service.update('tag_a', { name: 'Alpha Prime', kind: 'vertical' });
    expect(updated).toMatchObject({ id: 'tag_a', name: 'Alpha Prime', kind: 'vertical' });
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'tag.update',
      metadata: { name: 'Alpha Prime', kind: 'vertical' },
    });
  });

  it('update lanza conflicto de nombre duplicado', async () => {
    await expect(service.update('tag_a', { name: 'Beta' })).rejects.toBeInstanceOf(
      TagNameConflictError,
    );
  });

  it('delete elimina tag y cascade de taggables', async () => {
    await service.assign({ tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' });
    await service.delete('tag_a');

    expect(db.tags.has('tag_a')).toBe(false);
    expect([...db.taggables.values()]).toHaveLength(0);
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'tag.delete',
      metadata: { name: 'Alpha' },
    });
  });

  it('assign crea relación y devuelve la tag', async () => {
    const dto = await service.assign({
      tag_id: 'tag_b',
      entity_type: 'company',
      entity_id: 'company_1',
    } satisfies TagAssignInput);

    expect(dto.id).toBe('tag_b');
    expect([...db.taggables.values()]).toEqual([
      expect.objectContaining({
        tagId: 'tag_b',
        entityType: 'company',
        entityId: 'company_1',
      }),
    ]);
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'tag.assign',
      metadata: { tag_id: 'tag_b', entity_type: 'company', entity_id: 'company_1' },
    });
  });

  it('assign falla si la entidad company está soft-deleted', async () => {
    await expect(
      service.assign({ tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_deleted' }),
    ).rejects.toBeInstanceOf(TagAssignmentEntityNotFoundError);
  });

  it('assign falla si el contacto está anonimizado', async () => {
    await expect(
      service.assign({ tag_id: 'tag_a', entity_type: 'contact', entity_id: 'contact_anon' }),
    ).rejects.toBeInstanceOf(TagAssignmentEntityNotFoundError);
  });

  it('assign falla si el lead no existe o su company está borrada', async () => {
    await expect(
      service.assign({ tag_id: 'tag_a', entity_type: 'lead', entity_id: 'missing_lead' }),
    ).rejects.toBeInstanceOf(TagAssignmentEntityNotFoundError);

    await expect(
      service.assign({
        tag_id: 'tag_a',
        entity_type: 'lead',
        entity_id: 'lead_with_deleted_company',
      }),
    ).rejects.toBeInstanceOf(TagAssignmentEntityNotFoundError);
  });

  it('assign duplicado lanza conflicto', async () => {
    const input = { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' } as const;
    await service.assign(input);
    await expect(service.assign(input)).rejects.toBeInstanceOf(TagAssignmentConflictError);
  });

  it('assign rechaza content_item en M5', async () => {
    await expect(
      service.assign({ tag_id: 'tag_a', entity_type: 'content_item', entity_id: 'content_1' }),
    ).rejects.toBeInstanceOf(TagAssignmentEntityNotFoundError);
  });

  it('unassign es idempotente y registra audit', async () => {
    await service.unassign({ tag_id: 'tag_a', entity_type: 'lead', entity_id: 'lead_1' });
    expect(auditEntries.at(-1)).toMatchObject({
      action: 'tag.unassign',
      metadata: { tag_id: 'tag_a', entity_type: 'lead', entity_id: 'lead_1' },
    });
  });

  it('getForEntity devuelve tags ordenadas por nombre', async () => {
    await service.assign({ tag_id: 'tag_b', entity_type: 'company', entity_id: 'company_1' });
    await service.assign({ tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' });

    const rows = await service.getForEntity('company', 'company_1');
    expect(rows.map((row) => row.name)).toEqual(['Alpha', 'Beta']);
  });
});
