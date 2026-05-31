import type { Activity, Company, Contact, Lead, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { SearchQuerySchema } from './schemas.js';
import { SearchService } from './service.js';

interface SearchDb {
  companies: Company[];
  contacts: Contact[];
  leads: Lead[];
  activities?: Activity[];
}

type CompanyWherePart =
  | { name: { contains: string } }
  | { website: { contains: string } }
  | { domain: { contains: string } }
  | { industry: { contains: string } };

type ContactWherePart =
  | { firstName: { contains: string } }
  | { lastName: { contains: string } }
  | { email: { contains: string } }
  | { phone: { contains: string } };

type LeadCompanyWherePart = { company: { name: { contains: string } } };
type LeadPrimaryContactWherePart = {
  primaryContact: {
    OR: Array<{ firstName: { contains: string } } | { lastName: { contains: string } }>;
  };
};

function includesInsensitive(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

function buildSearchPrisma(db: SearchDb): PrismaClient {
  const activities = db.activities ?? [];

  const prisma = {
    company: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const where = args.where as {
          deletedAt?: null;
          id?: { in: string[] };
          OR?: CompanyWherePart[];
        };
        let rows = db.companies.filter((row) => row.deletedAt === null);
        if (where.id?.in) rows = rows.filter((row) => where.id!.in.includes(row.id));
        if (where.OR) {
          rows = rows.filter((row) =>
            where.OR!.some((part) => {
              if ('name' in part) return includesInsensitive(row.name, part.name.contains);
              if ('website' in part) return includesInsensitive(row.website, part.website.contains);
              if ('domain' in part) return includesInsensitive(row.domain, part.domain.contains);
              if ('industry' in part)
                return includesInsensitive(row.industry, part.industry.contains);
              return false;
            }),
          );
        }
        return rows
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, args.take ?? rows.length);
      },
    },
    contact: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const where = args.where as {
          deletedAt?: null;
          anonymizedAt?: null;
          id?: { in: string[] };
          OR?: Array<{ companyId: null } | { company: { deletedAt: null } }>;
          AND?: Array<{ OR: ContactWherePart[] }>;
        };
        let rows = db.contacts.filter((row) => row.deletedAt === null && row.anonymizedAt === null);
        if (where.id?.in) rows = rows.filter((row) => where.id!.in.includes(row.id));
        rows = rows.filter((row) => {
          if (row.companyId === null) return true;
          const company = db.companies.find((item) => item.id === row.companyId);
          return company?.deletedAt === null;
        });
        if (where.AND) {
          rows = rows.filter((row) =>
            (where.AND![0]?.OR ?? []).some((part) => {
              if ('firstName' in part) {
                return includesInsensitive(row.firstName, part.firstName.contains);
              }
              if ('lastName' in part) {
                return includesInsensitive(row.lastName, part.lastName.contains);
              }
              if ('email' in part) return includesInsensitive(row.email, part.email.contains);
              if ('phone' in part) return includesInsensitive(row.phone, part.phone.contains);
              return false;
            }),
          );
        }
        return rows
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, args.take ?? rows.length);
      },
    },
    lead: {
      findMany: async (args: {
        where: Record<string, unknown>;
        include?: unknown;
        select?: unknown;
        take?: number;
      }) => {
        const where = args.where as {
          deletedAt?: null;
          company?: { deletedAt: null };
          id?: { in: string[] };
          OR?: Array<LeadCompanyWherePart | LeadPrimaryContactWherePart>;
        };
        let rows = db.leads.filter((row) => row.deletedAt === null);
        rows = rows.filter((row) => {
          const company = db.companies.find((item) => item.id === row.companyId);
          return company?.deletedAt === null;
        });
        if (where.id?.in) rows = rows.filter((row) => where.id!.in.includes(row.id));
        if (where.OR) {
          rows = rows.filter((row) => {
            const company = db.companies.find((item) => item.id === row.companyId)!;
            const contact = row.primaryContactId
              ? (db.contacts.find((item) => item.id === row.primaryContactId) ?? null)
              : null;
            return where.OR!.some((part) => {
              if ('company' in part && 'name' in part.company) {
                return includesInsensitive(company.name, part.company.name.contains);
              }
              if (!('primaryContact' in part)) return false;
              return part.primaryContact.OR.some(
                (
                  contactPart:
                    | { firstName: { contains: string } }
                    | { lastName: { contains: string } },
                ) => {
                  if ('firstName' in contactPart) {
                    return includesInsensitive(contact?.firstName, contactPart.firstName.contains);
                  }
                  if ('lastName' in contactPart) {
                    return includesInsensitive(contact?.lastName, contactPart.lastName.contains);
                  }
                  return false;
                },
              );
            });
          });
        }
        return rows
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, args.take ?? rows.length)
          .map((row) => ({
            ...row,
            company: {
              name: db.companies.find((item) => item.id === row.companyId)!.name,
            },
            stage: { name: `Stage ${row.stageId}` },
            primaryContact: row.primaryContactId
              ? (() => {
                  const contact = db.contacts.find((item) => item.id === row.primaryContactId)!;
                  return { firstName: contact.firstName, lastName: contact.lastName };
                })()
              : null,
          }));
      },
    },
    activity: {
      findMany: async (args: { where: Record<string, unknown>; take?: number }) => {
        const where = args.where as {
          OR: Array<{ title: { contains: string } } | { body: { contains: string } }>;
        };
        return activities
          .filter((row) =>
            where.OR.some((part) => {
              if ('title' in part) return includesInsensitive(row.title, part.title.contains);
              if ('body' in part) return includesInsensitive(row.body, part.body.contains);
              return false;
            }),
          )
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, args.take ?? activities.length);
      },
    },
  };

  return prisma as unknown as PrismaClient;
}

