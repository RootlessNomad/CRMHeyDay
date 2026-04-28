import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const SearchHitSchema = z.object({
  type: z.enum(['company', 'contact', 'lead', 'activity']),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  score: z.number(),
});

export const SearchResultsSchema = z.object({
  query: z.string(),
  companies: SearchHitSchema.array(),
  contacts: SearchHitSchema.array(),
  leads: SearchHitSchema.array(),
  activities: SearchHitSchema.array(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchHit = z.infer<typeof SearchHitSchema>;
export type SearchResults = z.infer<typeof SearchResultsSchema>;
