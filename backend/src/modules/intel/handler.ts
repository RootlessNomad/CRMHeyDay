import type {
  Company,
  CompanySizeSignal,
  EnrichmentSourceHit,
  PainPointCategory,
  Prisma,
  PrismaClient,
  ServiceLine,
} from '@prisma/client';

import { anthropicClient, type AnthropicClient } from '../../core/ai/index.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { scrapeWebsite, type ScrapeResult } from '../../core/scraping/index.js';
import type { JobResult } from '../../core/queue/types.js';
import { rootLogger } from '../../core/observability/logger.js';
import type { EnrichmentPayload as EnrichmentPayloadContract } from '../../core/queue/types.js';
import { auditService, type AuditService } from '../audit/service.js';
import { extractCompanyFields, inferPainPoints, serviceFitRationale } from './prompts.js';

const log = rootLogger.child({ component: 'intel.handler' });

type AiClientLike = Pick<AnthropicClient, 'complete'>;

interface ParsedExtractedFields {
  name?: string;
  industry?: string;
  phone?: string;
  email?: string;
  instagramHandle?: string;
  linkedinUrl?: string;
  sizeSignal?: 'solo' | 'micro' | 'small' | 'medium' | 'large';
  city?: string;
  country?: string;
}

interface PainPointDraft {
  categoryId: string;
  categoryKey: string;
  confidence: 'observed' | 'inferred' | 'speculative';
  evidenceText: string;
  evidenceSourceUrl: string | null;
  evidenceSourceHitId: string | null;
  detectedBy: 'rule' | 'claude';
}

