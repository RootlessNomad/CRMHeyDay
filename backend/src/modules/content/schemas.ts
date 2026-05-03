import type { ContentIdea, ContentPillar, IcpVertical } from '@prisma/client';
import { z } from 'zod';

const ContentIdeaStatusSchema = z.enum(['idea', 'in_production', 'shipped', 'archived']);
const ContentChannelSchema = z.enum(['instagram', 'linkedin', 'newsletter']);
const IcpVerticalSchema = z.enum([
  'physiotherapy',
  'pilates',
  'yoga',
  'gym_fitness',
  'bakery',
  'cafe',
  'other',
]);

export const IdeaListQuerySchema = z.object({
  status: ContentIdeaStatusSchema.optional(),
  pillar_id: z.string().min(1).optional(),
  vertical: IcpVerticalSchema.optional(),
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IdeaCreateManualSchema = z.object({
  title: z.string().trim().min(1).max(200),
  angle: z.string().trim().min(1).max(500),
  pillar_id: z.string().min(1),
  service_line_id: z.string().min(1).optional(),
  icp_vertical: IcpVerticalSchema.optional(),
  brief_es: z.string().trim().min(1).max(2000),
});

export const IdeaGenerateSchema = z.object({
  generate: z.literal(true),
  pillar_id: z.string().min(1),
  service_line_id: z.string().min(1).optional(),
  icp_vertical: IcpVerticalSchema.optional(),
  brief_es: z.string().trim().min(1).max(2000),
  count: z.number().int().min(3).max(10).default(5).optional(),
});

export const IdeaCreateBodySchema = z.union([IdeaGenerateSchema, IdeaCreateManualSchema]);

export const IdeaUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    angle: z.string().trim().min(1).max(500).optional(),
    brief_es: z.string().trim().min(1).max(2000).optional(),
    status: ContentIdeaStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe proporcionarse al menos un campo para actualizar',
  });

export const DraftRequestSchema = z.object({
  channels: z
    .array(ContentChannelSchema)
    .min(1)
    .max(3)
    .default(['instagram', 'linkedin', 'newsletter']),
});

export const IdeaDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  angle: z.string(),
  pillar_id: z.string(),
  pillar_label: z.string(),
  service_line_id: z.string().nullable(),
  icp_vertical: IcpVerticalSchema.nullable(),
  brief_es: z.string(),
  status: ContentIdeaStatusSchema,
  created_by_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  items_count: z.number().int().nonnegative(),
});

export const IdeaListResponseSchema = z.object({
  items: z.array(IdeaDtoSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const ItemSummaryDtoSchema = z.object({
  id: z.string(),
  idea_id: z.string(),
  channel: ContentChannelSchema,
  status: z.string(),
  current_version_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type IdeaListQuery = z.infer<typeof IdeaListQuerySchema>;
export type IdeaCreateManualInput = z.infer<typeof IdeaCreateManualSchema>;
export type IdeaGenerateInput = z.infer<typeof IdeaGenerateSchema>;
export type IdeaCreateBody = z.infer<typeof IdeaCreateBodySchema>;
export type IdeaUpdateInput = z.infer<typeof IdeaUpdateSchema>;
export type DraftRequestInput = z.infer<typeof DraftRequestSchema>;
export type IdeaDto = z.infer<typeof IdeaDtoSchema>;
export type IdeaListResponse = z.infer<typeof IdeaListResponseSchema>;
export type ItemSummaryDto = z.infer<typeof ItemSummaryDtoSchema>;

type IdeaRow = ContentIdea & {
  pillar: Pick<ContentPillar, 'id' | 'labelEs'>;
  _count: { items: number };
};

export function toIdeaDto(row: IdeaRow): IdeaDto {
  return {
    id: row.id,
    title: row.title,
    angle: row.angle,
    pillar_id: row.pillarId,
    pillar_label: row.pillar.labelEs,
    service_line_id: row.serviceLineId,
    icp_vertical: (row.icpVertical ?? null) as IcpVertical | null,
    brief_es: row.briefEs,
    status: row.status,
    created_by_id: row.createdById,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    items_count: row._count.items,
  };
}

export const ContentVersionDtoSchema = z.object({
  id: z.string(),
  item_id: z.string(),
  version_number: z.number().int().positive(),
  title: z.string().nullable(),
  body: z.string(),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
  hashtags: z.array(z.string()),
  generated_by: z.enum(['claude', 'human', 'claude_edited_by_human']),
  edited_by_id: z.string(),
  created_at: z.string().datetime(),
});

export const ContentItemDetailDtoSchema = z.object({
  id: z.string(),
  idea_id: z.string(),
  channel: z.enum(['instagram', 'linkedin', 'newsletter']),
  status: z.enum(['draft', 'in_review', 'approved', 'exported', 'archived']),
  scheduled_for: z.string().date().nullable(),
  current_version_id: z.string().nullable(),
  current_version: ContentVersionDtoSchema.nullable(),
  versions: z.array(ContentVersionDtoSchema),
  created_by_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const CreateVersionBodySchema = z.object({
  body: z.string().trim().min(1).max(50000),
  title: z.string().trim().min(1).max(500).optional(),
  hooks: z.array(z.string().trim().min(1)).max(10).default([]),
  ctas: z.array(z.string().trim().min(1)).max(10).default([]),
  hashtags: z.array(z.string().trim().min(1)).max(30).default([]),
});

export type ContentVersionDto = z.infer<typeof ContentVersionDtoSchema>;
export type ContentItemDetailDto = z.infer<typeof ContentItemDetailDtoSchema>;
export type CreateVersionBody = z.infer<typeof CreateVersionBodySchema>;

type VersionRow = {
  id: string;
  itemId: string;
  versionNumber: number;
  title: string | null;
  body: string;
  hooks: string[];
  ctas: string[];
  hashtags: string[];
  generatedBy: 'claude' | 'human' | 'claude_edited_by_human';
  editedById: string;
  createdAt: Date;
};

export function toVersionDto(row: VersionRow): ContentVersionDto {
  return {
    id: row.id,
    item_id: row.itemId,
    version_number: row.versionNumber,
    title: row.title ?? null,
    body: row.body,
    hooks: row.hooks,
    ctas: row.ctas,
    hashtags: row.hashtags,
    generated_by: row.generatedBy,
    edited_by_id: row.editedById,
    created_at: row.createdAt.toISOString(),
  };
}
