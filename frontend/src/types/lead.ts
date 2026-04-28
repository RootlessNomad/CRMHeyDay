export type LeadSource = 'manual' | 'csv_import' | 'enrichment' | 'n8n_webhook' | 'other';
export type LeadStatus = 'open' | 'won' | 'lost';

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
  source: LeadSource;
  status: LeadStatus | 'archived';
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

export interface LeadListResponse {
  items: LeadDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LeadListQuery {
  stageId?: string;
  pipelineId?: string;
  ownerId?: string;
  status?: LeadStatus;
  priorityMin?: number;
  companyId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface LeadCreateInput {
  companyId: string;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  primaryContactId?: string;
  source?: LeadSource;
  priorityManual?: number;
  nextActionAt?: string;
}

export interface LeadUpdateInput {
  companyId?: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  primaryContactId?: string;
  source?: LeadSource;
  priorityManual?: number;
  nextActionAt?: string;
  status?: LeadStatus;
  lostReason?: string;
}
