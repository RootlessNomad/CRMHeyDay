import type {
  Company,
  EnrichmentRun,
  EnrichmentSourceHit,
  PainPointCategory,
  PrismaClient,
  ServiceLine,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runEnrichment } from './handler.js';

function makeCompany(overrides: Partial<Company> = {}): Company {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'company_1',
    name: 'ACME',
    website: 'http://acme.test',
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
    demoLink: null,
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
    inputUrl: null,
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    summary: {},
    createdAt: new Date('2026-05-02T10:00:00.000Z'),
    ...overrides,
  };
}

function makeCategories(): PainPointCategory[] {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return [
    {
      id: 'cat_weak_website',
      key: 'weak_website',
      labelEs: 'Web débil',
      descriptionEs: 'desc',
      defaultServiceRecommendations: ['web_revamp'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat_no_seo',
      key: 'no_seo',
      labelEs: 'Sin SEO',
      descriptionEs: 'desc',
      defaultServiceRecommendations: ['seo'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat_weak_social',
      key: 'weak_social_presence',
      labelEs: 'Social flojo',
      descriptionEs: 'desc',
      defaultServiceRecommendations: ['social'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cat_no_automation',
      key: 'no_automation',
      labelEs: 'Sin automatización',
      descriptionEs: 'desc',
      defaultServiceRecommendations: ['automation'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function makeServiceLines(): ServiceLine[] {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return [
    {
      id: 'svc_automation',
      key: 'automation',
      labelEs: 'Automatización',
      descriptionEs: 'desc',
      subCapabilities: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'svc_web',
      key: 'web_revamp',
      labelEs: 'Web Revamp',
      descriptionEs: 'desc',
      subCapabilities: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'svc_seo',
      key: 'seo',
      labelEs: 'SEO',
      descriptionEs: 'desc',
      subCapabilities: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function buildDeps(options: {
  company?: Company;
  run?: EnrichmentRun;
  scrapeResult?: {
    status: 'ok' | 'blocked' | 'not_found' | 'error';
    html?: string;
    textContent?: string;
    excerpt?: string;
    error?: string;
  };
  extractText?: string;
  painPointsText?: string;
  serviceFitText?: string;
  failPainPointCreateMany?: boolean;
  failPainPointsAi?: boolean;
  failServiceFitAi?: boolean;
}) {
  const company = options.company ?? makeCompany();
  const run = options.run ?? makeRun();
  const categories = makeCategories();
  const serviceLines = makeServiceLines();
  const sourceHits: EnrichmentSourceHit[] = [];
  const companyUpdates: Array<Record<string, unknown>> = [];
  const painPointsCreates: Array<Array<Record<string, unknown>>> = [];
  const serviceFitCreates: Array<Array<Record<string, unknown>>> = [];
  const auditRecord = vi.fn(async () => {});
  let sourceHitCounter = 1;

  const prisma = {
    enrichmentRun: {
      findFirst: vi.fn(async () => run),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...run, ...data })),
    },
    company: {
      findFirst: vi.fn(async () => company),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        companyUpdates.push(data);
        return { ...company, ...data };
      }),
    },
    painPointCategory: {
      findMany: vi.fn(async () => categories),
    },
    enrichmentSourceHit: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `hit_${sourceHitCounter++}`,
          runId: run.id,
          sourceType: 'website_scrape',
          sourceUrl: (data['sourceUrl'] as string | null) ?? null,
          status: data['status'] as EnrichmentSourceHit['status'],
          fetchedAt: data['fetchedAt'] as Date,
          responseExcerpt: (data['responseExcerpt'] as string | null) ?? null,
          extracted: (data['extracted'] as object) ?? {},
          error: (data['error'] as string | null) ?? null,
        } satisfies EnrichmentSourceHit;
        sourceHits.push(row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = sourceHits.find((item) => item.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      ),
    },
    painPoint: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        if (options.failPainPointCreateMany) throw new Error('createMany failed');
        painPointsCreates.push(data);
        return { count: data.length };
      }),
    },
    serviceLine: {
      findMany: vi.fn(async () => serviceLines),
    },
    serviceFitRecommendation: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        serviceFitCreates.push(data);
        return { count: data.length };
      }),
    },
  } as unknown as PrismaClient;

  const ai = {
    complete: vi.fn(async ({ feature }: { feature: string }) => {
      if (feature === 'lead_enrichment_extract') {
        return {
          text:
            options.extractText ??
            JSON.stringify({
              industry: 'Retail',
              city: 'Madrid',
              linkedinUrl: 'https://linkedin.com/acme',
            }),
          modelUsed: 'claude-haiku',
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          costUsd: 0.01,
          attempts: 1,
        };
      }
      if (feature === 'pain_points') {
        if (options.failPainPointsAi) throw new Error('pain points failed');
        return {
          text:
            options.painPointsText ??
            JSON.stringify([
              {
                categoryKey: 'weak_website',
                confidence: 'inferred',
                evidenceText: 'Reservas por WhatsApp',
                evidenceSourceUrl: 'http://acme.test',
              },
            ]),
          modelUsed: 'claude-sonnet',
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          costUsd: 0.01,
          attempts: 1,
        };
      }
      if (options.failServiceFitAi) throw new Error('service fit failed');
      return {
        text:
          options.serviceFitText ??
          JSON.stringify([
            {
              serviceLineKey: 'web_revamp',
              rationaleEs: 'La web actual no transmite propuesta clara.',
              expectedOutcomeEs: 'Mejorar conversión.',
              fitScore: 82,
            },
          ]),
        modelUsed: 'claude-sonnet',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
        costUsd: 0.01,
        attempts: 1,
      };
    }),
  };

  const scrape = vi.fn(async () => ({
    url: company.website ?? 'http://acme.test',
    finalUrl: company.website ?? 'http://acme.test',
    fetchedAt: new Date('2026-05-02T10:00:00.000Z').toISOString(),
    status: options.scrapeResult?.status ?? 'ok',
    html:
      options.scrapeResult && 'html' in options.scrapeResult
        ? options.scrapeResult.html
        : '<html><head><meta name="description" content="ACME"></head><body><script>gtag("x")</script><h1>ACME</h1><p>Reservas por WhatsApp</p></body></html>',
    textContent:
      options.scrapeResult && 'textContent' in options.scrapeResult
        ? options.scrapeResult.textContent
        : 'ACME Reservas por WhatsApp',
    excerpt:
      options.scrapeResult && 'excerpt' in options.scrapeResult
        ? options.scrapeResult.excerpt
        : '<html><body><h1>ACME</h1></body></html>',
    error: options.scrapeResult?.error,
  }));

  return {
    prisma,
    ai,
    scrape,
    auditRecord,
    sourceHits,
    companyUpdates,
    painPointsCreates,
    serviceFitCreates,
  };
}

