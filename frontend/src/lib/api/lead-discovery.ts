import { apiFetch } from './client';

export interface LeadDiscoveryInput {
  city: string;
  businessType: string;
  maxResults?: number;
}

export interface LeadDiscoverySummary {
  city: string;
  businessType: string;
  found: number;
  qualified: number;
  leads_created: number;
  errors: number;
}

export async function startLeadDiscovery(input: LeadDiscoveryInput): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>('/intel/lead-discovery', {
    method: 'POST',
    json: input,
  });
}
