import type { EnrichmentRun, EnrichmentSourceHit, Prisma, PrismaClient } from '@prisma/client';
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
}

export const intelService = new IntelService();
