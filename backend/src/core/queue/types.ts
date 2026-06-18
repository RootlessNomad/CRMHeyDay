// Contratos de payload por queue. TODO lo que entra en una queue pasa primero
// por el `parse` del zod schema correspondiente — si no valida, NO se encola.
// Regla: los payloads SÓLO contienen ids de entidades y flags; nunca secretos,
// plaintext, PII sensible ni objetos grandes. El worker hidrata desde DB.

import { z } from 'zod';

// ------------------------------------------------------------------
// Nombres de queues (coinciden con acceptance de IT-07)
// ------------------------------------------------------------------
export const QUEUE_NAMES = {
  enrichment: 'enrichment',
  discovery: 'discovery',
  leadDiscovery: 'lead_discovery',
  contentIdea: 'content_idea',
  contentGeneration: 'content_generation',
  contentAdapt: 'content_adapt',
  integrationTest: 'integration_test',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ------------------------------------------------------------------
// Schemas de payload por queue
// ------------------------------------------------------------------

/**
 * Enrichment de una empresa: disparar website scrape + lookup APIs externas
 * + detección de pain points. `companyId` es el único input.
 */
export const EnrichmentPayloadSchema = z.object({
  companyId: z.string().min(1),
  reason: z.enum(['manual', 'auto_after_create', 'bulk_import']).default('manual'),
  actorUserId: z.string().min(1).optional(),
});
export type EnrichmentPayload = z.infer<typeof EnrichmentPayloadSchema>;

/**
 * Descubrimiento en masa (UJ-31): buscar negocios de una ciudad/tipo en Google
 * Places y crear `Company` por cada uno (dedup por dominio + nombre/ciudad).
 * La API key NO viaja en el payload — el worker la resuelve via `secretsResolver`.
 */
export const DiscoveryPayloadSchema = z.object({
  city: z.string().min(1).max(120),
  businessType: z.string().min(1).max(120),
  maxResults: z.number().int().min(1).max(60).default(20),
  triggerEnrichment: z.boolean().default(false),
  actorUserId: z.string().min(1),
});
export type DiscoveryPayload = z.infer<typeof DiscoveryPayloadSchema>;

export const LeadDiscoveryPayloadSchema = z.object({
  city: z.string().min(1).max(120),
  businessType: z.string().min(1).max(120),
  maxResults: z.number().int().min(1).max(60).default(20),
  actorUserId: z.string().min(1),
});
export type LeadDiscoveryPayload = z.infer<typeof LeadDiscoveryPayloadSchema>;

export const ContentIdeaPayloadSchema = z.object({
  pillarId: z.string().min(1),
  serviceLineId: z.string().min(1).optional(),
  icpVertical: z
    .enum(['physiotherapy', 'pilates', 'yoga', 'gym_fitness', 'bakery', 'cafe', 'other'])
    .optional(),
  briefEs: z.string().min(1).max(2000),
  actorUserId: z.string().min(1),
  count: z.number().int().min(3).max(10).default(5),
});
export type ContentIdeaPayload = z.infer<typeof ContentIdeaPayloadSchema>;

/**
 * Generación de un borrador inicial para un ContentItem (pillar + canal).
 */
export const ContentGenerationPayloadSchema = z.object({
  contentItemId: z.string().min(1),
  actorUserId: z.string().min(1),
  modelOverride: z.string().optional(),
  guidance: z.string().max(2000).optional(),
});
export type ContentGenerationPayload = z.infer<typeof ContentGenerationPayloadSchema>;

/**
 * Adaptación de un ContentVersion a otro canal (ej. LinkedIn → Twitter).
 */
export const ContentAdaptPayloadSchema = z.object({
  sourceVersionId: z.string().min(1),
  targetChannel: z.string().min(1),
  actorUserId: z.string().min(1),
});
export type ContentAdaptPayload = z.infer<typeof ContentAdaptPayloadSchema>;

/**
 * Smoke test de una credential (ej. "pingear Anthropic con esta key").
 * NO pasamos la key — el worker la resuelve via `secretsResolver`.
 */
export const IntegrationTestPayloadSchema = z.object({
  credentialId: z.string().min(1),
  actorUserId: z.string().min(1),
});
export type IntegrationTestPayload = z.infer<typeof IntegrationTestPayloadSchema>;

// ------------------------------------------------------------------
// Map nombre → schema para validación en `enqueue`
// ------------------------------------------------------------------
export const QUEUE_SCHEMAS = {
  [QUEUE_NAMES.enrichment]: EnrichmentPayloadSchema,
  [QUEUE_NAMES.discovery]: DiscoveryPayloadSchema,
  [QUEUE_NAMES.leadDiscovery]: LeadDiscoveryPayloadSchema,
  [QUEUE_NAMES.contentIdea]: ContentIdeaPayloadSchema,
  [QUEUE_NAMES.contentGeneration]: ContentGenerationPayloadSchema,
  [QUEUE_NAMES.contentAdapt]: ContentAdaptPayloadSchema,
  [QUEUE_NAMES.integrationTest]: IntegrationTestPayloadSchema,
} as const satisfies Record<QueueName, z.ZodTypeAny>;

export type PayloadForQueue = {
  [QUEUE_NAMES.enrichment]: EnrichmentPayload;
  [QUEUE_NAMES.discovery]: DiscoveryPayload;
  [QUEUE_NAMES.leadDiscovery]: LeadDiscoveryPayload;
  [QUEUE_NAMES.contentIdea]: ContentIdeaPayload;
  [QUEUE_NAMES.contentGeneration]: ContentGenerationPayload;
  [QUEUE_NAMES.contentAdapt]: ContentAdaptPayload;
  [QUEUE_NAMES.integrationTest]: IntegrationTestPayload;
};

/** Resultado escrito al espejo `Job` cuando un processor acaba con éxito. */
export interface JobResult {
  ok: true;
  /** Resumen no sensible del trabajo (ids, counts, duraciones). */
  summary?: Record<string, unknown>;
}

export class InvalidJobPayloadError extends Error {
  readonly code = 'JOB_INVALID_PAYLOAD';
  constructor(queue: string, issues: unknown) {
    super(`Payload inválido para queue '${queue}': ${JSON.stringify(issues)}`);
    this.name = 'InvalidJobPayloadError';
  }
}