function makeCompany(input: {
  id: string;
  name: string;
  website?: string | null;
  domain?: string | null;
  industry?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date;
}) {
  const now = input.updatedAt ?? new Date('2026-04-01T10:00:00.000Z');
  return {
    id: input.id,
    name: input.name,
    website: input.website ?? null,
    domain: input.domain ?? null,
    industry: input.industry ?? null,
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
    createdById: 'user_1',
    createdAt: now,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  } satisfies Company;
}

function makeContact(input: {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  companyId?: string | null;
  anonymizedAt?: Date | null;
  deletedAt?: Date | null;
  updatedAt?: Date;
}) {
  const now = input.updatedAt ?? new Date('2026-04-01T10:00:00.000Z');
  return {
    id: input.id,
    companyId: input.companyId ?? null,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    roleTitle: input.roleTitle ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: null,
    linkedinUrl: null,
    isPrimary: false,
    consentStatus: 'explicit_granted',
    createdById: 'user_1',
    createdAt: now,
    updatedAt: now,
    anonymizedAt: input.anonymizedAt ?? null,
    deletedAt: input.deletedAt ?? null,
  } satisfies Contact;
}

function makeLead(input: {
  id: string;
  companyId: string;
  stageId: string;
  primaryContactId?: string | null;
  deletedAt?: Date | null;
  updatedAt?: Date;
}) {
  const now = input.updatedAt ?? new Date('2026-04-01T10:00:00.000Z');
  return {
    id: input.id,
    ownerId: 'user_1',
    pipelineId: 'pipe_1',
    stageId: input.stageId,
    companyId: input.companyId,
    primaryContactId: input.primaryContactId ?? null,
    source: 'manual',
    status: 'open',
    priorityScore: 0,
    priorityManual: null,
    nextActionAt: null,
    lostReason: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: input.deletedAt ?? null,
  } satisfies Lead;
}

function makeActivity(input: {
  id: string;
  entityType: 'company' | 'contact' | 'lead';
  entityId: string;
  kind?: string;
  title?: string | null;
  body?: string | null;
  updatedAt?: Date;
}): Activity {
  const now = input.updatedAt ?? new Date('2026-04-01T10:00:00.000Z');
  return {
    id: input.id,
    kind: (input.kind ?? 'note') as Activity['kind'],
    entityType: input.entityType as Activity['entityType'],
    entityId: input.entityId,
    title: input.title ?? null,
    body: input.body ?? null,
    ownerId: 'user_1',
    dueAt: null,
    completedAt: null,
    remindAt: null,
    createdById: 'user_1',
    createdAt: now,
    updatedAt: now,
  } satisfies Activity;
}

