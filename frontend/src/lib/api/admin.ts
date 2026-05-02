import { apiFetch } from './client';

export interface AiUsageByFeatureDto {
  feature: string;
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiUsageByModelDto {
  model: string;
  costUsd: number;
  calls: number;
}

export interface AiUsageByDayDto {
  date: string;
  costUsd: number;
  calls: number;
}

export interface AiUsageSummaryDto {
  periodDays: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byFeature: AiUsageByFeatureDto[];
  byModel: AiUsageByModelDto[];
  byDay: AiUsageByDayDto[];
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogPaginatedResult {
  items: AuditLogDto[];
  total: number;
  page: number;
  limit: number;
}

export interface IntegrationHealthSnapshotDto {
  credentialId: string;
  key: string;
  provider: string;
  label: string;
  isActive: boolean;
  lastStatus: 'ok' | 'warn' | 'error' | 'unknown';
  lastCheckedAt: string | null;
  lastError: string | null;
  successCount24h: number;
  errorCount24h: number;
}

export interface GetAuditLogParams {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function withQuery(
  path: string,
  params: Record<string, string | number | undefined> | GetAuditLogParams,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export async function getAiUsage(days = 30): Promise<AiUsageSummaryDto> {
  return apiFetch<AiUsageSummaryDto>(withQuery('/admin/ai-usage', { days }));
}

export async function getAuditLog(params: GetAuditLogParams): Promise<AuditLogPaginatedResult> {
  return apiFetch<AuditLogPaginatedResult>(withQuery('/admin/audit-log', params));
}

export async function getIntegrationHealth(): Promise<IntegrationHealthSnapshotDto[]> {
  return apiFetch<IntegrationHealthSnapshotDto[]>('/admin/integration-health');
}
