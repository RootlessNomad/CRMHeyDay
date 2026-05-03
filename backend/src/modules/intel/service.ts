import type {
  EnrichmentRun,
  EnrichmentSourceHit,
  PainPoint,
  PainPointCategory,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';

import { enqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { normalizeDomain } from '../companies/domain.js';
import { auditService, type AuditService } from '../audit/service.js';
import type {
  BulkImportResult,
  EnrichmentRunCreateInput,
  EnrichmentRunDto,
  EnrichmentSourceHitDto,
  PainPointCreateInput,
  PainPointDto,
  PainPointListQuery,
  PainPointUpdateInput,
} from './schemas.js';

const MAX_BULK_IMPORT_FILE_SIZE = 2 * 1024 * 1024;
const MAX_BULK_IMPORT_ROWS = 100;

interface BulkImportCsvRow {
  name?: string;
  website?: string;
}

export class IntelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntelNotFoundError';
  }
}

export class IntelValidationError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'IntelValidationError';
    this.code = code;
  }
}

export class PainPointNotFoundError extends Error {
  constructor(id: string, message = `Pain point "${id}" no encontrado`) {
    super(message);
    this.name = 'PainPointNotFoundError';
  }
}

export class IntelCsvTooLargeError extends IntelValidationError {
  constructor() {
    super('El archivo CSV no puede superar 2 MB.', 'CSV_TOO_LARGE');
    this.name = 'IntelCsvTooLargeError';
  }
}

export class IntelCsvTooManyRowsError extends IntelValidationError {
  constructor() {
    super(`El archivo CSV no puede superar ${MAX_BULK_IMPORT_ROWS} filas.`, 'CSV_TOO_MANY_ROWS');
    this.name = 'IntelCsvTooManyRowsError';
  }
}

function createBatchId(): string {
  return `c${randomUUID().replace(/-/g, '')}`;
}

function parseBulkImportCsv(buffer: Buffer): BulkImportCsvRow[] {
  return parse(buffer, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
    bom: true,
    delimiter: ',',
  }) as BulkImportCsvRow[];
}

