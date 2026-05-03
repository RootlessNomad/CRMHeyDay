import { apiFetch } from './client';

export interface JobDto {
  id: string;
  queue: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial' | string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  result: unknown;
  payload: unknown;
}

export async function getJob(jobId: string): Promise<JobDto> {
  const response = await apiFetch<{ job: JobDto }>(`/jobs/${jobId}`);
  return response.job;
}

export function isJobInFlight(job: { status: string }): boolean {
  return job.status === 'queued' || job.status === 'running';
}
