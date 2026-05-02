import type { Company, EnrichmentRun, EnrichmentSourceHit, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IntelNotFoundError, IntelService, IntelValidationError } from './service.js';

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));

vi.mock('../../core/queue/queues.js', () => ({
  QUEUE_NAMES: { enrichment: 'enrichment' },
  enqueue: enqueueMock,
}));

function makeCompany(overrides: Partial<Company> = {}): Company {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'company_1',
    name: 'ACME',
    website: 'https://acme.test',
    domain: 'acme.test',
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
    createdById: 'user_1',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<EnrichmentRun> = {}): EnrichmentRun {
  return {
    id: 'run_1',
    companyId: 'company_1',
    triggeredById: 'user_1',
    status: 'queued',
    inputUrl: 'https://acme.test',
    startedAt: new Date('2026-05-02T10:00:00.000Z'),
    finishedAt: new Date('2026-05-02T10:01:00.000Z'),
    errorMessage: null,
    summary: { ok: true },
    createdAt: new Date('2026-05-02T10:00:00.000Z'),
    ...overrides,
  };
}

function makeSourceHit(overrides: Partial<EnrichmentSourceHit> = {}): EnrichmentSourceHit {
  return {
    id: 'hit_1',
    runId: 'run_1',
    sourceType: 'website_scrape',
    sourceUrl: 'https://acme.test',
    status: 'ok',
    fetchedAt: new Date('2026-05-02T10:00:30.000Z'),
    responseExcerpt: '<html></html>',
    extracted: {},
    error: null,
    ...overrides,
  };
}

function buildPrisma() {
  const companies = [makeCompany()];
  const runs = [makeRun()];

  const prisma = {
    company: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where['id'])
          return (
            companies.find((item) => item.id === where['id'] && item.deletedAt === null) ?? null
          );
        if (where['domain'])
          return (
            companies.find((item) => item.domain === where['domain'] && item.deletedAt === null) ??
            null
          );
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = makeCompany({
          id: 'company_new',
          name: data['name'] as string,
          website: data['website'] as string,
          domain: (data['domain'] as string | null) ?? null,
          createdById: (data['createdBy'] as { connect: { id: string } }).connect.id,
        });
        companies.push(row);
        return row;
      }),
    },
    enrichmentRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = makeRun({
          id: 'run_new',
          companyId: data['companyId'] as string,
          triggeredById: data['triggeredById'] as string,
          status: data['status'] as EnrichmentRun['status'],
          inputUrl: (data['inputUrl'] as string | null) ?? null,
        });
        runs.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'run_missing') return null;
        return { ...makeRun(), sourceHits: [makeSourceHit()] };
      }),
      findMany: vi.fn(async () => [
        makeRun({ id: 'run_2', createdAt: new Date('2026-05-02T11:00:00.000Z') }),
        makeRun({ id: 'run_1', createdAt: new Date('2026-05-02T10:00:00.000Z') }),
      ]),
    },
    painPoint: {
      count: vi.fn(async () => 3),
    },
    serviceFitRecommendation: {
      count: vi.fn(async () => 1),
    },
  } as unknown as PrismaClient;

  return { prisma, companies, runs };
}

describe('IntelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMock.mockResolvedValue({ jobId: 'job_1', bullJobId: 'job_1' });
  });

  it('create con companyId existente', async () => {
    const { prisma } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    const result = await service.createEnrichmentRun({ companyId: 'company_1' }, 'user_1');

    expect(result.run.company_id).toBe('company_1');
    expect(result.jobId).toBe('job_1');
  });

  it('create con inputUrl nuevo crea company preliminar', async () => {
    const { prisma, companies } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.createEnrichmentRun(
      { inputUrl: 'https://nuevo.test/path' },
      'user_1',
    );

    expect(result.run.company_id).toBe('company_new');
    expect(companies.some((item) => item.domain === 'nuevo.test')).toBe(true);
  });

  it('create con inputUrl existente reusa company por domain', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.createEnrichmentRun(
      { inputUrl: 'https://acme.test/landing' },
      'user_1',
    );

    expect(result.run.company_id).toBe('company_1');
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it('create con companyId inexistente lanza NotFoundError', async () => {
    const { prisma } = buildPrisma();
    prisma.company.findFirst = vi.fn(async () => null) as never;
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.createEnrichmentRun({ companyId: 'missing' }, 'user_1'),
    ).rejects.toBeInstanceOf(IntelNotFoundError);
  });

  it('create con company soft-deleted rechaza', async () => {
    const { prisma } = buildPrisma();
    prisma.company.findFirst = vi.fn(async () => null) as never;
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.createEnrichmentRun({ companyId: 'company_1' }, 'user_1'),
    ).rejects.toBeInstanceOf(IntelNotFoundError);
  });

  it('create sin companyId ni inputUrl lanza ValidationError', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(service.createEnrichmentRun({}, 'user_1')).rejects.toBeInstanceOf(
      IntelValidationError,
    );
  });

  it('getEnrichmentRun devuelve sourceHits y counts', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.getEnrichmentRun('run_1');

    expect(result.source_hits).toHaveLength(1);
    expect(result.pain_points_created_count).toBe(3);
    expect(result.service_fits_created_count).toBe(1);
  });

  it('getEnrichmentRun 404', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(service.getEnrichmentRun('run_missing')).rejects.toBeInstanceOf(
      IntelNotFoundError,
    );
  });

  it('listByCompany devuelve runs en desc', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.listByCompany('company_1');

    expect(result.map((item) => item.id)).toEqual(['run_2', 'run_1']);
  });

  it('encola exactamente una vez con payload correcto', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await service.createEnrichmentRun({ companyId: 'company_1' }, 'user_9');

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith('enrichment', {
      companyId: 'company_1',
      reason: 'manual',
      actorUserId: 'user_9',
    });
  });

  it('registra audit al crear', async () => {
    const { prisma } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    await service.createEnrichmentRun({ companyId: 'company_1' }, 'user_1');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'enrichment.run.created',
        actorUserId: 'user_1',
      }),
    );
  });
});
