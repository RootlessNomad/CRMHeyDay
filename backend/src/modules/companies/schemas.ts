import { ICP_VERTICALS, PAGINATION } from '@heyday/shared';
import { z } from 'zod';

export const IcpVerticalSchema = z.enum(ICP_VERTICALS);
export const SizeSignalSchema = z.enum([
  'solo',
  'micro_1_5',
  'small_6_25',
  'mid_26_100',
  'unknown',
]);

const nullableUrlSchema = z.string().url().nullable();
const nullableEmailSchema = z.string().email().max(254).nullable();

const companyWritableFields = {
  name: z.string().min(1).max(200),
  website: nullableUrlSchema.optional(),
  domain: z.string().max(253).nullable().optional(),
  industry: z.string().max(100).nullable().optional(),
  icp_vertical: IcpVerticalSchema.nullable().optional(),
  country: z.string().length(2).default('ES'),
  region: z.string().max(100).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  size_signal: SizeSignalSchema.nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: nullableEmailSchema.optional(),
  whatsapp: z.string().max(50).nullable().optional(),
  linkedin_url: nullableUrlSchema.optional(),
  instagram_handle: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  demo_link: nullableUrlSchema.optional(),
};

export const CompanyCreateSchema = z.object(companyWritableFields);

export const CompanyUpdateSchema = z.object({
  ...companyWritableFields,
  name: companyWritableFields.name.optional(),
  country: z.string().length(2).optional(),
});

export const CompanyListQuerySchema = z.object({
  q: z.string().min(1).optional(),
  icp_vertical: IcpVerticalSchema.optional(),
  city: z.string().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.maxLimit)
    .default(PAGINATION.defaultLimit),
  sort: z.literal('updated_at_desc').default('updated_at_desc'),
});

export const CompanyDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string().nullable(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  icp_vertical: IcpVerticalSchema.nullable(),
  country: z.string(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  address: z.string().nullable(),
  size_signal: SizeSignalSchema.nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  whatsapp: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  instagram_handle: z.string().nullable(),
  notes: z.string().nullable(),
  demo_link: z.string().nullable(),
  created_by_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CompanyCreateInput = z.infer<typeof CompanyCreateSchema>;
export type CompanyUpdateInput = z.infer<typeof CompanyUpdateSchema>;
export type CompanyListQuery = z.infer<typeof CompanyListQuerySchema>;
export type CompanyDto = z.infer<typeof CompanyDtoSchema>;
