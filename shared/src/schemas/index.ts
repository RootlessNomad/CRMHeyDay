// Schemas Zod compartidos. Sirven como fuente de verdad de validación y tipos.
// A medida que se implementen endpoints en IT-04 en adelante, se añadirán aquí.

import { z } from 'zod';
import {
  CONTENT_CHANNELS,
  CONTENT_ITEM_STATUSES,
  CONTENT_PILLARS,
  ICP_VERTICALS,
  PAIN_POINT_CONFIDENCE,
  SERVICE_LINE_KEYS,
  USER_ROLES,
} from '../constants/index.js';

// ---------- Schemas primitivos ----------
export const cuidSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime();
export const emailSchema = z.string().email().toLowerCase();
export const urlSchema = z.string().url();

// ---------- Paginación ----------
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});
export type PaginationResponse = z.infer<typeof paginationResponseSchema>;

// ---------- Error response uniforme ----------
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ---------- Enums exportados como zod ----------
export const icpVerticalSchema = z.enum(ICP_VERTICALS);
export const serviceLineKeySchema = z.enum(SERVICE_LINE_KEYS);
export const painPointConfidenceSchema = z.enum(PAIN_POINT_CONFIDENCE);
export const contentChannelSchema = z.enum(CONTENT_CHANNELS);
export const contentPillarSchema = z.enum(CONTENT_PILLARS);
export const contentItemStatusSchema = z.enum(CONTENT_ITEM_STATUSES);
export const userRoleSchema = z.enum(USER_ROLES);
