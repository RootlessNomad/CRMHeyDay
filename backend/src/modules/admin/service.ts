import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';

export interface AiUsageSummaryDto {
  periodDays: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byFeature: {
    feature: string;
    costUsd: number;
    calls: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  byModel: {
    model: string;
    costUsd: number;
    calls: number;
  }[];
  byDay: {
    date: string;
    costUsd: number;
    calls: number;
  }[];
}

export interface IntegrationHealthSnapshotDto {
  credentialId: string;
  key: string;
  provider: string;
  label: string;
  isActive: boolean;
  lastStatus: string;
  lastCheckedAt: Date | null;
  lastError: string | null;
  successCount24h: number;
  errorCount24h: number;
}

export class AdminService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async getAiUsageSummary(params: { days?: number } = {}): Promise<AiUsageSummaryDto> {
    const periodDays = Math.min(90, Math.max(1, params.days ?? 30));
    const from = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const rows = await this.db.aiUsageLog.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: 'asc' },
    });

    const byFeatureMap = new Map<
      string,
      { feature: string; costUsd: number; calls: number; inputTokens: number; outputTokens: number }
    >();
    const byModelMap = new Map<string, { model: string; costUsd: number; calls: number }>();
    const byDayMap = new Map<string, { date: string; costUsd: number; calls: number }>();

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const row of rows) {
      const costUsd = Number(row.estimatedCostUsd);
      const date = row.createdAt.toISOString().slice(0, 10);

      totalCostUsd += costUsd;
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;

      const featureEntry = byFeatureMap.get(row.feature) ?? {
        feature: row.feature,
        costUsd: 0,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      featureEntry.costUsd += costUsd;
      featureEntry.calls += 1;
      featureEntry.inputTokens += row.inputTokens;
      featureEntry.outputTokens += row.outputTokens;
      byFeatureMap.set(row.feature, featureEntry);

      const modelEntry = byModelMap.get(row.model) ?? {
        model: row.model,
        costUsd: 0,
        calls: 0,
      };
      modelEntry.costUsd += costUsd;
      modelEntry.calls += 1;
      byModelMap.set(row.model, modelEntry);

      const dayEntry = byDayMap.get(date) ?? {
        date,
        costUsd: 0,
        calls: 0,
      };
      dayEntry.costUsd += costUsd;
      dayEntry.calls += 1;
      byDayMap.set(date, dayEntry);
    }

    return {
      periodDays,
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      totalCalls: rows.length,
      byFeature: Array.from(byFeatureMap.values()).sort((a, b) => b.costUsd - a.costUsd),
      byModel: Array.from(byModelMap.values()).sort((a, b) => b.costUsd - a.costUsd),
      byDay: Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getIntegrationHealth(): Promise<IntegrationHealthSnapshotDto[]> {
    const rows = await this.db.credential.findMany({
      include: { health: true },
      orderBy: { key: 'asc' },
    });

    return rows.map((row) => ({
      credentialId: row.id,
      key: row.key,
      provider: row.provider,
      label: row.label,
      isActive: row.isActive,
      lastStatus: row.health?.lastStatus ?? 'unknown',
      lastCheckedAt: row.health?.lastCheckedAt ?? null,
      lastError: row.health?.lastError ?? null,
      successCount24h: row.health?.successCount24h ?? 0,
      errorCount24h: row.health?.errorCount24h ?? 0,
    }));
  }
}

export const adminService = new AdminService();
