import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import type { DashboardMetricsDto, TopLeadDto, UpcomingActionDto } from './schemas.js';

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function toUpcomingActionDto(row: {
  id: string;
  title: string | null;
  kind: string;
  dueAt: Date;
  entityType: string;
  entityId: string;
}): UpcomingActionDto {
  return {
    id: row.id,
    title: row.title ?? null,
    kind: row.kind,
    due_at: row.dueAt.toISOString(),
    entity_type: row.entityType,
    entity_id: row.entityId,
  };
}

function toTopLeadDto(row: {
  id: string;
  title: string;
  priorityScore: number;
  stage: { name: string } | null;
}): TopLeadDto {
  return {
    id: row.id,
    title: row.title,
    priority_score: row.priorityScore,
    stage_name: row.stage?.name ?? null,
  };
}

export class DashboardService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async metrics(userId: string): Promise<DashboardMetricsDto> {
    void userId;

    const [leadsOpen, leadsStale, jobsRunning, aiCostMonth] = await this.db.$transaction([
      this.db.lead.count({ where: { status: 'open', deletedAt: null } }),
      this.db.lead.count({
        where: {
          status: 'open',
          deletedAt: null,
          updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.db.job.count({ where: { status: { in: ['running', 'queued'] } } }),
      this.db.aiUsageLog.aggregate({
        _sum: { estimatedCostUsd: true },
        where: { createdAt: { gte: startOfCurrentMonth() } },
      }),
    ]);

    return {
      leads_open: leadsOpen,
      leads_stale: leadsStale,
      approvals_pending: 0,
      jobs_running: jobsRunning,
      ai_cost_month_usd: Number(aiCostMonth._sum.estimatedCostUsd ?? 0),
    };
  }

  async upcomingActions(userId: string): Promise<UpcomingActionDto[]> {
    const rows = await this.db.activity.findMany({
      where: {
        ownerId: userId,
        dueAt: { gte: new Date() },
        completedAt: null,
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    });

    return rows
      .filter((row): row is typeof row & { dueAt: Date } => row.dueAt instanceof Date)
      .map(toUpcomingActionDto);
  }

  async topPriorityLeads(): Promise<TopLeadDto[]> {
    const rows = await this.db.lead.findMany({
      where: { status: 'open', deletedAt: null },
      orderBy: { priorityScore: 'desc' },
      take: 5,
      include: {
        stage: { select: { name: true } },
        company: { select: { name: true } },
      },
    });

    return rows.map((row) =>
      toTopLeadDto({
        id: row.id,
        title: row.company.name,
        priorityScore: row.priorityScore,
        stage: row.stage,
      }),
    );
  }
}
