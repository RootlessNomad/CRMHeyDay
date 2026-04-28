import { PAGINATION } from '@heyday/shared';
import { z } from 'zod';

export const ConsentStatusSchema = z.enum([
  'unknown',
  'public_business_data_only',
  'explicit_granted',
  'revoked',
]);

const nullableEmailSchema = z.string().email().max(254).nullable();
const nullableUrlSchema = z.string().url().nullable();

const contactWritableFields = {
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).nullable().optional(),
  role_title: z.string().max(150).nullable().optional(),
  email: nullableEmailSchema.optional(),
  phone: z.string().max(50).nullable().optional(),
  whatsapp: z.string().max(50).nullable().optional(),
  linkedin_url: nullableUrlSchema.optional(),
  company_id: z.string().nullable().optional(),
  is_primary: z.boolean(),
  consent_status: ConsentStatusSchema,
};

export const ContactCreateSchema = z.object({
  ...contactWritableFields,
  is_primary: z.boolean().default(false),
  consent_status: ConsentStatusSchema.default('public_business_data_only'),
});

export const ContactUpdateSchema = z.object({
  first_name: contactWritableFields.first_name.optional(),
  last_name: contactWritableFields.last_name,
  role_title: contactWritableFields.role_title,
  email: contactWritableFields.email,
  phone: contactWritableFields.phone,
  whatsapp: contactWritableFields.whatsapp,
  linkedin_url: contactWritableFields.linkedin_url,
  company_id: contactWritableFields.company_id,
  is_primary: contactWritableFields.is_primary.optional(),
  consent_status: contactWritableFields.consent_status.optional(),
});

export const ContactListQuerySchema = z.object({
  q: z.string().min(1).optional(),
  company_id: z.string().min(1).optional(),
  is_primary: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxLimit)
    .default(PAGINATION.defaultLimit),
  sort: z.literal('updated_at_desc').default('updated_at_desc'),
});

export const ContactDtoSchema = z.object({
  id: z.string(),
  company_id: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string().nullable(),
  role_title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  is_primary: z.boolean(),
  consent_status: ConsentStatusSchema,
  created_by_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  anonymized_at: z.string().datetime().nullable(),
});

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;
export type ContactListQuery = z.infer<typeof ContactListQuerySchema>;
export type ContactDto = z.infer<typeof ContactDtoSchema>;
