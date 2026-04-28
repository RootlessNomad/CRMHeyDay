import { ApiError, apiFetch } from './client';
import type {
  CompanyCreateInput,
  CompanyDto,
  CompanyListQuery,
  CompanyListResponse,
  CompanyUpdateInput,
} from '@/types/company';

interface CompanyDomainConflictDetails {
  existing_id: string;
}

function buildSearchParams(query: CompanyListQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listCompanies(query: CompanyListQuery = {}): Promise<CompanyListResponse> {
  return apiFetch<CompanyListResponse>(`/companies${buildSearchParams(query)}`);
}

export async function getCompany(id: string): Promise<CompanyDto> {
  return apiFetch<CompanyDto>(`/companies/${id}`);
}

export async function createCompany(input: CompanyCreateInput): Promise<CompanyDto> {
  return apiFetch<CompanyDto>('/companies', { method: 'POST', json: input });
}

export async function updateCompany(id: string, patch: CompanyUpdateInput): Promise<CompanyDto> {
  return apiFetch<CompanyDto>(`/companies/${id}`, { method: 'PATCH', json: patch });
}

export async function deleteCompany(id: string): Promise<void> {
  await apiFetch<void>(`/companies/${id}`, { method: 'DELETE' });
}

export function isCompanyDomainConflict(
  err: unknown,
): err is ApiError & { details: CompanyDomainConflictDetails } {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 409) return false;

  const details = err.details;
  if (!details || typeof details !== 'object') return false;

  return (
    err.code === 'COMPANY_DOMAIN_CONFLICT' &&
    'existing_id' in details &&
    typeof (details as CompanyDomainConflictDetails).existing_id === 'string'
  );
}
