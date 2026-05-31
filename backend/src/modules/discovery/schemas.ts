import { type IcpVertical } from '@heyday/shared';
import { z } from 'zod';

// Request del endpoint POST /discovery/bulk-search. `maxResults` opcional
// (default lo aplica el payload de la cola, máx 60).
export const BulkDiscoveryRequestSchema = z.object({
  city: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(1).max(120),
  triggerEnrichment: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(60).optional(),
});

export type BulkDiscoveryRequest = z.infer<typeof BulkDiscoveryRequestSchema>;

export interface BulkDiscoverySummary extends Record<string, unknown> {
  city: string;
  businessType: string;
  vertical: IcpVertical;
  found: number;
  created: number;
  duplicated: number;
  enriched: number;
  errors: number;
}

// Mapea el tipo de negocio libre que escribe el usuario a un IcpVertical del enum.
// Por palabras clave; default `other` (ej. clínicas, hasta que exista vertical propio).
export function mapBusinessTypeToVertical(businessType: string): IcpVertical {
  const text = businessType.toLowerCase();
  if (/\b(gimnasio|gym|fitness|crossfit|box)\b/.test(text)) return 'gym_fitness';
  if (/\b(fisio|physio|fisioterapia)\b/.test(text)) return 'physiotherapy';
  if (/\bpilates\b/.test(text)) return 'pilates';
  if (/\byoga\b/.test(text)) return 'yoga';
  if (/\b(panader|bakery|horno)\b/.test(text)) return 'bakery';
  if (/\b(cafe|cafeter|coffee)\b/.test(text)) return 'cafe';
  return 'other';
}