describe('search service', () => {
  it('respeta soft-delete y anonymizedAt', async () => {
    const service = new SearchService(
      buildSearchPrisma({
        companies: [
          makeCompany({ id: 'company_ok', name: 'Acme', domain: 'acme.io' }),
          makeCompany({
            id: 'company_deleted',
            name: 'Acme Deleted',
            domain: 'deleted.io',
            deletedAt: new Date('2026-04-02T10:00:00.000Z'),
          }),
        ],
        contacts: [
          makeContact({
            id: 'contact_ok',
            firstName: 'Ana',
            email: 'ana@acme.io',
            companyId: 'company_ok',
          }),
          makeContact({
            id: 'contact_anon',
            firstName: 'Anon',
            email: 'anon@acme.io',
            anonymizedAt: new Date('2026-04-02T10:00:00.000Z'),
          }),
        ],
        leads: [],
      }),
    );

    const results = await service.searchAll({ q: 'ac', limit: 10 });
    expect(results.companies.map((hit) => hit.id)).toEqual(['company_ok']);
    expect(results.contacts.map((hit) => hit.id)).toEqual(['contact_ok']);
  });

  it('ordena companies por exact > prefix > substring', async () => {
    const service = new SearchService(
      buildSearchPrisma({
        companies: [
          makeCompany({
            id: 'company_sub',
            name: 'Beta Acme Partners',
            updatedAt: new Date('2026-04-01T09:00:00.000Z'),
          }),
          makeCompany({
            id: 'company_prefix',
            name: 'Acme Labs',
            updatedAt: new Date('2026-04-01T08:00:00.000Z'),
          }),
          makeCompany({
            id: 'company_exact',
            name: 'Acme',
            updatedAt: new Date('2026-04-01T07:00:00.000Z'),
          }),
        ],
        contacts: [],
        leads: [],
      }),
    );

    const results = await service.searchAll({ q: 'acme', limit: 10 });
    expect(results.companies.map((hit) => hit.id)).toEqual([
      'company_exact',
      'company_prefix',
      'company_sub',
    ]);
  });

  it('rechaza q de menos de 2 caracteres vía schema', () => {
    expect(() => SearchQuerySchema.parse({ q: 'a' })).toThrow();
  });

  it('leads matchea por company y primary contact', async () => {
    const companyA = makeCompany({ id: 'company_a', name: 'Atlas Clinic' });
    const companyB = makeCompany({ id: 'company_b', name: 'Nova Health' });
    const contactA = makeContact({
      id: 'contact_a',
      firstName: 'Marina',
      lastName: 'Lopez',
      companyId: 'company_b',
    });
    const service = new SearchService(
      buildSearchPrisma({
        companies: [companyA, companyB],
        contacts: [contactA],
        leads: [
          makeLead({ id: 'lead_company', companyId: 'company_a', stageId: 'open' }),
          makeLead({
            id: 'lead_contact',
            companyId: 'company_b',
            stageId: 'qualified',
            primaryContactId: 'contact_a',
          }),
        ],
      }),
    );

    const byCompany = await service.searchAll({ q: 'atlas', limit: 10 });
    expect(byCompany.leads.map((hit) => hit.id)).toEqual(['lead_company']);

    const byContact = await service.searchAll({ q: 'marina', limit: 10 });
    expect(byContact.leads.map((hit) => hit.id)).toEqual(['lead_contact']);
  });

  it('aplica limit por tipo', async () => {
    const service = new SearchService(
      buildSearchPrisma({
        companies: [
          makeCompany({ id: 'company_1', name: 'Acme 1' }),
          makeCompany({ id: 'company_2', name: 'Acme 2' }),
          makeCompany({ id: 'company_3', name: 'Acme 3' }),
        ],
        contacts: [],
        leads: [],
      }),
    );

    const results = await service.searchAll({ q: 'acme', limit: 2 });
    expect(results.companies).toHaveLength(2);
  });

  it('excluye contactos cuya company está soft-deleted', async () => {
    const service = new SearchService(
      buildSearchPrisma({
        companies: [
          makeCompany({ id: 'company_ok', name: 'Acme' }),
          makeCompany({
            id: 'company_deleted',
            name: 'Ghost',
            deletedAt: new Date('2026-04-02T10:00:00.000Z'),
          }),
        ],
        contacts: [
          makeContact({
            id: 'contact_ok',
            firstName: 'Alice',
            email: 'alice@acme.io',
            companyId: 'company_ok',
          }),
          makeContact({
            id: 'contact_deleted_company',
            firstName: 'Alicia',
            email: 'alicia@ghost.io',
            companyId: 'company_deleted',
          }),
        ],
        leads: [],
      }),
    );

    const results = await service.searchAll({ q: 'ali', limit: 10 });
    expect(results.contacts.map((hit) => hit.id)).toEqual(['contact_ok']);
  });

  it('activities matchea por title y por body con scoring exacto > prefix > substring', async () => {
    const company = makeCompany({ id: 'company_1', name: 'Acme' });
    const service = new SearchService(
      buildSearchPrisma({
        companies: [company],
        contacts: [],
        leads: [],
        activities: [
          makeActivity({
            id: 'act_exact',
            entityType: 'company',
            entityId: 'company_1',
            kind: 'note',
            title: 'demo',
            updatedAt: new Date('2026-04-01T07:00:00.000Z'),
          }),
          makeActivity({
            id: 'act_prefix',
            entityType: 'company',
            entityId: 'company_1',
            kind: 'task',
            title: 'demo extendida',
            updatedAt: new Date('2026-04-01T08:00:00.000Z'),
          }),
          makeActivity({
            id: 'act_body',
            entityType: 'company',
            entityId: 'company_1',
            kind: 'call_log',
            title: 'Llamada follow-up',
            body: 'preparar demo del producto',
            updatedAt: new Date('2026-04-01T09:00:00.000Z'),
          }),
        ],
      }),
    );

    const results = await service.searchAll({ q: 'demo', limit: 10 });
    expect(results.activities.map((hit) => hit.id)).toEqual([
      'act_exact',
      'act_prefix',
      'act_body',
    ]);
    expect(results.activities[0]).toMatchObject({
      type: 'activity',
      title: 'demo',
      subtitle: 'note · Acme',
      score: 100,
    });
  });

  it('activities respeta anti-huérfano: excluye padres soft-deleted o contactos anonymized', async () => {
    const aliveCompany = makeCompany({ id: 'company_alive', name: 'Acme' });
    const deadCompany = makeCompany({
      id: 'company_dead',
      name: 'Ghost',
      deletedAt: new Date('2026-04-02T10:00:00.000Z'),
    });
    const aliveContact = makeContact({
      id: 'contact_alive',
      firstName: 'Ana',
      companyId: 'company_alive',
    });
    const anonContact = makeContact({
      id: 'contact_anon',
      firstName: 'Anon',
      anonymizedAt: new Date('2026-04-02T10:00:00.000Z'),
    });
    const aliveLead = makeLead({
      id: 'lead_alive',
      companyId: 'company_alive',
      stageId: 'open',
    });
    const deadLead = makeLead({
      id: 'lead_dead',
      companyId: 'company_alive',
      stageId: 'open',
      deletedAt: new Date('2026-04-02T10:00:00.000Z'),
    });
    const service = new SearchService(
      buildSearchPrisma({
        companies: [aliveCompany, deadCompany],
        contacts: [aliveContact, anonContact],
        leads: [aliveLead, deadLead],
        activities: [
          makeActivity({
            id: 'act_alive_company',
            entityType: 'company',
            entityId: 'company_alive',
            title: 'demo prod',
          }),
          makeActivity({
            id: 'act_dead_company',
            entityType: 'company',
            entityId: 'company_dead',
            title: 'demo ghost',
          }),
          makeActivity({
            id: 'act_anon_contact',
            entityType: 'contact',
            entityId: 'contact_anon',
            title: 'demo anon',
          }),
          makeActivity({
            id: 'act_dead_lead',
            entityType: 'lead',
            entityId: 'lead_dead',
            title: 'demo lead-dead',
          }),
          makeActivity({
            id: 'act_alive_lead',
            entityType: 'lead',
            entityId: 'lead_alive',
            title: 'demo lead-alive',
          }),
        ],
      }),
    );

    const results = await service.searchAll({ q: 'demo', limit: 10 });
    expect(results.activities.map((hit) => hit.id).sort()).toEqual(
      ['act_alive_company', 'act_alive_lead'].sort(),
    );
  });

  it('activities aplica limit por tipo', async () => {
    const company = makeCompany({ id: 'company_1', name: 'Acme' });
    const service = new SearchService(
      buildSearchPrisma({
        companies: [company],
        contacts: [],
        leads: [],
        activities: [
          makeActivity({ id: 'a1', entityType: 'company', entityId: 'company_1', title: 'demo a' }),
          makeActivity({ id: 'a2', entityType: 'company', entityId: 'company_1', title: 'demo b' }),
          makeActivity({ id: 'a3', entityType: 'company', entityId: 'company_1', title: 'demo c' }),
        ],
      }),
    );

    const results = await service.searchAll({ q: 'demo', limit: 2 });
    expect(results.activities).toHaveLength(2);
  });

  it('activities sin título usan placeholder en title', async () => {
    const company = makeCompany({ id: 'company_1', name: 'Acme' });
    const service = new SearchService(
      buildSearchPrisma({
        companies: [company],
        contacts: [],
        leads: [],
        activities: [
          makeActivity({
            id: 'act_no_title',
            entityType: 'company',
            entityId: 'company_1',
            title: null,
            body: 'demo en el body',
          }),
        ],
      }),
    );

    const results = await service.searchAll({ q: 'demo', limit: 10 });
    expect(results.activities[0]).toMatchObject({
      id: 'act_no_title',
      title: '(sin título)',
      subtitle: 'note · Acme',
    });
  });
});
