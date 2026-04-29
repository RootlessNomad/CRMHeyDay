import { apiFetch } from './client';

export interface DashboardMetricsDto {
  leads_open: number;
  leads_stale: number;
  approvals_pending: number;
  jobs_running: number;
  ai_cost_month_usd: number;
}

export interface UpcomingActionDto {
  id: string;
  title: string | null;
  kind: string;
  due_at: string;
  entity_type: string;
  entity_id: string;
}

export interface TopLeadDto {
  id: string;
  title: string;
  priority_score: number;
  stage_name: string | null;
}

export async function getDashboardMetrics(): Promise<DashboardMetricsDto> {
  return apiFetch<DashboardMetricsDto>('/dashboard/metrics');
}

export async function getUpcomingActions(): Promise<UpcomingActionDto[]> {
  return apiFetch<UpcomingActionDto[]>('/dashboard/upcoming-actions');
}

export async function getTopPriorityLeads(): Promise<TopLeadDto[]> {
  return apiFetch<TopLeadDto[]>('/dashboard/top-priority-leads');
}
