import { getAccessToken } from '../auth/store';
import { ApiError, apiFetch, type ApiErrorPayload } from './client';

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

export interface BulkImportResponse {
  batch_id: string;
  count: number;
  run_ids: string[];
  errors: Array<{ row: number; message: string }>;
}

export type PainPointConfidence = 'observed' | 'inferred' | 'speculative';

export interface PainPointDto {
  id: string;
  company_id: string;
  company_name: string;
  category_id: string;
  category_key: string;
  category_label_es: string;
  confidence: PainPointConfidence;
  evidence_text: string;
  evidence_source_url: string | null;
  evidence_timestamp: string | null;
  detected_by: string;
  human_verified: boolean;
  verified_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceFitDto {
  id: string;
  company_id: string;
  service_line_id: string;
  service_line_key: string;
  service_line_label_es: string;
  triggering_signals: string[];
  rationale_es: string;
  expected_outcome_es: string;
  fit_score: number;
  generated_by: 'rule' | 'claude' | 'human';
  created_at: string;
  updated_at: string;
}

export interface OutboundPrepDto {
  id: string;
  company_id: string;
  segment: string;
  likely_need: string;
  outreach_angle: string;
  value_proposition: string;
  service_pitch: string;
  tone_guidance: string;
  priority_score: number;
  sdr_notes: string | null;
  last_generated_at: string;
  last_generated_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListPainPointsQuery {
  company_id?: string;
  confidence?: PainPointConfidence;
  category_id?: string;
  human_verified?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListPainPointsResponse {
  data: PainPointDto[];
  total: number;
}

export interface ServiceFitResponse {
  data: ServiceFitDto[];
}

export interface RegenerateServiceFitResponse {
  data: ServiceFitDto[];
  models_used: string[];
}

function buildPainPointsSearchParams(query: ListPainPointsQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
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

export async function listPainPoints(
  query: ListPainPointsQuery = {},
): Promise<ListPainPointsResponse> {
  return apiFetch<ListPainPointsResponse>(
    `/intel/pain-points${buildPainPointsSearchParams(query)}`,
  );
}

export async function listServiceFit(companyId: string): Promise<ServiceFitResponse> {
  const params = new URLSearchParams({ company_id: companyId });
  return apiFetch<ServiceFitResponse>(`/intel/service-fit?${params.toString()}`);
}

export async function regenerateServiceFit(
  companyId: string,
): Promise<RegenerateServiceFitResponse> {
  return apiFetch<RegenerateServiceFitResponse>('/intel/service-fit/regenerate', {
    method: 'POST',
    json: { company_id: companyId },
  });
}

export async function getOutboundPrep(companyId: string): Promise<OutboundPrepDto | null> {
  const params = new URLSearchParams({ company_id: companyId });
  const response = await apiFetch<{ data: OutboundPrepDto | null }>(
    `/intel/outbound-prep?${params.toString()}`,
  );
  return response.data;
}

export async function regenerateOutboundPrep(companyId: string): Promise<OutboundPrepDto> {
  return apiFetch<OutboundPrepDto>('/intel/outbound-prep/regenerate', {
    method: 'POST',
    json: { company_id: companyId },
  });
}

export async function updateOutboundPrep(
  companyId: string,
  input: Partial<
    Omit<
      OutboundPrepDto,
      | 'id'
      | 'company_id'
      | 'created_at'
      | 'updated_at'
      | 'last_generated_at'
      | 'last_generated_by_id'
    >
  >,
): Promise<OutboundPrepDto> {
  return apiFetch<OutboundPrepDto>(`/intel/outbound-prep/${companyId}`, {
    method: 'PATCH',
    json: input,
  });
}

export async function updatePainPoint(
  id: string,
  body: Partial<Pick<PainPointDto, 'human_verified'>>,
): Promise<PainPointDto> {
  return apiFetch<PainPointDto>(`/intel/pain-points/${id}`, {
    method: 'PATCH',
    json: body,
  });
}

export async function deletePainPoint(id: string): Promise<void> {
  await apiFetch<void>(`/intel/pain-points/${id}`, { method: 'DELETE' });
}

export async function bulkImportCsv(file: File): Promise<BulkImportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const rawBase = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  const apiBase = rawBase.replace(/\/$/, '');
  const response = await fetch(`${apiBase}/intel/bulk-import`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: ApiErrorPayload };
      if (body.error?.code) throw new ApiError(response.status, body.error);
    } catch (error) {
      if (error instanceof ApiError) throw error;
    }

    throw new ApiError(response.status, {
      code: 'UNKNOWN_ERROR',
      message: `Error ${response.status}`,
    });
  }

  return response.json() as Promise<BulkImportResponse>;
}

export function isInFlight(run: { status: string }): boolean {
  return ['queued', 'running'].includes(run.status);
}
