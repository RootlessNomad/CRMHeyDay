import { z } from 'zod';

export const DashboardMetricsDtoSchema = z.object({
  leads_open: z.number().int(),
  leads_stale: z.number().int(),
  approvals_pending: z.number().int(),
  jobs_running: z.number().int(),
  ai_cost_month_usd: z.number(),
});

export const UpcomingActionDtoSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  kind: z.string(),
  due_at: z.string().datetime(),
  entity_type: z.string(),
  entity_id: z.string(),
});

export const TopLeadDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority_score: z.number().int(),
  stage_name: z.string().nullable(),
});

export type DashboardMetricsDto = z.infer<typeof DashboardMetricsDtoSchema>;
export type UpcomingActionDto = z.infer<typeof UpcomingActionDtoSchema>;
export type TopLeadDto = z.infer<typeof TopLeadDtoSchema>;
