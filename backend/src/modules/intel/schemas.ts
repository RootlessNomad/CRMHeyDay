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

export type EnrichmentRunCreateInput = z.infer<typeof EnrichmentRunCreateSchema>;
export type EnrichmentRunDto = z.infer<typeof EnrichmentRunDtoSchema>;
export type EnrichmentSourceHitDto = z.infer<typeof EnrichmentSourceHitDtoSchema>;
