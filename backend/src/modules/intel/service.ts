import type { EnrichmentRun, EnrichmentSourceHit, Prisma, PrismaClient } from '@prisma/client';

import { enqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { normalizeDomain } from '../companies/domain.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  EnrichmentRunCreateInput,
  EnrichmentRunDto,
  EnrichmentSourceHitDto,
} from './schemas.js';

export class IntelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntelNotFoundError';
  }
}

export class IntelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntelValidationError';
  }
}

function toSourceHitDto(row: EnrichmentSourceHit): EnrichmentSourceHitDto {
  return {
    id: row.id,
    source_type: row.sourceType,
    source_url: row.sourceUrl,
    status: row.status,
    fetched_at: row.fetchedAt.toISOString(),
    response_excerpt: row.responseExcerpt,
    extracted: row.extracted,
    error: row.error,
  };
}

function toRunDto(
  row: EnrichmentRun & { sourceHits?: EnrichmentSourceHit[] },
  extras: Partial<
    Pick<EnrichmentRunDto, 'pain_points_created_count' | 'service_fits_created_count'>
  > = {},
): EnrichmentRunDto {
  return {
    id: row.id,
    company_id: row.companyId,
    triggered_by_id: row.triggeredById,
    status: row.status,
    input_url: row.inputUrl,
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
    error_message: row.errorMessage,
    summary: row.summary as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
    ...(row.sourceHits ? { source_hits: row.sourceHits.map(toSourceHitDto) } : {}),
    ...(extras.pain_points_created_count !== undefined
      ? { pain_points_created_count: extras.pain_points_created_count }
      : {}),
    ...(extras.service_fits_created_count !== undefined
      ? { service_fits_created_count: extras.service_fits_created_count }
      : {}),
  };
}

function normalizeInputUrl(inputUrl: string): string {
  const parsed = new URL(inputUrl);
  return parsed.toString();
}

export class IntelService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  async createEnrichmentRun(
    input: EnrichmentRunCreateInput,
    actorUserId: string,
  ): Promise<{ run: EnrichmentRunDto; jobId: string }> {
    if (!input.companyId && !input.inputUrl) {
      throw new IntelValidationError('companyId o inputUrl requerido');
    }

    let companyId = input.companyId ?? null;
    const normalizedUrl = input.inputUrl ? normalizeInputUrl(input.inputUrl) : null;

    if (companyId) {
      const company = await this.db.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });
      if (!company) throw new IntelNotFoundError(`Empresa "${companyId}" no encontrada`);
    } else if (normalizedUrl) {
      const parsed = new URL(normalizedUrl);
      const domain = normalizeDomain(normalizedUrl);
      const existing = domain
        ? await this.db.company.findFirst({ where: { domain, deletedAt: null } })
        : null;

      if (existing) {
        companyId = existing.id;
      } else {
        const created = await this.db.company.create({
          data: {
            name: parsed.hostname,
            website: normalizedUrl,
            domain,
            createdBy: { connect: { id: actorUserId } },
          },
        });
        companyId = created.id;
      }
    }

    if (!companyId) throw new IntelValidationError('No se pudo resolver companyId');

    const run = await this.db.enrichmentRun.create({
      data: {
        companyId,
        triggeredById: actorUserId,
        status: 'queued',
        inputUrl: normalizedUrl,
      },
    });

    const job = await enqueue(QUEUE_NAMES.enrichment, {
      companyId,
      reason: 'manual',
      actorUserId,
    });

    await this.audit.record({
      actorUserId,
      action: 'enrichment.run.created',
      entityType: 'enrichment_run',
      entityId: run.id,
      metadata: { runId: run.id, companyId } as Prisma.InputJsonValue,
    });

    return { run: toRunDto(run), jobId: job.jobId };
  }

  async getEnrichmentRun(id: string): Promise<EnrichmentRunDto> {
    const row = await this.db.enrichmentRun.findUnique({
      where: { id },
      include: { sourceHits: { orderBy: { fetchedAt: 'desc' } } },
    });
    if (!row) throw new IntelNotFoundError(`Enrichment run "${id}" no encontrado`);

    const from = row.startedAt ?? row.createdAt;
    const to = row.finishedAt ?? new Date();

    const [painPointsCreatedCount, serviceFitsCreatedCount] = await Promise.all([
      this.db.painPoint.count({
        where: {
          companyId: row.companyId,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.db.serviceFitRecommendation.count({
        where: {
          companyId: row.companyId,
          createdAt: { gte: from, lte: to },
        },
      }),
    ]);

    return toRunDto(row, {
      pain_points_created_count: painPointsCreatedCount,
      service_fits_created_count: serviceFitsCreatedCount,
    });
  }

  async listByCompany(
    companyId: string,
    input: { limit?: number } = {},
  ): Promise<EnrichmentRunDto[]> {
    const limit = input.limit ?? 20;
    const rows = await this.db.enrichmentRun.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => toRunDto(row));
  }
}

export const intelService = new IntelService();
