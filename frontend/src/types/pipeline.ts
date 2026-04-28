export interface PipelineStageDto {
  id: string;
  pipelineId: string;
  name: string;
  orderIndex: number;
  kind: 'open' | 'won' | 'lost';
  color: string | null;
}

export interface PipelineDto {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stages: PipelineStageDto[];
}
