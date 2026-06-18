import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { anthropicClient, parseAiJson, type AnthropicClient } from '../../core/ai/index.js';
import { secretsResolver } from '../../core/config/secrets.js';
import { rootLogger } from '../../core/observability/logger.js';
import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { enqueue, QUEUE_NAMES } from '../../core/queue/queues.js';
import type { JobResult, LeadDiscoveryPayload } from '../../core/queue/types.js';
import {
  searchGooglePlaces as defaultSearchGooglePlaces,
  type PlaceResult,
} from '../../core/sources/google-places.js';
import { normalizeDomain } from '../companies/domain.js';
import {
  type CompaniesService,
  CompanyDomainConflictError,
  companiesService,
} from '../companies/index.js';
import { leadDiscoveryEmailPrompt } from '../intel/prompts.js';
import {
  type LeadDiscoveryRequest,
  type LeadDiscoverySummary,
  mapBusinessTypeToVertical,
} from './schemas.js';

const log = rootLogger.child({ component: 'lead-discovery.service' });
const GOOGLE_PLACES_KEY = 'google_places';

const leadDiscoveryCompletionSchema = z.object({
  score: z.number().int().min(0).max(100),
  segment: z.string().min(1),
  likely_need: z.string().min(1),
  outreach_angle: z.string().min(1),
  value_proposition: z.string().min(1),
  service_pitch: z.string().min(1),
  tone_guidance: z.string().min(1),
  email_subject: z.string().min(1),
  email_body: z.string().min(1),
});

type AiClientLike = Pick<AnthropicClient, 'complete'>;

interface Deps {
  db: PrismaClient;
  search: typeof defaultSearchGooglePlaces;
  getApiKey: () => Promise<string>;
  ai: AiClientLike;
  companies: CompaniesService;
}

function buildDuplicateWhere(place: PlaceResult, city: string) {
  const domain = normalizeDomain(place.website);
  return {
    deletedAt: null,
    OR: [
      {
        name: { equals: place.name, mode: 'insensitive' as const },
        city: { equals: city, mode: 'insensitive' as const },
      },
      ...(place.phone ? [{ phone: place.phone }] : []),
      ...(domain ? [{ domain }] : []),
    ],
  };
}

let cachedDefaultPipeline:
  | {
      id: string;
      stages: Array<{ id: string }>;
    }
  | null
  | undefined;

async function getDefaultPipeline(db: PrismaClient): Promise<{ id: string; stageId: string }> {
  if (cachedDefaultPipeline === undefined) {
    cachedDefaultPipeline = await db.pipeline.findFirst({
      where: { isDefault: true },
      include: {
        stages: {
          where: { kind: 'open' },
          orderBy: { orderIndex: 'asc' },
          take: 1,
        },
      },
    });
  }

  const pipeline = cachedDefaultPipeline;
  if (!pipeline?.stages[0]) {
    throw new Error('No existe pipeline por defecto con una stage open.');
  }

  return { id: pipeline.id, stageId: pipeline.stages[0].id };
}

export async function enqueueleadDiscovery(
  input: LeadDiscoveryRequest,
  actorUserId: string,
): Promise<{ jobId: string }> {
  const { jobId } = await enqueue(QUEUE_NAMES.leadDiscovery, {
    city: input.city,
    businessType: input.businessType,
    maxResults: input.maxResults ?? 20,
    actorUserId,
  });
  return { jobId };
}

export async function run(
  payload: LeadDiscoveryPayload,
  deps: Partial<Deps> = {},
): Promise<JobResult> {
  const db = deps.db ?? defaultPrisma;
  const search = deps.search ?? defaultSearchGooglePlaces;
  const getApiKey = deps.getApiKey ?? (() => secretsResolver.get(GOOGLE_PLACES_KEY));
  const ai = deps.ai ?? anthropicClient;
  const companies = deps.companies ?? companiesService;

  const vertical = mapBusinessTypeToVertical(payload.businessType);
  const apiKey = await getApiKey();
  const places = await search({
    city: payload.city,
    businessType: payload.businessType,
    apiKey,
    maxResults: payload.maxResults,
  });

  let duplicated = 0;
  let qualified = 0;
  let leadsCreated = 0;
  let errors = 0;

  for (const place of places) {
    const cityForPlace = place.city ?? payload.city;

    try {
      const existing = await db.company.findFirst({
        where: buildDuplicateWhere(place, cityForPlace),
        select: { id: true },
      });
      if (existing) {
        duplicated += 1;
        continue;
      }

      let company;
      try {
        company = await companies.create(
          {
            name: place.name,
            website: place.website,
            city: cityForPlace,
            phone: place.phone,
            country: 'ES',
            icp_vertical: vertical,
          },
          payload.actorUserId,
        );
      } catch (error) {
        if (error instanceof CompanyDomainConflictError) {
          duplicated += 1;
          continue;
        }
        throw error;
      }

      const completion = await ai.complete({
        feature: 'lead_discovery',
        ...leadDiscoveryEmailPrompt({
          businessName: place.name,
          businessType: payload.businessType,
          city: cityForPlace,
          address: place.address,
          rating: place.rating,
          ratingCount: place.userRatingCount,
          website: place.website,
        }),
      });

      const parsedJson = parseAiJson<unknown>(completion.text);
      if (!parsedJson) {
        throw new Error('Claude devolvió una respuesta inválida para lead_discovery.');
      }

      const parsed = leadDiscoveryCompletionSchema.parse(parsedJson);
      if (parsed.score < 40) continue;

      const pipeline = await getDefaultPipeline(db);

      await db.lead.create({
        data: {
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stageId,
          ownerId: payload.actorUserId,
          source: 'other',
          status: 'open',
        },
      });

      const emailDraft = `Asunto: ${parsed.email_subject}\n\n${parsed.email_body}`;

      await db.outboundPrep.upsert({
        where: { companyId: company.id },
        create: {
          companyId: company.id,
          segment: parsed.segment,
          likelyNeed: parsed.likely_need,
          outreachAngle: parsed.outreach_angle,
          valueProposition: parsed.value_proposition,
          servicePitch: parsed.service_pitch,
          toneGuidance: parsed.tone_guidance,
          priorityScore: parsed.score,
          emailDraft,
          lastGeneratedAt: new Date(),
          lastGeneratedById: payload.actorUserId,
        },
        update: {
          segment: parsed.segment,
          likelyNeed: parsed.likely_need,
          outreachAngle: parsed.outreach_angle,
          valueProposition: parsed.value_proposition,
          servicePitch: parsed.service_pitch,
          toneGuidance: parsed.tone_guidance,
          priorityScore: parsed.score,
          emailDraft,
          lastGeneratedAt: new Date(),
          lastGeneratedById: payload.actorUserId,
        },
      });

      qualified += 1;
      leadsCreated += 1;
    } catch (error) {
      errors += 1;
      log.warn(
        { placeId: place.placeId, err: error instanceof Error ? error.message : String(error) },
        'lead discovery: failed to process place',
      );
    }
  }

  const summary: LeadDiscoverySummary = {
    city: payload.city,
    businessType: payload.businessType,
    found: places.length,
    qualified,
    leads_created: leadsCreated,
    errors,
  };

  log.info({ ...summary, duplicated }, 'lead discovery run complete');
  return { ok: true, summary };
}

export const leadDiscoveryService = { enqueueleadDiscovery, run };
