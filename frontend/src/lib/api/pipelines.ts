import { apiFetch } from './client';
import type { PipelineDto } from '../../types/pipeline';

export async function listPipelines(): Promise<PipelineDto[]> {
  return apiFetch<PipelineDto[]>('/pipelines');
}
