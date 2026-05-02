import { apiFetch } from './client';

export interface EnrichmentRunDto {
  id: string;
  status: 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';
  input_url: string | null;
  company_id: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  summary: Record<string, unknown>;
  source_hits: Array<{
    id: string;
    source_type: string;
    source_url: string;
    status: string;
    fetched_at: string | null;
    error: string | null;
  }>;
  pain_points_created_count: number;
  service_fits_created_count: number;
}

export interface EnrichmentRunSummaryDto {
  id: string;
  status: 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';
  input_url: string | null;
  company_id: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  summary: Record<string, unknown>;
  created_at: string;
}

export interface CreateEnrichmentRunResponse {
  job_id: string;
  run_id: string;
  company_id: string;
  status: string;
}

export async function createEnrichmentRun(body: {
  company_id?: string;
  input_url?: string;
}): Promise<CreateEnrichmentRunResponse> {
  return apiFetch<CreateEnrichmentRunResponse>('/intel/enrichment-runs', {
    method: 'POST',
    json: body,
  });
}

export async function getEnrichmentRun(id: string): Promise<EnrichmentRunDto> {
  return apiFetch<EnrichmentRunDto>(`/intel/enrichment-runs/${id}`);
}

export async function listEnrichmentRunsByCompany(
  companyId: string,
): Promise<EnrichmentRunSummaryDto[]> {
  return apiFetch<EnrichmentRunSummaryDto[]>(`/intel/companies/${companyId}/enrichment`);
}

export function isInFlight(run: { status: string }): boolean {
  return ['queued', 'running'].includes(run.status);
}
