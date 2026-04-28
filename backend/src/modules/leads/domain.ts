export interface LeadCompanySummaryDto {
  id: string;
  name: string;
  websiteDomain: string | null;
}

export interface LeadContactSummaryDto {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
}

export interface LeadOwnerSummaryDto {
  id: string;
  name: string;
  email: string;
}

export interface LeadStageSummaryDto {
  id: string;
  name: string;
  kind: 'open' | 'won' | 'lost';
  color: string | null;
  orderIndex: number;
}

export interface LeadPipelineSummaryDto {
  id: string;
  name: string;
}

export interface LeadDto {
  id: string;
  companyId: string;
  primaryContactId: string | null;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  source: 'manual' | 'csv_import' | 'enrichment' | 'n8n_webhook' | 'other';
  status: 'open' | 'won' | 'lost' | 'archived';
  priorityScore: number;
  priorityManual: number | null;
  nextActionAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: LeadCompanySummaryDto;
  primaryContact?: LeadContactSummaryDto | null;
  owner?: LeadOwnerSummaryDto;
  stage?: LeadStageSummaryDto;
  pipeline?: LeadPipelineSummaryDto;
}

export class LeadNotFoundError extends Error {
  constructor(id: string) {
    super(`Lead "${id}" no encontrado`);
    this.name = 'LeadNotFoundError';
  }
}

export class LeadCompanyMismatchError extends Error {
  constructor(contactId: string, companyId: string) {
    super(`El contacto "${contactId}" no pertenece a la empresa "${companyId}"`);
    this.name = 'LeadCompanyMismatchError';
  }
}

export class StageNotInPipelineError extends Error {
  constructor(stageId: string, pipelineId: string) {
    super(`El stage "${stageId}" no pertenece al pipeline "${pipelineId}"`);
    this.name = 'StageNotInPipelineError';
  }
}

export class InvalidLeadTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLeadTransitionError';
  }
}
