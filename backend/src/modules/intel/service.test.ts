import type {
  Activity,
  Company,
  EnrichmentRun,
  EnrichmentSourceHit,
  Lead,
  OutboundPrep,
  PainPoint,
  PainPointCategory,
  PrismaClient,
  ServiceFitRecommendation,
  ServiceLine,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IntelNotFoundError,
  IntelService,
  IntelValidationError,
  OutboundPrepNotFoundError,
  PainPointNotFoundError,
} from './service.js';

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

function makePainPointCategory(overrides: Partial<PainPointCategory> = {}): PainPointCategory {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'category_1',
    key: 'late_replies',
    labelEs: 'Respuestas tardías',
    descriptionEs: 'Demora al responder clientes.',
    defaultServiceRecommendations: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePainPoint(overrides: Partial<PainPoint> = {}): PainPoint {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'pain_point_1',
    companyId: 'company_1',
    categoryId: 'category_1',
    confidence: 'observed',
    evidenceText: 'Whatsapp sin respuesta en 48h',
    evidenceSourceUrl: 'https://acme.test/reviews',
    evidenceSourceHitId: null,
    evidenceTimestamp: now,
    detectedBy: 'claude',
    humanVerified: false,
    verifiedById: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeServiceLine(overrides: Partial<ServiceLine> = {}): ServiceLine {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'service_line_1',
    key: 'website',
    labelEs: 'Website',
    descriptionEs: 'Mejora web y conversión.',
    subCapabilities: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeServiceFitRecommendation(
  overrides: Partial<ServiceFitRecommendation> = {},
): ServiceFitRecommendation {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'service_fit_1',
    companyId: 'company_1',
    serviceLineId: 'service_line_1',
    triggeringSignals: ['late_replies'],
    rationaleEs: 'Hay fricción en la atención comercial.',
    expectedOutcomeEs: 'Mejorar conversión y respuesta.',
    fitScore: 82,
    generatedBy: 'claude',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeOutboundPrep(overrides: Partial<OutboundPrep> = {}): OutboundPrep {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'outbound_prep_1',
    companyId: 'company_1',
    segment: 'Clinicas con operación comercial reactiva.',
    likelyNeed: 'Necesitan acelerar seguimiento comercial.',
    outreachAngle: 'Abrir con velocidad de respuesta y captación perdida.',
    valueProposition: 'Automatizar seguimiento y mejorar conversión.',
    servicePitch: 'Combinar automatización y optimización web.',
    toneGuidance: 'Directo, consultivo y basado en evidencia.',
    priorityScore: 78,
    sdrNotes: null,
    emailDraft: null,
    lastGeneratedAt: now,
    lastGeneratedById: 'user_1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'lead_1',
    companyId: 'company_1',
    primaryContactId: null,
    pipelineId: 'pipeline_1',
    stageId: 'stage_1',
    ownerId: 'owner_1',
    source: 'manual',
    status: 'open',
    priorityScore: 0,
    priorityManual: null,
    nextActionAt: null,
    lostReason: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  const now = new Date('2026-05-02T10:00:00.000Z');
  return {
    id: 'activity_1',
    kind: 'task',
    entityType: 'lead',
    entityId: 'lead_1',
    title: 'Outreach: ACME',
    body: 'Pitch inicial',
    ownerId: 'owner_1',
    dueAt: new Date('2026-05-09T10:00:00.000Z'),
    completedAt: null,
    remindAt: null,
    createdById: 'user_1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildPrisma() {
  const companies = [makeCompany()];
  const runs = [makeRun()];
  const categories = [
    makePainPointCategory({
      defaultServiceRecommendations: ['website', 'automation'],
    }),
    makePainPointCategory({
      id: 'category_2',
      key: 'manual_followup',
      labelEs: 'Seguimiento manual',
      defaultServiceRecommendations: ['automation'],
    }),
  ];
  const painPoints = [
    makePainPoint(),
    makePainPoint({
      id: 'pain_point_2',
      categoryId: 'category_2',
      confidence: 'inferred',
      evidenceText: 'Seguimiento manual con retrasos',
    }),
  ];
  const serviceLines = [
    makeServiceLine(),
    makeServiceLine({
      id: 'service_line_2',
      key: 'automation',
      labelEs: 'Automatización',
      descriptionEs: 'Automatiza seguimiento comercial.',
    }),
  ];
  const serviceFits = [
    makeServiceFitRecommendation(),
    makeServiceFitRecommendation({
      id: 'service_fit_2',
      serviceLineId: 'service_line_2',
      triggeringSignals: ['late_replies', 'manual_followup'],
      rationaleEs: 'Automatización para reducir retrasos.',
      expectedOutcomeEs: 'Seguimiento más rápido.',
      fitScore: 91,
      generatedBy: 'rule',
    }),
  ];
  const outboundPreps = [makeOutboundPrep()];
  const leads = [makeLead()];
  const activities: Activity[] = [];
  let companySeq = 0;
  let runSeq = 0;
  let painPointSeq = painPoints.length;
  let activitySeq = 0;

  const withRelations = (row: PainPoint) => ({
    ...row,
    company: { name: companies.find((item) => item.id === row.companyId)?.name ?? 'Unknown' },
    category: (() => {
      const category =
        categories.find((item) => item.id === row.categoryId) ?? makePainPointCategory();
      return {
        id: category.id,
        key: category.key,
        labelEs: category.labelEs,
        defaultServiceRecommendations: category.defaultServiceRecommendations,
      };
    })(),
  });

  const withServiceFitRelations = (row: ServiceFitRecommendation) => ({
    ...row,
    serviceLine: (() => {
      const serviceLine =
        serviceLines.find((item) => item.id === row.serviceLineId) ?? makeServiceLine();
      return { id: serviceLine.id, key: serviceLine.key, labelEs: serviceLine.labelEs };
    })(),
  });

  const prisma = {
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === 'function') {
        return input(prisma as never);
      }
      return Promise.all(input as Promise<unknown>[]);
    }),
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
      findUnique: vi.fn(
        async ({ where, select }: { where: { id: string }; select?: { name: true } }) => {
          const row = companies.find((item) => item.id === where.id) ?? null;
          if (!row) return null;
          if (select?.name) return { name: row.name };
          return row;
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        companySeq += 1;
        const row = makeCompany({
          id: `company_new_${companySeq}`,
          name: data['name'] as string,
          website: data['website'] as string,
          domain: (data['domain'] as string | null) ?? null,
          createdById: (data['createdBy'] as { connect: { id: string } }).connect.id,
        });
        companies.push(row);
        return row;
      }),
    },
    lead: {
      findFirst: vi.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Record<string, unknown>;
          orderBy?: { createdAt?: 'asc' | 'desc' };
        }) => {
          const filtered = leads.filter((row) => {
            if (where['companyId'] && row.companyId !== where['companyId']) return false;
            if (where['deletedAt'] === null && row.deletedAt !== null) return false;
            const statusFilter = where['status'] as { not?: Lead['status'] } | undefined;
            if (statusFilter?.not && row.status === statusFilter.not) return false;
            return true;
          });
          filtered.sort((a, b) =>
            orderBy?.createdAt === 'asc'
              ? a.createdAt.getTime() - b.createdAt.getTime()
              : b.createdAt.getTime() - a.createdAt.getTime(),
          );
          return filtered[0] ?? null;
        },
      ),
    },
    activity: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        activitySeq += 1;
        const row = makeActivity({
          id: `activity_${activitySeq}`,
          kind: data['kind'] as Activity['kind'],
          entityType: data['entityType'] as Activity['entityType'],
          entityId: data['entityId'] as string,
          title: (data['title'] as string | null) ?? null,
          body: (data['body'] as string | null) ?? null,
          ownerId: data['ownerId'] as string,
          dueAt: (data['dueAt'] as Date | null) ?? null,
          createdById: data['createdById'] as string,
        });
        activities.push(row);
        return row;
      }),
    },
    enrichmentRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        runSeq += 1;
        const row = makeRun({
          id: `run_new_${runSeq}`,
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
      findMany: vi.fn(
        async ({
          where,
          skip = 0,
          take = painPoints.length,
        }: {
          where?: Record<string, unknown>;
          skip?: number;
          take?: number;
        }) => {
          const filtered = painPoints.filter((row) => {
            if (where?.['companyId'] && row.companyId !== where['companyId']) return false;
            if (where?.['confidence'] && row.confidence !== where['confidence']) return false;
            if (where?.['categoryId'] && row.categoryId !== where['categoryId']) return false;
            if (
              where?.['humanVerified'] !== undefined &&
              row.humanVerified !== where['humanVerified']
            ) {
              return false;
            }
            return true;
          });
          return filtered.slice(skip, skip + take).map(withRelations);
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return painPoints.find((row) => row.id === where.id) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        painPointSeq += 1;
        const row = makePainPoint({
          id: `pain_point_${painPointSeq}`,
          companyId: data['companyId'] as string,
          categoryId: data['categoryId'] as string,
          confidence: data['confidence'] as PainPoint['confidence'],
          evidenceText: data['evidenceText'] as string,
          evidenceSourceUrl: (data['evidenceSourceUrl'] as string | null) ?? null,
          evidenceTimestamp: data['evidenceTimestamp'] as Date,
          detectedBy: data['detectedBy'] as PainPoint['detectedBy'],
          humanVerified: false,
          verifiedById: null,
        });
        painPoints.push(row);
        return withRelations(row);
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = painPoints.find((item) => item.id === where.id);
          if (!row) throw new Error('missing');
          if (data['humanVerified'] !== undefined) {
            row.humanVerified = data['humanVerified'] as boolean;
          }
          if (data['verifiedBy']) {
            const verifiedBy = data['verifiedBy'] as
              | { connect?: { id: string }; disconnect?: boolean }
              | undefined;
            row.verifiedById = verifiedBy?.connect?.id ?? null;
          }
          if (data['evidenceText'] !== undefined) row.evidenceText = data['evidenceText'] as string;
          if (data['evidenceSourceUrl'] !== undefined) {
            row.evidenceSourceUrl = (data['evidenceSourceUrl'] as string | null) ?? null;
          }
          if (data['confidence'] !== undefined) {
            row.confidence = data['confidence'] as PainPoint['confidence'];
          }
          row.updatedAt = new Date('2026-05-02T10:05:00.000Z');
          return withRelations(row);
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = painPoints.findIndex((row) => row.id === where.id);
        if (index === -1) throw new Error('missing');
        const [deleted] = painPoints.splice(index, 1);
        return deleted;
      }),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (where?.['createdAt']) return 3;
        return painPoints.filter((row) => {
          if (where?.['companyId'] && row.companyId !== where['companyId']) return false;
          if (where?.['confidence'] && row.confidence !== where['confidence']) return false;
          if (where?.['categoryId'] && row.categoryId !== where['categoryId']) return false;
          if (
            where?.['humanVerified'] !== undefined &&
            row.humanVerified !== where['humanVerified']
          ) {
            return false;
          }
          return true;
        }).length;
      }),
    },
    painPointCategory: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          categories.find(
            (item) => item.id === where['id'] && item.isActive === (where['isActive'] ?? true),
          ) ?? null
        );
      }),
    },
    serviceLine: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where?: { key?: { in?: string[] }; isActive?: boolean };
        } = {}) => {
          return serviceLines.filter((row) => {
            if (where?.isActive !== undefined && row.isActive !== where.isActive) return false;
            if (where?.key?.in && !where.key.in.includes(row.key)) return false;
            return true;
          });
        },
      ),
    },
    serviceFitRecommendation: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (where?.['createdAt']) return 1;
        return serviceFits.filter((row) => {
          if (where?.['companyId'] && row.companyId !== where['companyId']) return false;
          return true;
        }).length;
      }),
      findMany: vi.fn(
        async ({
          where,
          take = serviceFits.length,
        }: {
          where?: Record<string, unknown>;
          take?: number;
        } = {}) => {
          const filtered = serviceFits
            .filter((row) => {
              if (where?.['companyId'] && row.companyId !== where['companyId']) return false;
              return true;
            })
            .sort((a, b) => b.fitScore - a.fitScore);
          return filtered.slice(0, take).map(withServiceFitRelations);
        },
      ),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) {
          serviceFits.push(
            makeServiceFitRecommendation({
              id: `service_fit_${serviceFits.length + 1}`,
              companyId: item['companyId'] as string,
              serviceLineId: item['serviceLineId'] as string,
              triggeringSignals: item['triggeringSignals'] as string[],
              rationaleEs: item['rationaleEs'] as string,
              expectedOutcomeEs: item['expectedOutcomeEs'] as string,
              fitScore: item['fitScore'] as number,
              generatedBy: item['generatedBy'] as ServiceFitRecommendation['generatedBy'],
            }),
          );
        }
        return { count: data.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        const remaining = serviceFits.filter((row) => {
          if (where?.['companyId']) return row.companyId !== where['companyId'];
          return false;
        });
        serviceFits.splice(0, serviceFits.length, ...remaining);
        return { count: 1 };
      }),
    },
    outboundPrep: {
      findUnique: vi.fn(async ({ where }: { where: { companyId: string } }) => {
        return outboundPreps.find((row) => row.companyId === where.companyId) ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { companyId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = outboundPreps.find((row) => row.companyId === where.companyId);
          if (existing) {
            existing.segment = update['segment'] as string;
            existing.likelyNeed = update['likelyNeed'] as string;
            existing.outreachAngle = update['outreachAngle'] as string;
            existing.valueProposition = update['valueProposition'] as string;
            existing.servicePitch = update['servicePitch'] as string;
            existing.toneGuidance = update['toneGuidance'] as string;
            existing.priorityScore = update['priorityScore'] as number;
            existing.lastGeneratedAt = update['lastGeneratedAt'] as Date;
            existing.lastGeneratedById = (update['lastGeneratedById'] as string | null) ?? null;
            existing.updatedAt = new Date('2026-05-02T10:05:00.000Z');
            return existing;
          }

          const row = makeOutboundPrep({
            id: `outbound_prep_${outboundPreps.length + 1}`,
            companyId: create['companyId'] as string,
            segment: create['segment'] as string,
            likelyNeed: create['likelyNeed'] as string,
            outreachAngle: create['outreachAngle'] as string,
            valueProposition: create['valueProposition'] as string,
            servicePitch: create['servicePitch'] as string,
            toneGuidance: create['toneGuidance'] as string,
            priorityScore: create['priorityScore'] as number,
            sdrNotes: (create['sdrNotes'] as string | null) ?? null,
            lastGeneratedAt: create['lastGeneratedAt'] as Date,
            lastGeneratedById: (create['lastGeneratedById'] as string | null) ?? null,
          });
          outboundPreps.push(row);
          return row;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { companyId: string };
          data: Record<string, unknown>;
        }) => {
          const row = outboundPreps.find((item) => item.companyId === where.companyId);
          if (!row) throw new Error('missing');
          if (data['segment'] !== undefined) row.segment = data['segment'] as string;
          if (data['likelyNeed'] !== undefined) row.likelyNeed = data['likelyNeed'] as string;
          if (data['outreachAngle'] !== undefined) {
            row.outreachAngle = data['outreachAngle'] as string;
          }
          if (data['valueProposition'] !== undefined) {
            row.valueProposition = data['valueProposition'] as string;
          }
          if (data['servicePitch'] !== undefined) row.servicePitch = data['servicePitch'] as string;
          if (data['toneGuidance'] !== undefined) row.toneGuidance = data['toneGuidance'] as string;
          if (data['priorityScore'] !== undefined)
            row.priorityScore = data['priorityScore'] as number;
          if (data['sdrNotes'] !== undefined)
            row.sdrNotes = (data['sdrNotes'] as string | null) ?? null;
          row.updatedAt = new Date('2026-05-02T10:06:00.000Z');
          return row;
        },
      ),
    },
  } as unknown as PrismaClient;

  return {
    prisma,
    activities,
    companies,
    leads,
    runs,
    painPoints,
    categories,
    serviceLines,
    serviceFits,
    outboundPreps,
  };
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

    expect(result.run.company_id).toBe('company_new_1');
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

  it('bulkImportCsv válido de 3 filas devuelve 3 run_ids y sin errores', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.bulkImportCsv(
      Buffer.from(
        [
          'name,website',
          'Acme,https://acme-2.test',
          'Beta,https://beta.test',
          'Gamma,https://gamma.test',
        ].join('\n'),
      ),
      'leads.csv',
      'user_1',
    );

    expect(result.count).toBe(3);
    expect(result.runIds).toEqual(['run_new_1', 'run_new_2', 'run_new_3']);
    expect(result.errors).toEqual([]);
  });

  it('bulkImportCsv salta fila con URL inválida y procesa el resto', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.bulkImportCsv(
      Buffer.from(
        [
          'name,website',
          'Acme,https://acme-2.test',
          'Beta,no-es-url',
          'Gamma,https://gamma.test',
        ].join('\n'),
      ),
      'leads.csv',
      'user_1',
    );

    expect(result.count).toBe(2);
    expect(result.runIds).toEqual(['run_new_1', 'run_new_2']);
    expect(result.errors).toEqual([
      { row: 2, message: 'La columna website debe contener una URL válida.' },
    ]);
  });

  it('bulkImportCsv rechaza CSV con más de 100 filas', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);
    const csv = [
      'name,website',
      ...Array.from(
        { length: 101 },
        (_, index) => `Empresa ${index + 1},https://empresa-${index + 1}.test`,
      ),
    ].join('\n');

    await expect(
      service.bulkImportCsv(Buffer.from(csv), 'leads.csv', 'user_1'),
    ).rejects.toMatchObject({
      code: 'CSV_TOO_MANY_ROWS',
    });
  });

  it('bulkImportCsv salta fila con name vacío', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.bulkImportCsv(
      Buffer.from(
        ['name,website', ',https://sin-nombre.test', 'Gamma,https://gamma.test'].join('\n'),
      ),
      'leads.csv',
      'user_1',
    );

    expect(result.count).toBe(1);
    expect(result.runIds).toEqual(['run_new_1']);
    expect(result.errors).toEqual([{ row: 1, message: 'El campo name es obligatorio.' }]);
  });

  it('listPainPoints filtra por confidence', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.listPainPoints({
      confidence: 'observed',
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'pain_point_1',
      confidence: 'observed',
      company_name: 'ACME',
      category_key: 'late_replies',
    });
  });

  it('listServiceFit devuelve recomendaciones ordenadas por fit_score', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.listServiceFit('company_1', 20);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'service_fit_2',
      service_line_key: 'automation',
      service_line_label_es: 'Automatización',
      fit_score: 91,
    });
  });

  it('getOutboundPrep devuelve null si no existe', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.getOutboundPrep('missing_company');

    expect(result).toBeNull();
  });

  it('getOutboundPrep devuelve DTO si existe', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.getOutboundPrep('company_1');

    expect(result).toMatchObject({
      company_id: 'company_1',
      segment: 'Clinicas con operación comercial reactiva.',
      priority_score: 78,
    });
  });

  it('createOutreachTask crea Activity asociada al lead más reciente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));

    const { activities, leads, prisma } = buildPrisma();
    leads.push(
      makeLead({
        id: 'lead_2',
        ownerId: 'owner_2',
        createdAt: new Date('2026-05-03T10:00:00.000Z'),
        updatedAt: new Date('2026-05-03T10:00:00.000Z'),
      }),
    );
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    const result = await service.createOutreachTask('company_1', { due_days: 7 }, 'user_actor');

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'task',
        entityType: 'lead',
        entityId: 'lead_2',
        ownerId: 'owner_2',
        createdById: 'user_actor',
      }),
    });
    expect(activities[0]).toMatchObject({
      entityType: 'lead',
      entityId: 'lead_2',
      ownerId: 'owner_2',
    });
    expect(result).toEqual({
      activity_id: 'activity_1',
      lead_id: 'lead_2',
      company_id: 'company_1',
      due_at: '2026-05-10T12:00:00.000Z',
      title: 'Outreach: ACME',
      body: expect.stringContaining('Segmento:'),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_actor',
        action: 'outbound_prep.task_created',
        entityType: 'activity',
        entityId: 'activity_1',
      }),
    );

    vi.useRealTimers();
  });

  it('createOutreachTask sin lead crea Activity contra company y usa actorUserId como owner', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));

    const { activities, leads, prisma } = buildPrisma();
    leads.splice(0, leads.length);
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.createOutreachTask('company_1', { due_days: 3 }, 'user_actor');

    expect(prisma.activity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'company',
        entityId: 'company_1',
        ownerId: 'user_actor',
      }),
    });
    expect(activities[0]).toMatchObject({
      entityType: 'company',
      entityId: 'company_1',
      ownerId: 'user_actor',
    });
    expect(result.lead_id).toBeNull();
    expect(result.due_at).toBe('2026-05-06T12:00:00.000Z');

    vi.useRealTimers();
  });

  it('createOutreachTask throws OutboundPrepNotFoundError si no existe OutboundPrep', async () => {
    const { outboundPreps, prisma } = buildPrisma();
    outboundPreps.splice(0, outboundPreps.length);
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.createOutreachTask('company_1', { due_days: 7 }, 'user_actor'),
    ).rejects.toBeInstanceOf(OutboundPrepNotFoundError);
  });

  it('regenerateOutboundPrep crea OutboundPrep cuando no existe previamente', async () => {
    const { prisma, outboundPreps } = buildPrisma();
    outboundPreps.splice(0, outboundPreps.length);
    const audit = { record: vi.fn(async () => {}) };
    const ai = {
      complete: vi.fn(async () => ({
        text: JSON.stringify({
          segment: 'Clinicas privadas pequeñas.',
          likely_need: 'Necesitan ordenar seguimiento comercial.',
          outreach_angle: 'Entrar por leads perdidos por demora.',
          value_proposition: 'Reducir respuesta tardía y más citas.',
          service_pitch: 'Automatización comercial con capa web.',
          tone_guidance: 'Consultivo y concreto.',
          priority_score: 84,
        }),
        modelUsed: 'claude-sonnet-4',
      })),
    };
    const service = new IntelService(prisma, audit as never);

    const result = await service.regenerateOutboundPrep('company_1', 'user_7', ai as never);

    expect(ai.complete).toHaveBeenCalledTimes(1);
    expect(prisma.outboundPrep.upsert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      company_id: 'company_1',
      priority_score: 84,
      last_generated_by_id: 'user_7',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_7',
        action: 'outbound_prep.generated',
      }),
    );
  });

  it('regenerateOutboundPrep throws si company no existe', async () => {
    const { prisma } = buildPrisma();
    prisma.company.findFirst = vi.fn(async () => null) as never;
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.regenerateOutboundPrep('missing', 'user_1', { complete: vi.fn() } as never),
    ).rejects.toBeInstanceOf(IntelNotFoundError);
  });

  it('updateOutboundPrep throws OutboundPrepNotFoundError si no existe prep', async () => {
    const { prisma, outboundPreps } = buildPrisma();
    outboundPreps.splice(0, outboundPreps.length);
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.updateOutboundPrep('company_1', { sdr_notes: 'Call tomorrow' }, 'user_1'),
    ).rejects.toBeInstanceOf(OutboundPrepNotFoundError);
  });

  it('regenerateServiceFit crea recommendations con Claude mock', async () => {
    const { prisma } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const ai = {
      complete: vi.fn(async () => ({
        text: JSON.stringify([
          {
            serviceLineKey: 'automation',
            rationaleEs: 'Hay demasiadas tareas manuales.',
            expectedOutcomeEs: 'Reducir tiempos de seguimiento.',
            fitScore: 94,
          },
          {
            serviceLineKey: 'website',
            rationaleEs: 'La web no convierte bien.',
            expectedOutcomeEs: 'Mejorar captación.',
            fitScore: 81,
          },
        ]),
        modelUsed: 'claude-sonnet-4',
      })),
    };
    const service = new IntelService(prisma, audit as never);

    const result = await service.regenerateServiceFit('company_1', 'user_1', ai as never);

    expect(ai.complete).toHaveBeenCalledTimes(1);
    expect(prisma.serviceFitRecommendation.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 'company_1' },
    });
    expect(result.models_used).toEqual(['claude-sonnet-4']);
    expect(result.data[0]).toMatchObject({
      service_line_key: 'automation',
      fit_score: 94,
      generated_by: 'claude',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_1',
        action: 'service_fit.regenerated',
      }),
    );
  });

  it('regenerateServiceFit sin pain points devuelve lista vacía sin llamar Claude', async () => {
    const { prisma, painPoints } = buildPrisma();
    painPoints.splice(0, painPoints.length);
    const ai = {
      complete: vi.fn(),
    };
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    const result = await service.regenerateServiceFit('company_1', 'user_1', ai as never);

    expect(result).toEqual({ data: [], models_used: [] });
    expect(ai.complete).not.toHaveBeenCalled();
    expect(prisma.serviceFitRecommendation.deleteMany).toHaveBeenCalledWith({
      where: { companyId: 'company_1' },
    });
  });

  it('regenerateServiceFit con company inexistente lanza NotFoundError', async () => {
    const { prisma } = buildPrisma();
    prisma.company.findFirst = vi.fn(async () => null) as never;
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.regenerateServiceFit('missing', 'user_1', { complete: vi.fn() } as never),
    ).rejects.toBeInstanceOf(IntelNotFoundError);
  });

  it('createPainPoint crea con detectedBy human', async () => {
    const { prisma, painPoints } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    const result = await service.createPainPoint(
      {
        company_id: 'company_1',
        category_id: 'category_1',
        confidence: 'speculative',
        evidence_text: 'Formulario de contacto roto',
        evidence_source_url: 'https://acme.test/contacto',
      },
      'user_7',
    );

    expect(result.detected_by).toBe('human');
    expect(painPoints.at(-1)?.detectedBy).toBe('human');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_7',
        action: 'pain_point.created',
      }),
    );
  });

  it('updatePainPoint marca human_verified con verified_by_id', async () => {
    const { prisma } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    const result = await service.updatePainPoint(
      'pain_point_1',
      { human_verified: true, confidence: 'inferred' },
      'user_9',
    );

    expect(result.human_verified).toBe(true);
    expect(result.verified_by_id).toBe('user_9');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pain_point.updated',
        metadata: { fields: ['human_verified', 'confidence'] },
      }),
    );
  });

  it('updatePainPoint 404', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(
      service.updatePainPoint('pain_point_missing', { human_verified: true }, 'user_1'),
    ).rejects.toBeInstanceOf(PainPointNotFoundError);
  });

  it('deletePainPoint ok', async () => {
    const { prisma, painPoints } = buildPrisma();
    const audit = { record: vi.fn(async () => {}) };
    const service = new IntelService(prisma, audit as never);

    await service.deletePainPoint('pain_point_1', 'user_3');

    expect(painPoints.map((item) => item.id)).not.toContain('pain_point_1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_3',
        action: 'pain_point.deleted',
        entityId: 'pain_point_1',
      }),
    );
  });

  it('deletePainPoint 404', async () => {
    const { prisma } = buildPrisma();
    const service = new IntelService(prisma, { record: vi.fn(async () => {}) } as never);

    await expect(service.deletePainPoint('pain_point_missing', 'user_1')).rejects.toBeInstanceOf(
      PainPointNotFoundError,
    );
  });
});
