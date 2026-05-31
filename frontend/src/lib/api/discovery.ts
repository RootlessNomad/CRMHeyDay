import { apiFetch } from './client';

export interface BulkDiscoveryInput {
  city: string;
  businessType: string;
  triggerEnrichment: boolean;
  maxResults?: number;
}

export interface BulkDiscoverySummary {
  city: string;
  businessType: string;
  vertical: string;
  found: number;
  created: number;
  duplicated: number;
  enriched: number;
  errors: number;
}

/** Lanza un descubrimiento en masa (Google Places). Devuelve el jobId para seguimiento. */
export async function bulkDiscoverySearch(input: BulkDiscoveryInput): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>('/discovery/bulk-search', {
    method: 'POST',
    json: input,
  });
}
