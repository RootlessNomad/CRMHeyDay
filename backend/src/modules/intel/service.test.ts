import type {
  Company,
  EnrichmentRun,
  EnrichmentSourceHit,
  PainPoint,
  PainPointCategory,
  PrismaClient,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IntelNotFoundError,
  IntelService,
  IntelValidationError,
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

function buildPrisma() {
  const companies = [makeCompany()];
  const runs = [makeRun()];
  const categories = [makePainPointCategory()];
  const painPoints = [
    makePainPoint(),
    makePainPoint({ id: 'pain_point_2', confidence: 'inferred' }),
  ];
  let companySeq = 0;
  let runSeq = 0;
  let painPointSeq = painPoints.length;

  const withRelations = (row: PainPoint) => ({
    ...row,
    company: { name: companies.find((item) => item.id === row.companyId)?.name ?? 'Unknown' },
    category: (() => {
      const category =
        categories.find((item) => item.id === row.categoryId) ?? makePainPointCategory();
      return { id: category.id, key: category.key, labelEs: category.labelEs };
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
    serviceFitRecommendation: {
      count: vi.fn(async () => 1),
    },
  } as unknown as PrismaClient;

  return { prisma, companies, runs, painPoints, categories };
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
