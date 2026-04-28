import { PAGINATION } from '@heyday/shared';
import { z } from 'zod';

const leadSourceSchema = z.enum(['manual', 'csv_import', 'enrichment', 'n8n_webhook', 'other']);
const leadStatusSchema = z.enum(['open', 'won', 'lost']);
const prioritySchema = z.number().int().min(0).max(100);

export const createLeadSchema = z.object({
  companyId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  ownerId: z.string().min(1),
  primaryContactId: z.string().min(1).optional(),
  source: leadSourceSchema.default('manual'),
  priorityManual: prioritySchema.optional(),
  nextActionAt: z.string().datetime().optional(),
});

export const updateLeadSchema = z.object({
  companyId: z.string().min(1).optional(),
  pipelineId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  primaryContactId: z.string().min(1).optional(),
  source: leadSourceSchema.optional(),
  priorityManual: prioritySchema.optional(),
  nextActionAt: z.string().datetime().optional(),
  status: leadStatusSchema.optional(),
  lostReason: z.string().min(1).max(500).optional(),
});

export const listLeadsQuerySchema = z.object({
  stageId: z.string().min(1).optional(),
  pipelineId: z.string().min(1).optional(),
  ownerId: z.string().min(1).optional(),
  status: leadStatusSchema.optional(),
  priorityMin: prioritySchema.optional(),
  companyId: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxLimit)
    .default(PAGINATION.defaultLimit),
});

export const lostLeadSchema = z.object({
  lostReason: z.string().min(1).max(500),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type LostLeadInput = z.infer<typeof lostLeadSchema>;
