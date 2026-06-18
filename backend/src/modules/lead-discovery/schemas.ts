import type { IcpVertical } from '@heyday/shared';
import { z } from 'zod';

export const LeadDiscoveryRequestSchema = z.object({
  city: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(1).max(120),
  maxResults: z.number().int().min(1).max(60).optional(),
});
export type LeadDiscoveryRequest = z.infer<typeof LeadDiscoveryRequestSchema>;

export interface LeadDiscoverySummary extends Record<string, unknown> {
  city: string;
  businessType: string;
  found: number;
  qualified: number;
  leads_created: number;
  errors: number;
}

export function mapBusinessTypeToVertical(businessType: string): IcpVertical {
  const text = businessType.toLowerCase();
  if (/\b(gimnasio|gym|fitness|crossfit|box)\b/.test(text)) return 'gym_fitness';
  if (/\b(fisio|physio|fisioterapia|rehab|rehabilitaci[oó]n|cl[ií]nica)\b/.test(text)) {
    return 'physiotherapy';
  }
  if (/\b(pilates)\b/.test(text)) return 'pilates';
  if (/\b(yoga)\b/.test(text)) return 'yoga';
  if (/\b(wellness|bienestar|spa|massage|masaje)\b/.test(text)) return 'other';
  if (/\b(panader|bakery|horno)\b/.test(text)) return 'bakery';
  if (/\b(cafe|cafeter|coffee)\b/.test(text)) return 'cafe';
  return 'other';
}