function normalizeWebsiteUrl(input: string): string {
  const parsed = new URL(input);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new IntelValidationError('La URL debe empezar por http:// o https://.');
  }
  return parsed.toString();
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toRowMessage(error: unknown, fallback: string): string {
  if (error instanceof IntelValidationError) return error.message;
  if (isUniqueConstraintError(error)) return 'El dominio ya fue procesado en este CSV.';
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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

type PainPointWithRelations = PainPoint & {
  company: { name: string };
  category: Pick<PainPointCategory, 'id' | 'key' | 'labelEs'>;
};

function toPainPointDto(row: PainPointWithRelations): PainPointDto {
  return {
    id: row.id,
    company_id: row.companyId,
    company_name: row.company.name,
    category_id: row.categoryId,
    category_key: row.category.key,
    category_label_es: row.category.labelEs,
    confidence: row.confidence,
    evidence_text: row.evidenceText,
    evidence_source_url: row.evidenceSourceUrl,
    evidence_timestamp: row.evidenceTimestamp.toISOString(),
    detected_by: row.detectedBy,
    human_verified: row.humanVerified,
    verified_by_id: row.verifiedById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
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

  async bulkImportCsv(
    file: Buffer,
    _filename: string,
    actorUserId: string,
  ): Promise<BulkImportResult> {
    if (file.byteLength > MAX_BULK_IMPORT_FILE_SIZE) {
      throw new IntelCsvTooLargeError();
    }

    const rows = parseBulkImportCsv(file);
    if (rows.length > MAX_BULK_IMPORT_ROWS) {
      throw new IntelCsvTooManyRowsError();
    }

    const batchId = createBatchId();
    const runIds: string[] = [];
    const errors: BulkImportResult['errors'] = [];
    const seenDomains = new Set<string>();

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 1;
      const name = row.name?.trim() ?? '';
      const website = row.website?.trim() ?? '';

      if (!name) {
        errors.push({ row: rowNumber, message: 'El campo name es obligatorio.' });
        continue;
      }

      if (!website) {
        errors.push({ row: rowNumber, message: 'El campo website es obligatorio.' });
        continue;
      }

      let normalizedUrl: string;
      try {
        normalizedUrl = normalizeWebsiteUrl(website);
      } catch {
        errors.push({
          row: rowNumber,
          message: 'La columna website debe contener una URL válida.',
        });
        continue;
      }

      const domain = normalizeDomain(normalizedUrl);
      if (!domain) {
        errors.push({ row: rowNumber, message: 'No se pudo normalizar el dominio de website.' });
        continue;
      }

      if (seenDomains.has(domain)) {
        errors.push({ row: rowNumber, message: `Dominio duplicado en el CSV: ${domain}` });
        continue;
      }
      seenDomains.add(domain);

      try {
        const result = await this.createEnrichmentRun({ inputUrl: normalizedUrl }, actorUserId);
        runIds.push(result.run.id);
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: toRowMessage(error, 'No se pudo crear la investigación para esta fila.'),
        });
      }
    }

    return {
      batchId,
      count: runIds.length,
      runIds,
      errors,
    };
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

  async listPainPoints(
    query: PainPointListQuery,
  ): Promise<{ data: PainPointDto[]; total: number }> {
    const where: Prisma.PainPointWhereInput = {};
    if (query.company_id) where.companyId = query.company_id;
    if (query.confidence) where.confidence = query.confidence;
    if (query.category_id) where.categoryId = query.category_id;
    if (query.human_verified !== undefined) where.humanVerified = query.human_verified;

    const [rows, total] = await this.db.$transaction([
      this.db.painPoint.findMany({
        where,
        include: {
          company: { select: { name: true } },
          category: { select: { id: true, key: true, labelEs: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.db.painPoint.count({ where }),
    ]);

    return { data: rows.map((row) => toPainPointDto(row)), total };
  }

  async createPainPoint(input: PainPointCreateInput, actorUserId: string): Promise<PainPointDto> {
    const [company, category] = await this.db.$transaction([
      this.db.company.findFirst({ where: { id: input.company_id, deletedAt: null } }),
      this.db.painPointCategory.findFirst({
        where: { id: input.category_id, isActive: true },
      }),
    ]);

    if (!company) throw new IntelNotFoundError(`Empresa "${input.company_id}" no encontrada`);
    if (!category) {
      throw new IntelNotFoundError(`Categoría de pain point "${input.category_id}" no encontrada`);
    }

    const created = await this.db.painPoint.create({
      data: {
        companyId: input.company_id,
        categoryId: input.category_id,
        confidence: input.confidence,
        evidenceText: input.evidence_text,
        evidenceSourceUrl: input.evidence_source_url ?? null,
        evidenceTimestamp: new Date(),
        detectedBy: 'human',
      },
      include: {
        company: { select: { name: true } },
        category: { select: { id: true, key: true, labelEs: true } },
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'pain_point.created',
      entityType: 'pain_point',
      entityId: created.id,
      metadata: {
        companyId: created.companyId,
        categoryId: created.categoryId,
        confidence: created.confidence,
      } satisfies Prisma.InputJsonValue,
    });

    return toPainPointDto(created);
  }

  async updatePainPoint(
    id: string,
    input: PainPointUpdateInput,
    actorUserId: string,
  ): Promise<PainPointDto> {
    const existing = await this.db.painPoint.findUnique({ where: { id } });
    if (!existing) throw new PainPointNotFoundError(id);

    const data: Prisma.PainPointUpdateInput = {};
    const fields: string[] = [];

    if (input.human_verified !== undefined) {
      data.humanVerified = input.human_verified;
      data.verifiedBy = input.human_verified
        ? { connect: { id: actorUserId } }
        : { disconnect: true };
      fields.push('human_verified');
    }
    if (input.evidence_text !== undefined) {
      data.evidenceText = input.evidence_text;
      fields.push('evidence_text');
    }
    if (input.evidence_source_url !== undefined) {
      data.evidenceSourceUrl = input.evidence_source_url;
      fields.push('evidence_source_url');
    }
    if (input.confidence !== undefined) {
      data.confidence = input.confidence;
      fields.push('confidence');
    }

    const updated = await this.db.painPoint.update({
      where: { id },
      data,
      include: {
        company: { select: { name: true } },
        category: { select: { id: true, key: true, labelEs: true } },
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'pain_point.updated',
      entityType: 'pain_point',
      entityId: updated.id,
      metadata: { fields } satisfies Prisma.InputJsonValue,
    });

    return toPainPointDto(updated);
  }

  async deletePainPoint(id: string, actorUserId: string): Promise<void> {
    const existing = await this.db.painPoint.findUnique({ where: { id } });
    if (!existing) throw new PainPointNotFoundError(id);

    await this.db.painPoint.delete({ where: { id } });

    await this.audit.record({
      actorUserId,
      action: 'pain_point.deleted',
      entityType: 'pain_point',
      entityId: id,
      metadata: {
        companyId: existing.companyId,
        categoryId: existing.categoryId,
      } satisfies Prisma.InputJsonValue,
    });
  }
}

export const intelService = new IntelService();