describe('runEnrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path crea reglas, pain points Claude y service fit', async () => {
    const deps = buildDeps({
      scrapeResult: {
        status: 'ok',
        html: '<html><head><meta name="description" content="ACME"></head><body><script>gtag("x")</script><h1>ACME</h1><p>Reservas por WhatsApp</p></body></html>',
        textContent: 'ACME Reservas por WhatsApp',
      },
    });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual', actorUserId: 'user_1' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
        now: () => new Date('2026-05-02T10:00:00.000Z'),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.summary?.['status']).toBe('succeeded');
    expect(result.summary?.['painPointsByOrigin']).toEqual({ rule: 2, claude: 1 });
    expect(result.summary?.['serviceFitsCreated']).toBe(1);
    expect(deps.companyUpdates[0]).toMatchObject({ industry: 'Retail', city: 'Madrid' });
  });

  it('sin website crea source hit not_found y termina succeeded', async () => {
    const deps = buildDeps({ company: makeCompany({ website: null }) });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(result.summary?.['status']).toBe('succeeded');
    expect(result.summary?.['painPointsCreated']).toBe(0);
    expect(deps.sourceHits[0]?.status).toBe('not_found');
  });

  it('scrape blocked deja run partial y salta Sonnet', async () => {
    const deps = buildDeps({
      scrapeResult: { status: 'blocked', html: undefined, textContent: undefined, error: 'robots' },
    });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(result.summary?.['status']).toBe('partial');
    expect(result.summary?.['painPointsByOrigin']).toEqual({ rule: 1, claude: 0 });
    expect(deps.ai.complete).not.toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'pain_points' }),
    );
  });

  it('si Haiku devuelve JSON inválido no actualiza company', async () => {
    const deps = buildDeps({ extractText: '{invalid' });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(result.summary?.['status']).toBe('partial');
    expect(deps.companyUpdates).toHaveLength(0);
  });

  it('si Sonnet falla usa fallback rule para service fit y run partial', async () => {
    const deps = buildDeps({ failPainPointsAi: true, failServiceFitAi: true });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(result.summary?.['status']).toBe('partial');
    expect(result.summary?.['serviceFitsCreated']).toBe(1);
    expect(deps.serviceFitCreates[0]?.every((item) => item['generatedBy'] === 'rule')).toBe(true);
  });

  it('no pisa el name existente', async () => {
    const deps = buildDeps({
      extractText: JSON.stringify({ name: 'ACME Inc', industry: 'Retail' }),
    });

    await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(deps.companyUpdates[0]).toMatchObject({ industry: 'Retail' });
    expect(deps.companyUpdates[0]?.['name']).toBeUndefined();
  });

  it('descarta categoryKey desconocido', async () => {
    const deps = buildDeps({
      painPointsText: JSON.stringify([
        {
          categoryKey: 'unknown_key',
          confidence: 'speculative',
          evidenceText: 'texto',
          evidenceSourceUrl: 'http://acme.test',
        },
      ]),
    });

    const result = await runEnrichment(
      { companyId: 'company_1', reason: 'manual' },
      {
        prisma: deps.prisma,
        ai: deps.ai,
        scrape: deps.scrape,
        audit: { record: deps.auditRecord } as never,
      },
    );

    expect(result.summary?.['painPointsByOrigin']).toEqual({ rule: 2, claude: 0 });
  });

  it('si createMany falla marca failed y propaga error', async () => {
    const deps = buildDeps({ failPainPointCreateMany: true });

    await expect(
      runEnrichment(
        { companyId: 'company_1', reason: 'manual' },
        {
          prisma: deps.prisma,
          ai: deps.ai,
          scrape: deps.scrape,
          audit: { record: deps.auditRecord } as never,
        },
      ),
    ).rejects.toThrow('createMany failed');

    expect(deps.prisma.enrichmentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorMessage: 'createMany failed' }),
      }),
    );
  });
});