export interface RunEnrichmentDeps {
  prisma?: PrismaClient;
  ai?: AiClientLike;
  scrape?: typeof scrapeWebsite;
  audit?: AuditService;
  now?: () => Date;
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapSizeSignal(input: ParsedExtractedFields['sizeSignal']): CompanySizeSignal | undefined {
  switch (input) {
    case 'solo':
      return 'solo';
    case 'micro':
      return 'micro_1_5';
    case 'small':
      return 'small_6_25';
    case 'medium':
    case 'large':
      return 'mid_26_100';
    default:
      return undefined;
  }
}

function pickFillableCompanyFields(
  company: Company,
  extracted: ParsedExtractedFields,
): Prisma.CompanyUpdateInput {
  const update: Prisma.CompanyUpdateInput = {};

  const assignIfEmpty = <K extends keyof ParsedExtractedFields>(
    sourceKey: K,
    targetKey: keyof Prisma.CompanyUpdateInput,
  ): void => {
    const value = extracted[sourceKey];
    const currentKey =
      targetKey === 'linkedinUrl'
        ? 'linkedinUrl'
        : targetKey === 'instagramHandle'
          ? 'instagramHandle'
          : targetKey === 'sizeSignal'
            ? 'sizeSignal'
            : targetKey;
    const currentValue = company[currentKey as keyof Company];
    if (value === undefined || value === null || value === '') return;
    if (currentValue !== null && currentValue !== undefined && currentValue !== '') return;
    (update as Record<string, unknown>)[targetKey] =
      sourceKey === 'sizeSignal'
        ? mapSizeSignal(value as ParsedExtractedFields['sizeSignal'])
        : value;
  };

  assignIfEmpty('name', 'name');
  assignIfEmpty('industry', 'industry');
  assignIfEmpty('phone', 'phone');
  assignIfEmpty('email', 'email');
  assignIfEmpty('instagramHandle', 'instagramHandle');
  assignIfEmpty('linkedinUrl', 'linkedinUrl');
  assignIfEmpty('city', 'city');
  assignIfEmpty('country', 'country');
  assignIfEmpty('sizeSignal', 'sizeSignal');

  if ((update as Record<string, unknown>)['sizeSignal'] === undefined) {
    delete (update as Record<string, unknown>)['sizeSignal'];
  }

  return update;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  return match ? match[0] : null;
}

function applyPainPointRules(input: {
  scrape: ScrapeResult;
  company: Company;
  sourceHitId: string | null;
  categoryByKey: Map<string, PainPointCategory>;
}): PainPointDraft[] {
  const { scrape, company, sourceHitId, categoryByKey } = input;
  const drafts: PainPointDraft[] = [];
  const sourceUrl = scrape.finalUrl || company.website || null;

  const push = (
    categoryKey: string,
    confidence: PainPointDraft['confidence'],
    evidenceText: string,
  ) => {
    const category = categoryByKey.get(categoryKey);
    if (!category) return;
    drafts.push({
      categoryId: category.id,
      categoryKey,
      confidence,
      evidenceText,
      evidenceSourceUrl: sourceUrl,
      evidenceSourceHitId: sourceHitId,
      detectedBy: 'rule',
    });
  };

  if ((company.website && !company.website.startsWith('https://')) || scrape.status !== 'ok') {
    push(
      'weak_website',
      'observed',
      scrape.status !== 'ok'
        ? `Website scrape status: ${scrape.status}`
        : `Website uses insecure protocol: ${company.website}`,
    );
  }

  if (scrape.status !== 'ok' || !scrape.html) return drafts;

  if (!extractMetaDescription(scrape.html)) {
    push('no_seo', 'observed', 'Missing <meta name="description"> tag');
  }

  if (!/instagram\.com|facebook\.com|linkedin\.com/i.test(scrape.html)) {
    push(
      'weak_social_presence',
      'inferred',
      'No links to instagram.com, facebook.com, or linkedin.com found',
    );
  }

  if (!/googletagmanager/i.test(scrape.html) && !/gtag\(/i.test(scrape.html)) {
    push('no_automation', 'speculative', 'No googletagmanager script or gtag() call found');
  }

  return drafts;
}

function buildFallbackRationale(serviceLine: ServiceLine, painPointKeys: string[]) {
  return {
    serviceLineKey: serviceLine.key,
    rationaleEs: `Encaje basado en señales: ${painPointKeys.join(', ')}.`,
    expectedOutcomeEs: `Reducir fricción asociada a ${serviceLine.labelEs.toLowerCase()}.`,
    fitScore: Math.min(95, 40 + painPointKeys.length * 15),
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

interface ServiceFitRationaleItem {
  serviceLineKey: string;
  rationaleEs: string;
  expectedOutcomeEs: string;
  fitScore: number;
}

export async function runEnrichment(
  payload: EnrichmentPayloadContract,
  deps: RunEnrichmentDeps = {},
): Promise<JobResult> {
  const prisma = deps.prisma ?? defaultPrisma;
  const ai = deps.ai ?? anthropicClient;
  const scrape = deps.scrape ?? scrapeWebsite;
  const audit = deps.audit ?? auditService;
  const now = deps.now ?? (() => new Date());
  const failures: string[] = [];
  const modelsUsed: string[] = [];
  let rulePainPointCount = 0;
  let claudePainPointCount = 0;
  let serviceFitsCreated = 0;
  let sourceHits = 0;
  let runId = '';
  let finalStatus: 'succeeded' | 'partial' | 'failed' = 'succeeded';

  try {
    const run = await prisma.enrichmentRun.findFirst({
      where: {
        companyId: payload.companyId,
        status: 'queued',
        ...(payload.actorUserId ? { triggeredById: payload.actorUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!run) throw new Error(`No queued enrichment run found for company ${payload.companyId}`);
    runId = run.id;

    const company = await prisma.company.findFirst({
      where: { id: payload.companyId, deletedAt: null },
    });
    if (!company) throw new Error(`Company ${payload.companyId} not found`);

    await prisma.enrichmentRun.update({
      where: { id: run.id },
      data: { status: 'running', startedAt: now(), errorMessage: null },
    });

    const categories = await prisma.painPointCategory.findMany({ where: { isActive: true } });
    const categoryByKey = new Map(categories.map((category) => [category.key, category]));

    let scrapeResult: ScrapeResult | null = null;
    let sourceHit: EnrichmentSourceHit | null = null;
    let extracted: ParsedExtractedFields = {};

    if (!company.website) {
      sourceHit = await prisma.enrichmentSourceHit.create({
        data: {
          runId: run.id,
          sourceType: 'website_scrape',
          sourceUrl: run.inputUrl ?? null,
          status: 'not_found',
          fetchedAt: now(),
          responseExcerpt: null,
          extracted: {},
          error: 'Company has no website',
        },
      });
      sourceHits++;
    } else {
      scrapeResult = await scrape(company.website);
      sourceHit = await prisma.enrichmentSourceHit.create({
        data: {
          runId: run.id,
          sourceType: 'website_scrape',
          sourceUrl: scrapeResult.finalUrl,
          status: scrapeResult.status,
          fetchedAt: new Date(scrapeResult.fetchedAt),
          responseExcerpt: scrapeResult.excerpt ?? null,
          extracted: {},
          error: scrapeResult.error ?? null,
        },
      });
      sourceHits++;

      if (scrapeResult.status !== 'ok') {
        failures.push(`scrape:${scrapeResult.status}`);
      }

      if (scrapeResult.status === 'ok' && scrapeResult.textContent) {
        try {
          const prompt = extractCompanyFields({
            url: scrapeResult.finalUrl,
            textContent: scrapeResult.textContent,
            excerpt: scrapeResult.excerpt,
          });
          const response = await ai.complete({
            feature: 'lead_enrichment_extract',
            ...prompt,
            entityType: 'company',
            entityId: company.id,
            userId: payload.actorUserId,
          });
          modelsUsed.push(response.modelUsed);
          extracted = safeJsonParse<ParsedExtractedFields>(response.text) ?? {};
          if (response.text && Object.keys(extracted).length === 0) {
            log.warn({ runId: run.id }, 'lead_enrichment_extract returned invalid JSON');
            failures.push('extract:invalid_json');
          }
        } catch (error) {
          failures.push('extract:failed');
          log.warn(
            { runId: run.id, err: error instanceof Error ? error.message : String(error) },
            'lead_enrichment_extract failed',
          );
        }

        await prisma.enrichmentSourceHit.update({
          where: { id: sourceHit.id },
          data: { extracted: extracted as Prisma.InputJsonValue },
        });

        const companyUpdate = pickFillableCompanyFields(company, extracted);
        const fieldsFilled = Object.keys(companyUpdate);
        if (fieldsFilled.length > 0) {
          await prisma.company.update({
            where: { id: company.id },
            data: companyUpdate,
          });
          await audit.record({
            actorUserId: payload.actorUserId,
            action: 'company.enriched.fields_filled',
            entityType: 'company',
            entityId: company.id,
            metadata: { fieldsFilled } satisfies Prisma.InputJsonValue,
          });
        }
      }
    }

    const rulePainPoints =
      company.website && sourceHit
        ? applyPainPointRules({
            scrape: scrapeResult ?? {
              url: company.website,
              finalUrl: company.website,
              status: 'not_found',
              fetchedAt: now().toISOString(),
            },
            company,
            sourceHitId: sourceHit.id,
            categoryByKey,
          })
        : [];

    if (rulePainPoints.length > 0) {
      const result = await prisma.painPoint.createMany({
        data: rulePainPoints.map((item) => ({
          companyId: company.id,
          categoryId: item.categoryId,
          confidence: item.confidence,
          evidenceText: item.evidenceText.slice(0, 500),
          evidenceSourceUrl: item.evidenceSourceUrl,
          evidenceSourceHitId: item.evidenceSourceHitId,
          evidenceTimestamp: now(),
          detectedBy: 'rule',
        })),
      });
      rulePainPointCount += result.count;
    }

    const createdPainPointsForFit = [...rulePainPoints];

    if (scrapeResult?.textContent && sourceHit) {
      try {
        const prompt = inferPainPoints({
          url: scrapeResult.finalUrl,
          textContent: scrapeResult.textContent,
          categoryKeys: categories.map((category) => category.key),
        });
        const response = await ai.complete({
          feature: 'pain_points',
          ...prompt,
          entityType: 'company',
          entityId: company.id,
          userId: payload.actorUserId,
        });
        modelsUsed.push(response.modelUsed);
        const parsed =
          safeJsonParse<
            Array<{
              categoryKey: string;
              confidence: PainPointDraft['confidence'];
              evidenceText: string;
              evidenceSourceUrl?: string;
            }>
          >(response.text) ?? [];

        const claudePainPoints: PainPointDraft[] = [];
        for (const item of parsed) {
          const category = categoryByKey.get(item.categoryKey);
          if (!category) {
            log.warn(
              { runId: run.id, categoryKey: item.categoryKey },
              'unknown pain point category',
            );
            continue;
          }
          claudePainPoints.push({
            categoryId: category.id,
            categoryKey: item.categoryKey,
            confidence: item.confidence,
            evidenceText: item.evidenceText,
            evidenceSourceUrl: item.evidenceSourceUrl ?? scrapeResult.finalUrl,
            evidenceSourceHitId: sourceHit.id,
            detectedBy: 'claude',
          });
        }

        if (claudePainPoints.length > 0) {
          const result = await prisma.painPoint.createMany({
            data: claudePainPoints.map((item) => ({
              companyId: company.id,
              categoryId: item.categoryId,
              confidence: item.confidence,
              evidenceText: item.evidenceText.slice(0, 500),
              evidenceSourceUrl: item.evidenceSourceUrl,
              evidenceSourceHitId: item.evidenceSourceHitId,
              evidenceTimestamp: now(),
              detectedBy: 'claude',
            })),
          });
          claudePainPointCount += result.count;
          createdPainPointsForFit.push(...claudePainPoints);
        }
      } catch (error) {
        failures.push('pain_points:failed');
        log.warn(
          { runId: run.id, err: error instanceof Error ? error.message : String(error) },
          'pain_points failed',
        );
      }
    }

    const candidateCounts = new Map<string, { count: number; painPointKeys: string[] }>();
    for (const painPoint of createdPainPointsForFit) {
      const category = categoryByKey.get(painPoint.categoryKey);
      if (!category) continue;
      for (const serviceLineKey of category.defaultServiceRecommendations) {
        const current = candidateCounts.get(serviceLineKey) ?? { count: 0, painPointKeys: [] };
        current.count += 1;
        current.painPointKeys.push(painPoint.categoryKey);
        candidateCounts.set(serviceLineKey, current);
      }
    }

    const candidateKeys = [...candidateCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([key]) => key);

    if (candidateKeys.length > 0) {
      const serviceLines = await prisma.serviceLine.findMany({
        where: { key: { in: candidateKeys }, isActive: true },
      });
      const orderedServiceLines = candidateKeys
        .map((key) => serviceLines.find((serviceLine) => serviceLine.key === key))
        .filter((serviceLine): serviceLine is ServiceLine => Boolean(serviceLine));

      let rationales: ServiceFitRationaleItem[] | null = null;

      try {
        const prompt = serviceFitRationale({
          companyName: extracted.name ?? company.name,
          painPoints: createdPainPointsForFit.map((item) => ({
            categoryKey: item.categoryKey,
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
          userId: payload.actorUserId,
        });
        modelsUsed.push(response.modelUsed);
        rationales = safeJsonParse<ServiceFitRationaleItem[]>(response.text);
      } catch (error) {
        failures.push('service_fit:failed');
        log.warn(
          { runId: run.id, err: error instanceof Error ? error.message : String(error) },
          'service_fit failed',
        );
      }

      const rationaleByKey = new Map((rationales ?? []).map((item) => [item.serviceLineKey, item]));

      const data = orderedServiceLines.map((serviceLine) => {
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
        } as const;
      });

      if (data.length > 0) {
        const result = await prisma.serviceFitRecommendation.createMany({ data });
        serviceFitsCreated += result.count;
      }
    }

    finalStatus = failures.length > 0 ? 'partial' : 'succeeded';
    const summary = {
      runId: run.id,
      status: finalStatus,
      sourceHits,
      painPointsCreated: rulePainPointCount + claudePainPointCount,
      painPointsByOrigin: { rule: rulePainPointCount, claude: claudePainPointCount },
      serviceFitsCreated,
      modelsUsed: unique(modelsUsed),
      failures,
    } satisfies Record<string, unknown>;

    await prisma.enrichmentRun.update({
      where: { id: run.id },
      data: {
        status: finalStatus,
        finishedAt: now(),
        summary: summary as Prisma.InputJsonValue,
      },
    });

    return { ok: true, summary };
  } catch (error) {
    finalStatus = 'failed';
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      await prisma.enrichmentRun
        .update({
          where: { id: runId },
          data: {
            status: 'failed',
            finishedAt: now(),
            errorMessage: message.slice(0, 2000),
            summary: {
              sourceHits,
              painPointsCreated: rulePainPointCount + claudePainPointCount,
              painPointsByOrigin: { rule: rulePainPointCount, claude: claudePainPointCount },
              serviceFitsCreated,
              modelsUsed: unique(modelsUsed),
              failures: unique([...failures, 'hard_failure']),
            },
          },
        })
        .catch(() => {});
    }

    await audit
      .record({
        actorUserId: payload.actorUserId,
        action: 'enrichment.run.failed',
        entityType: 'company',
        entityId: payload.companyId,
        metadata: { runId, reason: message.slice(0, 200) } satisfies Prisma.InputJsonValue,
      })
      .catch(() => {});

    log.error({ runId, err: message }, 'runEnrichment failed');
    throw error;
  }
}
