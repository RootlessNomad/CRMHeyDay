import { getAccessToken } from '../auth/store';
import { ApiError, type ApiErrorPayload } from './client';

const RAW_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const API_BASE = RAW_BASE.replace(/\/$/, '');

export interface ImportResultDto {
  rows_total: number;
  rows_created: number;
  rows_skipped_duplicate: number;
  rows_failed: number;
  errors: ImportRowError[];
  dry_run: boolean;
}

export interface ImportRowError {
  row: number;
  code: 'validation' | 'duplicate_in_csv' | 'duplicate_in_db';
  field?: string;
  message: string;
  existing_id?: string;
}

export async function importCompaniesCsv(file: File, dryRun: boolean): Promise<ImportResultDto> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}/companies/import-csv${dryRun ? '?dry_run=true' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    try {
      const body = (await res.json()) as { error?: ApiErrorPayload };
      if (body.error?.code) throw new ApiError(res.status, body.error);
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }
    throw new ApiError(res.status, { code: 'UNKNOWN_ERROR', message: `Error ${res.status}` });
  }

  return res.json() as Promise<ImportResultDto>;
}

export function isImportCapError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'too_many_rows';
}

export function isImportHeaderError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'missing_required_headers';
}
