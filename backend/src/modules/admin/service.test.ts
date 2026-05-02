import { Prisma, type PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminService } from './service.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    aiUsageLog: { findMany: vi.fn() },
    credential: { findMany: vi.fn() },
  },
}));

vi.mock('../../core/prisma/client.js', () => ({ prisma: prismaMock }));

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(() => {
    prismaMock.aiUsageLog.findMany.mockReset();
    prismaMock.credential.findMany.mockReset();
    service = new AdminService(prismaMock as unknown as PrismaClient);
  });

  it('getAiUsageSummary devuelve totales y agregados por feature y día', async () => {
    prismaMock.aiUsageLog.findMany.mockResolvedValue([
      {
        feature: 'content_draft',
        model: 'gpt-5-mini',
        inputTokens: 100,
        outputTokens: 40,
        estimatedCostUsd: new Prisma.Decimal('1.25'),
        createdAt: new Date('2026-04-27T10:00:00.000Z'),
      },
      {
        feature: 'content_draft',
        model: 'gpt-5',
        inputTokens: 50,
        outputTokens: 10,
        estimatedCostUsd: new Prisma.Decimal('0.75'),
        createdAt: new Date('2026-04-28T10:00:00.000Z'),
      },
    ]);

    await expect(service.getAiUsageSummary({ days: 7 })).resolves.toEqual({
      periodDays: 7,
      totalCostUsd: 2,
      totalInputTokens: 150,
      totalOutputTokens: 50,
      totalCalls: 2,
      byFeature: [
        {
          feature: 'content_draft',
          costUsd: 2,
          calls: 2,
          inputTokens: 150,
          outputTokens: 50,
        },
      ],
      byModel: [
        { model: 'gpt-5-mini', costUsd: 1.25, calls: 1 },
        { model: 'gpt-5', costUsd: 0.75, calls: 1 },
      ],
      byDay: [
        { date: '2026-04-27', costUsd: 1.25, calls: 1 },
        { date: '2026-04-28', costUsd: 0.75, calls: 1 },
      ],
    });

    expect(prismaMock.aiUsageLog.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: expect.any(Date),
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('getAiUsageSummary devuelve ceros cuando no hay logs', async () => {
    prismaMock.aiUsageLog.findMany.mockResolvedValue([]);

    await expect(service.getAiUsageSummary()).resolves.toEqual({
      periodDays: 30,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      byFeature: [],
      byModel: [],
      byDay: [],
    });
  });

  it("getIntegrationHealth mapea credentials y usa 'unknown' si no hay health", async () => {
    prismaMock.credential.findMany.mockResolvedValue([
      {
        id: 'cred_2',
        key: 'apollo',
        provider: 'apollo',
        label: 'Apollo',
        isActive: false,
        health: null,
      },
      {
        id: 'cred_1',
        key: 'google_places',
        provider: 'google',
        label: 'Google Places',
        isActive: true,
        health: {
          lastStatus: 'ok',
          lastCheckedAt: new Date('2026-04-29T09:00:00.000Z'),
          lastError: null,
          successCount24h: 12,
          errorCount24h: 1,
        },
      },
    ]);

    await expect(service.getIntegrationHealth()).resolves.toEqual([
      {
        credentialId: 'cred_2',
        key: 'apollo',
        provider: 'apollo',
        label: 'Apollo',
        isActive: false,
        lastStatus: 'unknown',
        lastCheckedAt: null,
        lastError: null,
        successCount24h: 0,
        errorCount24h: 0,
      },
      {
        credentialId: 'cred_1',
        key: 'google_places',
        provider: 'google',
        label: 'Google Places',
        isActive: true,
        lastStatus: 'ok',
        lastCheckedAt: new Date('2026-04-29T09:00:00.000Z'),
        lastError: null,
        successCount24h: 12,
        errorCount24h: 1,
      },
    ]);

    expect(prismaMock.credential.findMany).toHaveBeenCalledWith({
      include: { health: true },
      orderBy: { key: 'asc' },
    });
  });
});
