import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const stageOrderSchema = z.number().int();

export const createPipelineSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updatePipelineSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['open', 'won', 'lost']),
  color: hexColorSchema.optional(),
  orderIndex: stageOrderSchema.optional(),
});

export const updateStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: hexColorSchema.optional(),
  orderIndex: stageOrderSchema.optional(),
});

export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;
export type CreateStageInput = z.infer<typeof createStageSchema>;
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
