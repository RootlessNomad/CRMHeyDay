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

export class PipelineNotFoundError extends Error {
  constructor(id: string) {
    super(`Pipeline "${id}" no encontrado`);
    this.name = 'PipelineNotFoundError';
  }
}

export class StageNotFoundError extends Error {
  constructor(id: string) {
    super(`Stage "${id}" no encontrado`);
    this.name = 'StageNotFoundError';
  }
}

export class StageHasLeadsError extends Error {
  constructor(id: string) {
    super(`No se puede eliminar el stage "${id}" porque tiene leads activos`);
    this.name = 'StageHasLeadsError';
  }
}

export class InvalidStageOrderError extends Error {
  constructor(orderIndex: number) {
    super(`orderIndex inválido: ${orderIndex}`);
    this.name = 'InvalidStageOrderError';
  }
}

export class InvalidStageKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStageKindError';
  }
}
