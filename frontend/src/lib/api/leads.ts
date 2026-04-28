import { apiFetch } from './client';
import type {
  LeadCreateInput,
  LeadDto,
  LeadListQuery,
  LeadListResponse,
  LeadUpdateInput,
} from '../../types/lead';

function buildSearchParams(query: LeadListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listLeads(query: LeadListQuery = {}): Promise<LeadListResponse> {
  return apiFetch<LeadListResponse>(`/leads${buildSearchParams(query)}`);
}

export async function getLead(id: string): Promise<LeadDto> {
  return apiFetch<LeadDto>(`/leads/${id}`);
}

export async function createLead(input: LeadCreateInput): Promise<LeadDto> {
  return apiFetch<LeadDto>('/leads', { method: 'POST', json: input });
}

export async function updateLead(id: string, patch: LeadUpdateInput): Promise<LeadDto> {
  return apiFetch<LeadDto>(`/leads/${id}`, { method: 'PATCH', json: patch });
}

export async function markWonLead(id: string): Promise<LeadDto> {
  return apiFetch<LeadDto>(`/leads/${id}/won`, { method: 'POST' });
}

export async function markLostLead(id: string, lostReason: string): Promise<LeadDto> {
  return apiFetch<LeadDto>(`/leads/${id}/lost`, {
    method: 'POST',
    json: { lostReason },
  });
}

export async function deleteLead(id: string): Promise<void> {
  await apiFetch<void>(`/leads/${id}`, { method: 'DELETE' });
}
