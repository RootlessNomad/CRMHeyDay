import { z } from 'zod';

import { CompanyCreateSchema } from '../companies/schemas.js';
import type { RowError } from './domain.js';

const baseShape = CompanyCreateSchema.shape;

function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const CsvRowSchema = z.object({
  name: baseShape.name,
  website: z.preprocess(emptyToUndefined, baseShape.website),
  domain: z.preprocess(emptyToUndefined, baseShape.domain),
  industry: z.preprocess(emptyToUndefined, baseShape.industry),
  icp_vertical: z.preprocess(emptyToUndefined, baseShape.icp_vertical),
  country: z.preprocess(emptyToUndefined, baseShape.country),
  region: z.preprocess(emptyToUndefined, baseShape.region),
  city: z.preprocess(emptyToUndefined, baseShape.city),
  postal_code: z.preprocess(emptyToUndefined, baseShape.postal_code),
  address: z.preprocess(emptyToUndefined, baseShape.address),
  size_signal: z.preprocess(emptyToUndefined, baseShape.size_signal),
  phone: z.preprocess(emptyToUndefined, baseShape.phone),
  email: z.preprocess(emptyToUndefined, baseShape.email),
  whatsapp: z.preprocess(emptyToUndefined, baseShape.whatsapp),
  linkedin_url: z.preprocess(emptyToUndefined, baseShape.linkedin_url),
  instagram_handle: z.preprocess(emptyToUndefined, baseShape.instagram_handle),
  notes: z.preprocess(emptyToUndefined, baseShape.notes),
});

export interface ImportResultDto {
  rows_total: number;
  rows_created: number;
  rows_skipped_duplicate: number;
  rows_failed: number;
  errors: RowError[];
  dry_run: boolean;
}
