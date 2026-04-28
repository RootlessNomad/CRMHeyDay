import { z } from 'zod';

export const ActivityKindSchema = z.enum(['note', 'task', 'call_log', 'email_log', 'meeting_log']);

export const ActivityEntityTypeSchema = z.enum(['company', 'contact', 'lead']);

const isoDatetimeSchema = z.string().datetime();

const activityWritableFields = {
  kind: ActivityKindSchema,
  title: z.string().max(200).optional(),
  body: z.string().max(10_000).optional(),
  due_at: isoDatetimeSchema.optional(),
  remind_at: isoDatetimeSchema.optional(),
  owner_id: z.string().min(1).optional(),
  completed_at: isoDatetimeSchema.optional(),
};

export const ActivityCreateSchema = z.object({
  entity_type: ActivityEntityTypeSchema,
  entity_id: z.string().min(1),
  ...activityWritableFields,
});

export const ActivityUpdateSchema = z.object({
  kind: activityWritableFields.kind.optional(),
  title: activityWritableFields.title,
  body: activityWritableFields.body,
  due_at: activityWritableFields.due_at,
  remind_at: activityWritableFields.remind_at,
  owner_id: activityWritableFields.owner_id,
  completed_at: activityWritableFields.completed_at,
});

export const ActivityListQuerySchema = z.object({
  entity_type: ActivityEntityTypeSchema,
  entity_id: z.string().min(1),
  kind: ActivityKindSchema.optional(),
  owner_id: z.string().min(1).optional(),
  completed: z.enum(['true', 'false']).optional(),
  due_from: isoDatetimeSchema.optional(),
  due_to: isoDatetimeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const ActivityDtoSchema = z.object({
  id: z.string(),
  entity_type: ActivityEntityTypeSchema,
  entity_id: z.string(),
  kind: ActivityKindSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  owner_id: z.string(),
  due_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  remind_at: z.string().datetime().nullable(),
  created_by_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type ActivityCreateInput = z.infer<typeof ActivityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof ActivityUpdateSchema>;
export type ActivityListQuery = z.infer<typeof ActivityListQuerySchema>;
export type ActivityDto = z.infer<typeof ActivityDtoSchema>;
