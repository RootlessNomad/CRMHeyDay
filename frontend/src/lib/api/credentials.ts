import { apiFetch } from './client';

export type CredentialHealthStatus = 'ok' | 'warn' | 'error' | 'unknown';

export interface CredentialHealthDto {
  lastStatus: CredentialHealthStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  successCount24h: number;
  errorCount24h: number;
}

export interface CredentialDto {
  id: string;
  key: string;
  provider: string;
  label: string;
  keyVersion: number;
  isActive: boolean;
  lastUsedAt: string | null;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  health: CredentialHealthDto | null;
}

export interface CreateCredentialInput {
  key: string;
  provider: string;
  label: string;
  plaintext: string;
}

export interface RotateCredentialInput {
  newPlaintext: string;
}

export async function listCredentials(): Promise<CredentialDto[]> {
  return apiFetch<CredentialDto[]>('/admin/credentials');
}

export async function createCredential(input: CreateCredentialInput): Promise<CredentialDto> {
  return apiFetch<CredentialDto>('/admin/credentials', { method: 'POST', json: input });
}

export async function rotateCredential(
  id: string,
  input: RotateCredentialInput,
): Promise<CredentialDto> {
  return apiFetch<CredentialDto>(`/admin/credentials/${id}/rotate`, {
    method: 'POST',
    json: input,
  });
}

export async function setCredentialActive(id: string, isActive: boolean): Promise<CredentialDto> {
  return apiFetch<CredentialDto>(`/admin/credentials/${id}/active`, {
    method: 'PATCH',
    json: { isActive },
  });
}

export async function deleteCredential(id: string): Promise<void> {
  await apiFetch<void>(`/admin/credentials/${id}`, { method: 'DELETE' });
}

export async function testCredential(id: string): Promise<{ jobId: string }> {
  return apiFetch<{ jobId: string }>(`/admin/credentials/${id}/test`, { method: 'POST' });
}
