import { z } from 'zod';

export const TagKindSchema = z.enum(['general', 'vertical', 'persona', 'service_interest']);

export const TaggableEntityTypeSchema = z.enum(['company', 'contact', 'lead', 'content_item']);

const isoDatetimeSchema = z.string().datetime();
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const tagWritableFields = {
  name: z.string().trim().min(1).max(80),
  color: colorSchema.optional(),
  kind: TagKindSchema,
};

export const TagCreateSchema = z.object({
  name: tagWritableFields.name,
  color: tagWritableFields.color,
  kind: TagKindSchema.default('general'),
});

export const TagUpdateSchema = z
  .object({
    name: tagWritableFields.name,
    color: colorSchema,
    kind: tagWritableFields.kind,
  })
  .partial();

export const TagListQuerySchema = z.object({
  q: z.string().min(1).optional(),
  kind: TagKindSchema.optional(),
});

export const TagAssignSchema = z.object({
  tag_id: z.string().min(1),
  entity_type: TaggableEntityTypeSchema,
  entity_id: z.string().min(1),
});

export const TagByEntityQuerySchema = z.object({
  entity_type: TaggableEntityTypeSchema,
  entity_id: z.string().min(1),
});

export const TagDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  kind: TagKindSchema,
  created_at: isoDatetimeSchema,
});

export type TagCreateInput = z.infer<typeof TagCreateSchema>;
export type TagUpdateInput = z.infer<typeof TagUpdateSchema>;
export type TagListQuery = z.infer<typeof TagListQuerySchema>;
export type TagAssignInput = z.infer<typeof TagAssignSchema>;
export type TagByEntityQuery = z.infer<typeof TagByEntityQuerySchema>;
export type TagDto = z.infer<typeof TagDtoSchema>;
