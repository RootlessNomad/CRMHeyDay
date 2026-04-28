import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type { SearchHit, SearchQuery, SearchResults } from './schemas.js';

type CompanySearchRow = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  updatedAt: Date;
};

type ContactSearchRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  updatedAt: Date;
};

type LeadSearchRow = {
  id: string;
  updatedAt: Date;
  company: { name: string };
  primaryContact: { firstName: string; lastName: string | null } | null;
  stage: { name: string };
};

type ActivitySearchRow = {
  id: string;
  entityType: 'company' | 'contact' | 'lead';
  entityId: string;
  kind: string;
  title: string | null;
  body: string | null;
  updatedAt: Date;
};

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function computeScore(query: string, values: Array<string | null | undefined>): number {
  const normalizedQuery = normalize(query);
  let score = 0;

  for (const value of values) {
    const normalizedValue = normalize(value);
    if (!normalizedValue) continue;
    if (normalizedValue === normalizedQuery) score = Math.max(score, 100);
    else if (normalizedValue.startsWith(normalizedQuery)) score = Math.max(score, 50);
    else if (normalizedValue.includes(normalizedQuery)) score = Math.max(score, 10);
  }

  return score;
}

function sortHits(hits: Array<SearchHit & { updatedAt: Date }>, limit: number): SearchHit[] {
  return hits
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .slice(0, limit)
    .map(({ updatedAt: _updatedAt, ...hit }) => hit);
}

export class SearchService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async searchAll(query: SearchQuery): Promise<SearchResults> {
    const { q, limit } = query;

    const [companies, contacts, leads, activitiesRaw] = await Promise.all([
      this.db.company.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { website: { contains: q, mode: 'insensitive' } },
            { domain: { contains: q, mode: 'insensitive' } },
            { industry: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          domain: true,
          website: true,
          industry: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit * 3,
      }),
      this.db.contact.findMany({
        where: {
          deletedAt: null,
          anonymizedAt: null,
          OR: [{ companyId: null }, { company: { deletedAt: null } }],
          AND: [
            {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          roleTitle: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit * 3,
      }),
      this.db.lead.findMany({
        where: {
          deletedAt: null,
          company: { deletedAt: null },
          OR: [
            { company: { name: { contains: q, mode: 'insensitive' } } },
            {
              primaryContact: {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          ],
        },
        include: {
          company: { select: { name: true } },
          stage: { select: { name: true } },
          primaryContact: { select: { firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit * 3,
      }),
      this.db.activity.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { body: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          kind: true,
          title: true,
          body: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit * 6,
      }),
    ]);

    const activityRows = activitiesRaw as ActivitySearchRow[];

    const activityCompanyIds = new Set<string>();
    const activityContactIds = new Set<string>();
    const activityLeadIds = new Set<string>();
    for (const row of activityRows) {
      if (row.entityType === 'company') activityCompanyIds.add(row.entityId);
      else if (row.entityType === 'contact') activityContactIds.add(row.entityId);
      else if (row.entityType === 'lead') activityLeadIds.add(row.entityId);
    }

    const [aliveActivityCompanies, aliveActivityContacts, aliveActivityLeads] = await Promise.all([
      activityCompanyIds.size === 0
        ? []
        : this.db.company.findMany({
            where: { id: { in: [...activityCompanyIds] }, deletedAt: null },
            select: { id: true, name: true },
          }),
      activityContactIds.size === 0
        ? []
        : this.db.contact.findMany({
            where: {
              id: { in: [...activityContactIds] },
              deletedAt: null,
              anonymizedAt: null,
              OR: [{ companyId: null }, { company: { deletedAt: null } }],
            },
            select: { id: true, firstName: true, lastName: true },
          }),
      activityLeadIds.size === 0
        ? []
        : this.db.lead.findMany({
            where: {
              id: { in: [...activityLeadIds] },
              deletedAt: null,
              company: { deletedAt: null },
            },
            select: { id: true, company: { select: { name: true } } },
          }),
    ]);

    const companyLabel = new Map<string, string>(
      (aliveActivityCompanies as Array<{ id: string; name: string }>).map((row) => [
        row.id,
        row.name,
      ]),
    );
    const contactLabel = new Map<string, string>(
      (
        aliveActivityContacts as Array<{ id: string; firstName: string; lastName: string | null }>
      ).map((row) => [row.id, `${row.firstName} ${row.lastName ?? ''}`.trim()]),
    );
    const leadLabel = new Map<string, string>(
      (aliveActivityLeads as Array<{ id: string; company: { name: string } }>).map((row) => [
        row.id,
        row.company.name,
      ]),
    );

    function parentLabelFor(row: ActivitySearchRow): string | null {
      if (row.entityType === 'company') return companyLabel.get(row.entityId) ?? null;
      if (row.entityType === 'contact') return contactLabel.get(row.entityId) ?? null;
      return leadLabel.get(row.entityId) ?? null;
    }

    return {
      query: q,
      companies: sortHits(
        (companies as CompanySearchRow[]).map((row) => ({
          type: 'company',
          id: row.id,
          title: row.name,
          subtitle: row.domain ?? row.website ?? null,
          score: computeScore(q, [row.name, row.domain, row.website, row.industry]),
          updatedAt: row.updatedAt,
        })),
        limit,
      ),
      contacts: sortHits(
        (contacts as ContactSearchRow[]).map((row) => ({
          type: 'contact',
          id: row.id,
          title: `${row.firstName} ${row.lastName ?? ''}`.trim(),
          subtitle: row.email ?? row.roleTitle ?? null,
          score: computeScore(q, [row.lastName, row.firstName, row.email, row.phone]),
          updatedAt: row.updatedAt,
        })),
        limit,
      ),
      leads: sortHits(
        (leads as LeadSearchRow[]).map((row) => ({
          type: 'lead',
          id: row.id,
          title: row.company.name,
          subtitle: row.stage.name,
          score: computeScore(q, [
            row.company.name,
            row.primaryContact?.firstName,
            row.primaryContact?.lastName,
          ]),
          updatedAt: row.updatedAt,
        })),
        limit,
      ),
      activities: sortHits(
        activityRows
          .filter((row) => parentLabelFor(row) !== null)
          .map((row) => ({
            type: 'activity',
            id: row.id,
            title: row.title ?? '(sin título)',
            subtitle: `${row.kind} · ${parentLabelFor(row) ?? ''}`,
            score: computeScore(q, [row.title, row.body]),
            updatedAt: row.updatedAt,
          })),
        limit,
      ),
    };
  }
}

export const searchService = new SearchService();
