import { z } from 'zod';

export const EnrichmentRunCreateSchema = z
  .object({
    companyId: z.string().min(1).optional(),
    inputUrl: z.string().url().optional(),
  })
  .refine((value) => Boolean(value.companyId || value.inputUrl), {
    message: 'companyId o inputUrl requerido',
  });

export const EnrichmentRunIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const CompanyIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const EnrichmentSourceHitDtoSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_url: z.string().nullable(),
  status: z.string(),
  fetched_at: z.string().datetime(),
  response_excerpt: z.string().nullable(),
  extracted: z.unknown(),
  error: z.string().nullable(),
});

export const EnrichmentRunDtoSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  triggered_by_id: z.string(),
  status: z.string(),
  input_url: z.string().nullable(),
  started_at: z.string().datetime().nullable(),
  finished_at: z.string().datetime().nullable(),
  error_message: z.string().nullable(),
  summary: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(),
  source_hits: z.array(EnrichmentSourceHitDtoSchema).optional(),
  pain_points_created_count: z.number().int().nonnegative().optional(),
  service_fits_created_count: z.number().int().nonnegative().optional(),
});

export const PainPointConfidenceSchema = z.enum(['observed', 'inferred', 'speculative']);

export const PainPointListQuerySchema = z.object({
  company_id: z.string().min(1).optional(),
  confidence: PainPointConfidenceSchema.optional(),
  category_id: z.string().min(1).optional(),
  human_verified: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const PainPointCreateSchema = z.object({
  company_id: z.string().min(1),
  category_id: z.string().min(1),
  confidence: PainPointConfidenceSchema,
  evidence_text: z.string().trim().min(1),
  evidence_source_url: z.string().url().optional(),
});

export const PainPointUpdateSchema = z
  .object({
    human_verified: z.boolean().optional(),
    evidence_text: z.string().trim().min(1).optional(),
    evidence_source_url: z.string().url().nullable().optional(),
    confidence: PainPointConfidenceSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe proporcionarse al menos un campo para actualizar',
  });

export const PainPointDtoSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  category_id: z.string(),
  category_key: z.string(),
  category_label_es: z.string(),
  confidence: PainPointConfidenceSchema,
  evidence_text: z.string(),
  evidence_source_url: z.string().nullable(),
  evidence_timestamp: z.string().datetime(),
  detected_by: z.enum(['rule', 'claude', 'human']),
  human_verified: z.boolean(),
  verified_by_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const ServiceFitDtoSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  service_line_id: z.string(),
  service_line_key: z.string(),
  service_line_label_es: z.string(),
  triggering_signals: z.array(z.string()),
  rationale_es: z.string(),
  expected_outcome_es: z.string(),
  fit_score: z.number().int().min(0).max(100),
  generated_by: z.enum(['rule', 'claude', 'human']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const ServiceFitListQuerySchema = z.object({
  company_id: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const ServiceFitRegenerateSchema = z.object({
  company_id: z.string().min(1),
});

export const BulkImportErrorSchema = z.object({
  row: z.number().int().positive(),
  message: z.string().min(1),
});

export const BulkImportResultSchema = z.object({
  batchId: z.string().min(1),
  count: z.number().int().nonnegative(),
  runIds: z.array(z.string().min(1)),
  errors: z.array(BulkImportErrorSchema),
});

export type EnrichmentRunCreateInput = z.infer<typeof EnrichmentRunCreateSchema>;
export type EnrichmentRunDto = z.infer<typeof EnrichmentRunDtoSchema>;
export type EnrichmentSourceHitDto = z.infer<typeof EnrichmentSourceHitDtoSchema>;
export type BulkImportError = z.infer<typeof BulkImportErrorSchema>;
export type BulkImportResult = z.infer<typeof BulkImportResultSchema>;
export type PainPointListQuery = z.infer<typeof PainPointListQuerySchema>;
export type PainPointCreateInput = z.infer<typeof PainPointCreateSchema>;
export type PainPointUpdateInput = z.infer<typeof PainPointUpdateSchema>;
export type PainPointDto = z.infer<typeof PainPointDtoSchema>;
export type ServiceFitDto = z.infer<typeof ServiceFitDtoSchema>;
export type ServiceFitListQuery = z.infer<typeof ServiceFitListQuerySchema>;
export type ServiceFitRegenerateInput = z.infer<typeof ServiceFitRegenerateSchema>;

export const OutboundPrepDtoSchema = z.object({
  id: z.string(),
  company_id: z.string(),
  segment: z.string(),
  likely_need: z.string(),
  outreach_angle: z.string(),
  value_proposition: z.string(),
  service_pitch: z.string(),
  tone_guidance: z.string(),
  priority_score: z.number().int().min(0).max(100),
  sdr_notes: z.string().nullable(),
  last_generated_at: z.string().datetime(),
  last_generated_by_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const OutboundPrepQuerySchema = z.object({
  company_id: z.string().min(1),
});

export const OutboundPrepRegenerateSchema = z.object({
  company_id: z.string().min(1),
});

export const OutboundPrepUpdateSchema = z
  .object({
    segment: z.string().min(1).optional(),
    likely_need: z.string().min(1).optional(),
    outreach_angle: z.string().min(1).optional(),
    value_proposition: z.string().min(1).optional(),
    service_pitch: z.string().min(1).optional(),
    tone_guidance: z.string().min(1).optional(),
    priority_score: z.number().int().min(0).max(100).optional(),
    sdr_notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field required');

export type OutboundPrepDto = z.infer<typeof OutboundPrepDtoSchema>;
export type OutboundPrepQuery = z.infer<typeof OutboundPrepQuerySchema>;
export type OutboundPrepRegenerateInput = z.infer<typeof OutboundPrepRegenerateSchema>;
export type OutboundPrepUpdateInput = z.infer<typeof OutboundPrepUpdateSchema>;
