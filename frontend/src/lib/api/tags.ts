import { ApiError, apiFetch } from './client';
import type {
  TagAssignInput,
  TagCreateInput,
  TagDto,
  TagListQuery,
  TagUpdateInput,
  TaggableEntityType,
} from '@/types/tag';

function buildSearchParams(query: TagListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listTags(query: TagListQuery = {}): Promise<TagDto[]> {
  return apiFetch<TagDto[]>(`/tags${buildSearchParams(query)}`);
}

export async function createTag(input: TagCreateInput): Promise<TagDto> {
  return apiFetch<TagDto>('/tags', { method: 'POST', json: input });
}

export async function getTag(id: string): Promise<TagDto> {
  return apiFetch<TagDto>(`/tags/${id}`);
}

export async function updateTag(id: string, patch: TagUpdateInput): Promise<TagDto> {
  return apiFetch<TagDto>(`/tags/${id}`, { method: 'PATCH', json: patch });
}

export async function deleteTag(id: string): Promise<void> {
  await apiFetch<void>(`/tags/${id}`, { method: 'DELETE' });
}

export async function assignTag(input: TagAssignInput): Promise<TagDto> {
  return apiFetch<TagDto>('/tags/assign', { method: 'POST', json: input });
}

export async function unassignTag(input: TagAssignInput): Promise<void> {
  await apiFetch<void>('/tags/unassign', { method: 'POST', json: input });
}

export async function listTagsForEntity(
  entityType: TaggableEntityType,
  entityId: string,
): Promise<TagDto[]> {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: entityId,
  });

  return apiFetch<TagDto[]>(`/tags/by-entity?${params.toString()}`);
}

export function isTagNameConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'VALIDATION_ERROR' &&
    error.message.startsWith('Ya existe una tag')
  );
}

export function isTagAssignmentConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'VALIDATION_ERROR' &&
    error.message.includes('ya está asignada')
  );
}
