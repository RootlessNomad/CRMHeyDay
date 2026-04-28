import { apiFetch } from './client';
import type {
  ActivityCreateInput,
  ActivityDto,
  ActivityListQuery,
  ActivityListResponse,
  ActivityUpdateInput,
} from '@/types/activity';

function buildSearchParams(query: ActivityListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listActivities(query: ActivityListQuery = {}): Promise<ActivityListResponse> {
  return apiFetch<ActivityListResponse>(`/activities${buildSearchParams(query)}`);
}

export async function getActivity(id: string): Promise<ActivityDto> {
  return apiFetch<ActivityDto>(`/activities/${id}`);
}

export async function createActivity(input: ActivityCreateInput): Promise<ActivityDto> {
  return apiFetch<ActivityDto>('/activities', { method: 'POST', json: input });
}

export async function updateActivity(id: string, patch: ActivityUpdateInput): Promise<ActivityDto> {
  return apiFetch<ActivityDto>(`/activities/${id}`, { method: 'PATCH', json: patch });
}

export async function deleteActivity(id: string): Promise<void> {
  await apiFetch<void>(`/activities/${id}`, { method: 'DELETE' });
}
