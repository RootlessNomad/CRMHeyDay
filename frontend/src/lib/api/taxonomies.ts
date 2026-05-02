import { apiFetch } from './client';

export interface PainPointCategoryDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  defaultServiceRecommendations: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceLineDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  subCapabilities: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPillarDto {
  id: string;
  key: string;
  labelEs: string;
  descriptionEs: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxonomyInput {
  key: string;
  labelEs: string;
  descriptionEs: string;
}

export interface UpdateTaxonomyInput {
  labelEs?: string;
  descriptionEs?: string;
  isActive?: boolean;
}

// PainPointCategory
export async function listPainPointCategories(): Promise<PainPointCategoryDto[]> {
  return apiFetch<PainPointCategoryDto[]>('/intel/taxonomies/pain-points');
}

export async function createPainPointCategory(
  input: CreateTaxonomyInput,
): Promise<PainPointCategoryDto> {
  return apiFetch<PainPointCategoryDto>('/intel/taxonomies/pain-points', {
    method: 'POST',
    json: input,
  });
}

export async function updatePainPointCategory(
  id: string,
  input: UpdateTaxonomyInput,
): Promise<PainPointCategoryDto> {
  return apiFetch<PainPointCategoryDto>(`/intel/taxonomies/pain-points/${id}`, {
    method: 'PATCH',
    json: input,
  });
}

// ServiceLine
export async function listServiceLines(): Promise<ServiceLineDto[]> {
  return apiFetch<ServiceLineDto[]>('/intel/service-lines');
}

export async function createServiceLine(input: CreateTaxonomyInput): Promise<ServiceLineDto> {
  return apiFetch<ServiceLineDto>('/intel/service-lines', { method: 'POST', json: input });
}

export async function updateServiceLine(
  id: string,
  input: UpdateTaxonomyInput,
): Promise<ServiceLineDto> {
  return apiFetch<ServiceLineDto>(`/intel/service-lines/${id}`, { method: 'PATCH', json: input });
}

// ContentPillar
export async function listContentPillars(): Promise<ContentPillarDto[]> {
  return apiFetch<ContentPillarDto[]>('/content/pillars');
}

export async function createContentPillar(input: CreateTaxonomyInput): Promise<ContentPillarDto> {
  return apiFetch<ContentPillarDto>('/content/pillars', { method: 'POST', json: input });
}

export async function updateContentPillar(
  id: string,
  input: UpdateTaxonomyInput,
): Promise<ContentPillarDto> {
  return apiFetch<ContentPillarDto>(`/content/pillars/${id}`, { method: 'PATCH', json: input });
}
