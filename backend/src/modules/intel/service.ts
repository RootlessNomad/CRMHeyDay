import type {
  EnrichmentRun,
  EnrichmentSourceHit,
  OutboundPrep,
  PainPoint,
  PainPointCategory,
  Prisma,
  PrismaClient,
  ServiceFitRecommendation,
  ServiceLine,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';

import { enqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import { anthropicClient, type AnthropicClient } from '../../core/ai/index.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { normalizeDomain } from '../companies/domain.js';
import { auditService, type AuditService } from '../audit/index.js';
import type {
  BulkImportResult,
  EnrichmentRunCreateInput,
  EnrichmentRunDto,
  EnrichmentSourceHitDto,
  OutboundPrepDto,
  OutboundPrepUpdateInput,
  PainPointCreateInput,
  PainPointDto,
  PainPointListQuery,
  PainPointUpdateInput,
  ServiceFitDto,
} from './schemas.js';
import { outboundPrepPrompt, serviceFitRationale } from './prompts.js';

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

export class OutboundPrepNotFoundError extends Error {
  constructor(id: string) {
    super(`OutboundPrep not found: ${id}`);
    this.name = 'OutboundPrepNotFoundError';
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

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function buildFallbackRationale(serviceLine: ServiceLine, painPointKeys: string[]) {
  return {
    serviceLineKey: serviceLine.key,
    rationaleEs: `Encaje basado en señales: ${painPointKeys.join(', ')}.`,
    expectedOutcomeEs: `Reducir fricción asociada a ${serviceLine.labelEs.toLowerCase()}.`,
    fitScore: Math.min(95, 40 + painPointKeys.length * 15),
  };
}

interface ServiceFitRationaleItem {
  serviceLineKey: string;
  rationaleEs: string;
  expectedOutcomeEs: string;
  fitScore: number;
}

type AiClientLike = Pick<AnthropicClient, 'complete'>;

type ServiceFitRow = ServiceFitRecommendation & {
  serviceLine: Pick<ServiceLine, 'id' | 'key' | 'labelEs'>;
};

function toServiceFitDto(row: ServiceFitRow): ServiceFitDto {
  return {
    id: row.id,
    company_id: row.companyId,
    service_line_id: row.serviceLineId,
    service_line_key: row.serviceLine.key,
    service_line_label_es: row.serviceLine.labelEs,
    triggering_signals: row.triggeringSignals,
    rationale_es: row.rationaleEs,
    expected_outcome_es: row.expectedOutcomeEs,
    fit_score: row.fitScore,
    generated_by: row.generatedBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toOutboundPrepDto(row: OutboundPrep): OutboundPrepDto {
  return {
    id: row.id,
    company_id: row.companyId,
    segment: row.segment,
    likely_need: row.likelyNeed,
    outreach_angle: row.outreachAngle,
    value_proposition: row.valueProposition,
    service_pitch: row.servicePitch,
    tone_guidance: row.toneGuidance,
    priority_score: row.priorityScore,
    sdr_notes: row.sdrNotes,
    last_generated_at: row.lastGeneratedAt.toISOString(),
    last_generated_by_id: row.lastGeneratedById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const outboundPrepCompletionSchema = {
  parse(value: unknown) {
    if (typeof value !== 'object' || value === null) {
      throw new Error('Claude devolvió JSON no parseable');
    }

    const record = value as Record<string, unknown>;
    const readString = (key: string): string => {
      const field = record[key];
      if (typeof field !== 'string' || field.trim().length === 0) {
        throw new Error('Claude devolvió JSON no parseable');
      }
      return field.trim();
    };

    const priorityScore = record['priority_score'];
    if (
      typeof priorityScore !== 'number' ||
      !Number.isInteger(priorityScore) ||
      priorityScore < 0 ||
      priorityScore > 100
    ) {
      throw new Error('Claude devolvió JSON no parseable');
    }

    return {
      segment: readString('segment'),
      likely_need: readString('likely_need'),
      outreach_angle: readString('outreach_angle'),
      value_proposition: readString('value_proposition'),
      service_pitch: readString('service_pitch'),
      tone_guidance: readString('tone_guidance'),
      priority_score: priorityScore,
    };
  },
};

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

  async listServiceFit(companyId: string, limit = 20): Promise<ServiceFitDto[]> {
    const rows = await this.db.serviceFitRecommendation.findMany({
      where: { companyId },
      include: {
        serviceLine: {
          select: { id: true, key: true, labelEs: true },
        },
      },
      orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    return rows.map((row) => toServiceFitDto(row));
  }

  async getOutboundPrep(companyId: string): Promise<OutboundPrepDto | null> {
    const row = await this.db.outboundPrep.findUnique({
      where: { companyId },
    });

    return row ? toOutboundPrepDto(row) : null;
  }

  async regenerateOutboundPrep(
    companyId: string,
    actorUserId: string,
    ai: AiClientLike = anthropicClient,
  ): Promise<OutboundPrepDto> {
    const company = await this.db.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) throw new IntelNotFoundError('Company not found');

    const [painPoints, serviceFits] = await Promise.all([
      this.db.painPoint.findMany({
        where: { companyId },
        include: {
          category: {
            select: { key: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.serviceFitRecommendation.findMany({
        where: { companyId },
        include: {
          serviceLine: {
            select: { id: true, key: true, labelEs: true, descriptionEs: true },
          },
        },
        orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const fitsAboveThreshold = serviceFits.filter((item) => item.fitScore > 30);
    const selectedFits = (
      fitsAboveThreshold.length > 0 ? fitsAboveThreshold : serviceFits.slice(0, 5)
    ).slice(0, Math.max(fitsAboveThreshold.length, 5));
    const uniqueServiceLines = unique(selectedFits.map((item) => item.serviceLineId));
    const selectedServiceLines = uniqueServiceLines
      .map(
        (serviceLineId) =>
          serviceFits.find((item) => item.serviceLineId === serviceLineId)?.serviceLine,
      )
      .filter(
        (
          serviceLine,
        ): serviceLine is {
          id: string;
          key: string;
          labelEs: string;
          descriptionEs: string;
        } => Boolean(serviceLine),
      );

    const prompt = outboundPrepPrompt({
      companyName: company.name,
      domain: company.domain,
      website: company.website,
      city: company.city,
      icpVertical: company.icpVertical,
      painPoints: painPoints.map((item) => ({
        categoryKey: item.category.key,
        evidenceText: item.evidenceText,
        confidence: item.confidence,
      })),
      serviceLines: selectedServiceLines.map((item) => ({
        key: item.key,
        labelEs: item.labelEs,
        descriptionEs: item.descriptionEs,
      })),
      serviceFits: serviceFits.map((item) => ({
        serviceLineKey: item.serviceLine.key,
        rationaleEs: item.rationaleEs,
        fitScore: item.fitScore,
      })),
    });

    const completion = await ai.complete({
      feature: 'outbound_prep',
      ...prompt,
      entityType: 'company',
      entityId: company.id,
      userId: actorUserId,
    });

    const parsedJson = safeJsonParse<Record<string, unknown>>(completion.text);
    if (!parsedJson) throw new Error('Claude devolvió JSON no parseable');
    const parsed = outboundPrepCompletionSchema.parse(parsedJson);
    const now = new Date();

    const row = await this.db.outboundPrep.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        segment: parsed.segment,
        likelyNeed: parsed.likely_need,
        outreachAngle: parsed.outreach_angle,
        valueProposition: parsed.value_proposition,
        servicePitch: parsed.service_pitch,
        toneGuidance: parsed.tone_guidance,
        priorityScore: parsed.priority_score,
        sdrNotes: null,
        lastGeneratedAt: now,
        lastGeneratedById: actorUserId,
      },
      update: {
        segment: parsed.segment,
        likelyNeed: parsed.likely_need,
        outreachAngle: parsed.outreach_angle,
        valueProposition: parsed.value_proposition,
        servicePitch: parsed.service_pitch,
        toneGuidance: parsed.tone_guidance,
        priorityScore: parsed.priority_score,
        lastGeneratedAt: now,
        lastGeneratedById: actorUserId,
      },
    });

    await this.audit.record({
      actorUserId,
      action: 'outbound_prep.generated',
      entityType: 'company',
      entityId: company.id,
      metadata: {
        companyId: company.id,
        fieldsGenerated: Object.keys(parsed),
      } satisfies Prisma.InputJsonValue,
    });

    return toOutboundPrepDto(row);
  }

  async updateOutboundPrep(
    companyId: string,
    input: OutboundPrepUpdateInput,
    actorUserId: string,
  ): Promise<OutboundPrepDto> {
    const existing = await this.db.outboundPrep.findUnique({
      where: { companyId },
    });
    if (!existing) throw new OutboundPrepNotFoundError(companyId);

    const data: Prisma.OutboundPrepUpdateInput = {};
    const fields: string[] = [];

    if (input.segment !== undefined) {
      data.segment = input.segment;
      fields.push('segment');
    }
    if (input.likely_need !== undefined) {
      data.likelyNeed = input.likely_need;
      fields.push('likely_need');
    }
    if (input.outreach_angle !== undefined) {
      data.outreachAngle = input.outreach_angle;
      fields.push('outreach_angle');
    }
    if (input.value_proposition !== undefined) {
      data.valueProposition = input.value_proposition;
      fields.push('value_proposition');
    }
    if (input.service_pitch !== undefined) {
      data.servicePitch = input.service_pitch;
      fields.push('service_pitch');
    }
    if (input.tone_guidance !== undefined) {
      data.toneGuidance = input.tone_guidance;
      fields.push('tone_guidance');
    }
    if (input.priority_score !== undefined) {
      data.priorityScore = input.priority_score;
      fields.push('priority_score');
    }
    if (input.sdr_notes !== undefined) {
      data.sdrNotes = input.sdr_notes;
      fields.push('sdr_notes');
    }

    const updated = await this.db.outboundPrep.update({
      where: { companyId },
      data,
    });

    await this.audit.record({
      actorUserId,
      action: 'outbound_prep.updated',
      entityType: 'company',
      entityId: companyId,
      metadata: {
        companyId,
        fields,
      } satisfies Prisma.InputJsonValue,
    });

    return toOutboundPrepDto(updated);
  }

  async regenerateServiceFit(
    companyId: string,
    actorUserId: string,
    ai: AiClientLike = anthropicClient,
  ): Promise<{ data: ServiceFitDto[]; models_used: string[] }> {
    const company = await this.db.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) throw new IntelNotFoundError(`Empresa "${companyId}" no encontrada`);

    const painPoints = await this.db.painPoint.findMany({
      where: { companyId },
      include: {
        category: {
          select: { key: true, defaultServiceRecommendations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const activeServiceLines = await this.db.serviceLine.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const serviceLineByKey = new Map(activeServiceLines.map((item) => [item.key, item]));

    const candidateCounts = new Map<string, { count: number; painPointKeys: string[] }>();
    for (const painPoint of painPoints) {
      for (const serviceLineKey of painPoint.category.defaultServiceRecommendations) {
        if (!serviceLineByKey.has(serviceLineKey)) continue;
        const current = candidateCounts.get(serviceLineKey) ?? { count: 0, painPointKeys: [] };
        current.count += 1;
        current.painPointKeys.push(painPoint.category.key);
        candidateCounts.set(serviceLineKey, current);
      }
    }

    const candidateKeys = [...candidateCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([key]) => key);

    const orderedServiceLines = candidateKeys
      .map((key) => serviceLineByKey.get(key))
      .filter((item): item is ServiceLine => Boolean(item));

    const modelsUsed: string[] = [];
    let createData: Array<{
      companyId: string;
      serviceLineId: string;
      triggeringSignals: string[];
      rationaleEs: string;
      expectedOutcomeEs: string;
      fitScore: number;
      generatedBy: ServiceFitRecommendation['generatedBy'];
    }> = [];

    if (orderedServiceLines.length > 0) {
      let rationales: ServiceFitRationaleItem[];
      try {
        const prompt = serviceFitRationale({
          companyName: company.name,
          painPoints: painPoints.map((item) => ({
            categoryKey: item.category.key,
            evidenceText: item.evidenceText,
            confidence: item.confidence,
          })),
          serviceLines: orderedServiceLines.map((serviceLine) => ({
            key: serviceLine.key,
            labelEs: serviceLine.labelEs,
            descriptionEs: serviceLine.descriptionEs,
          })),
        });
        const response = await ai.complete({
          feature: 'service_fit',
          ...prompt,
          entityType: 'company',
          entityId: company.id,
          userId: actorUserId,
        });
        modelsUsed.push(response.modelUsed);
        rationales = safeJsonParse<ServiceFitRationaleItem[]>(response.text) ?? [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Claude service_fit falló: ${message}`);
      }

      if (!Array.isArray(rationales)) {
        throw new Error('Claude devolvió una respuesta inválida para service_fit.');
      }

      const rationaleByKey = new Map(rationales.map((item) => [item.serviceLineKey, item]));
      createData = orderedServiceLines.map((serviceLine) => {
        const fallback = buildFallbackRationale(
          serviceLine,
          unique(candidateCounts.get(serviceLine.key)?.painPointKeys ?? []),
        );
        const resolved = rationaleByKey.get(serviceLine.key) ?? fallback;
        return {
          companyId: company.id,
          serviceLineId: serviceLine.id,
          triggeringSignals: unique(candidateCounts.get(serviceLine.key)?.painPointKeys ?? []),
          rationaleEs: resolved.rationaleEs,
          expectedOutcomeEs: resolved.expectedOutcomeEs,
          fitScore: Math.max(0, Math.min(100, resolved.fitScore)),
          generatedBy: rationaleByKey.has(serviceLine.key) ? 'claude' : 'rule',
        };
      });
    }

    await this.db.$transaction(async (tx) => {
      await tx.serviceFitRecommendation.deleteMany({ where: { companyId: company.id } });
      if (createData.length > 0) {
        await tx.serviceFitRecommendation.createMany({ data: createData });
      }
    });

    const rows = await this.db.serviceFitRecommendation.findMany({
      where: { companyId: company.id },
      include: {
        serviceLine: {
          select: { id: true, key: true, labelEs: true },
        },
      },
      orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
    });

    await this.audit.record({
      actorUserId,
      action: 'service_fit.regenerated',
      entityType: 'company',
      entityId: company.id,
      metadata: {
        companyId: company.id,
        recommendations: rows.length,
        modelsUsed: unique(modelsUsed),
      } satisfies Prisma.InputJsonValue,
    });

    return {
      data: rows.map((row) => toServiceFitDto(row)),
      models_used: unique(modelsUsed),
    };
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
