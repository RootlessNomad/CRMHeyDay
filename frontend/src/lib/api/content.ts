import { ApiError, apiFetch } from './client';

export const VERTICAL_LABELS: Record<string, string> = {
  physiotherapy: 'Fisioterapia',
  pilates: 'Pilates',
  yoga: 'Yoga',
  gym_fitness: 'Gym & Fitness',
  bakery: 'Panadería',
  cafe: 'Cafetería',
  other: 'Otro',
};

export const IDEA_STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  in_production: 'En producción',
  shipped: 'Publicado',
  archived: 'Archivado',
};

export const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  newsletter: 'Newsletter',
};

export interface PillarDto {
  id: string;
  key: string;
  label_es: string;
  description_es: string;
  is_active: boolean;
}

export interface IdeaDto {
  id: string;
  title: string;
  angle: string;
  pillar_id: string;
  pillar_label: string;
  service_line_id: string | null;
  icp_vertical: string | null;
  brief_es: string;
  status: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  items_count: number;
}

export interface IdeaListResponse {
  items: IdeaDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface IdeaListQuery {
  status?: string;
  pillar_id?: string;
  vertical?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ItemSummaryDto {
  id: string;
  channel: string;
  status: string;
}

export interface IdeaCreateManualInput {
  title: string;
  angle: string;
  pillar_id: string;
  brief_es: string;
  service_line_id?: string;
  icp_vertical?: string;
}

export interface IdeaGenerateInput {
  generate: true;
  pillar_id: string;
  brief_es: string;
  service_line_id?: string;
  icp_vertical?: string;
  count?: number;
}

export interface IdeaUpdateInput {
  title?: string;
  angle?: string;
  brief_es?: string;
  status?: string;
}

export interface DraftRequestInput {
  channels?: string[];
}

function buildQueryString(query: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listIdeas(query: IdeaListQuery): Promise<IdeaListResponse> {
  return apiFetch<IdeaListResponse>(`/content/ideas${buildQueryString(query)}`);
}

export async function createIdeaManual(input: IdeaCreateManualInput): Promise<IdeaDto> {
  return apiFetch<IdeaDto>('/content/ideas', {
    method: 'POST',
    json: input,
  });
}

export async function generateIdeas(input: IdeaGenerateInput): Promise<{ job_id: string }> {
  return apiFetch<{ job_id: string }>('/content/ideas', {
    method: 'POST',
    json: input,
  });
}

export async function getIdea(id: string): Promise<IdeaDto> {
  return apiFetch<IdeaDto>(`/content/ideas/${id}`);
}

export async function updateIdea(id: string, input: IdeaUpdateInput): Promise<IdeaDto> {
  return apiFetch<IdeaDto>(`/content/ideas/${id}`, {
    method: 'PATCH',
    json: input,
  });
}

export async function deleteIdea(id: string): Promise<void> {
  await apiFetch<void>(`/content/ideas/${id}`, {
    method: 'DELETE',
  });
}

export async function requestDrafts(
  id: string,
  channels?: string[],
): Promise<{ items: ItemSummaryDto[]; job_ids: string[] }> {
  const body: DraftRequestInput = {};
  if (channels && channels.length > 0) {
    body.channels = channels;
  }

  return apiFetch<{ items: ItemSummaryDto[]; job_ids: string[] }>(`/content/ideas/${id}/draft`, {
    method: 'POST',
    json: body,
  });
}

export async function getPillars(): Promise<PillarDto[]> {
  return apiFetch<PillarDto[]>('/content/pillars');
}

export function isContentDailyLimit(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.code === 'CONTENT_DAILY_LIMIT' || error.status === 429)
  );
}

export interface ContentVersionDto {
  id: string;
  item_id: string;
  version_number: number;
  title: string | null;
  body: string;
  hooks: string[];
  ctas: string[];
  hashtags: string[];
  generated_by: 'claude' | 'human' | 'claude_edited_by_human';
  edited_by_id: string;
  created_at: string;
}

export interface ContentItemDetailDto {
  id: string;
  idea_id: string;
  channel: 'instagram' | 'linkedin' | 'newsletter';
  status: 'draft' | 'in_review' | 'approved' | 'exported' | 'archived';
  scheduled_for: string | null;
  current_version_id: string | null;
  current_version: ContentVersionDto | null;
  versions: ContentVersionDto[];
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVersionInput {
  body: string;
  title?: string;
  hooks?: string[];
  ctas?: string[];
  hashtags?: string[];
}

export async function getContentItem(id: string): Promise<ContentItemDetailDto> {
  return apiFetch<ContentItemDetailDto>(`/content/items/${id}`);
}

export async function createVersion(
  itemId: string,
  input: CreateVersionInput,
): Promise<ContentVersionDto> {
  return apiFetch<ContentVersionDto>(`/content/items/${itemId}/versions`, {
    method: 'POST',
    json: input,
  });
}

export const ITEM_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobado',
  exported: 'Exportado',
  archived: 'Archivado',
};

export const GENERATED_BY_LABELS: Record<string, string> = {
  claude: 'Claude',
  human: 'Humano',
  claude_edited_by_human: 'Claude (editado)',
};
