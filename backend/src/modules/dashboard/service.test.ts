import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardService } from './service.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    lead: { count: vi.fn(), findMany: vi.fn() },
    job: { count: vi.fn() },
    aiUsageLog: { aggregate: vi.fn() },
    activity: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../core/prisma/client.js', () => ({ prisma: prismaMock }));

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    prismaMock.lead.count.mockReset();
    prismaMock.lead.findMany.mockReset();
    prismaMock.job.count.mockReset();
    prismaMock.aiUsageLog.aggregate.mockReset();
    prismaMock.activity.findMany.mockReset();
    prismaMock.$transaction.mockReset();
    service = new DashboardService(prismaMock as unknown as PrismaClient);
  });

  describe('metrics', () => {
    it('devuelve todos los conteos correctamente', async () => {
      prismaMock.$transaction.mockResolvedValue([2, 1, 3, { _sum: { estimatedCostUsd: 1.5 } }]);

      await expect(service.metrics('user_1')).resolves.toEqual({
        leads_open: 2,
        leads_stale: 1,
        approvals_pending: 0,
        jobs_running: 3,
        ai_cost_month_usd: 1.5,
      });
    });

    it('ai_cost_month_usd es 0 cuando el sum es null', async () => {
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, { _sum: { estimatedCostUsd: null } }]);

      await expect(service.metrics('user_1')).resolves.toMatchObject({ ai_cost_month_usd: 0 });
    });

    it('approvals_pending siempre es 0', async () => {
      prismaMock.$transaction.mockResolvedValue([10, 4, 2, { _sum: { estimatedCostUsd: 9.99 } }]);

      await expect(service.metrics('user_1')).resolves.toMatchObject({ approvals_pending: 0 });
    });

    it('ejecuta las queries dentro de una transacción', async () => {
      prismaMock.lead.count.mockReturnValueOnce('lead-open-query');
      prismaMock.lead.count.mockReturnValueOnce('lead-stale-query');
      prismaMock.job.count.mockReturnValue('job-query');
      prismaMock.aiUsageLog.aggregate.mockReturnValue('cost-query');
      prismaMock.$transaction.mockResolvedValue([0, 0, 0, { _sum: { estimatedCostUsd: 0 } }]);

      await service.metrics('user_1');

      expect(prismaMock.$transaction).toHaveBeenCalledWith([
        'lead-open-query',
        'lead-stale-query',
        'job-query',
        'cost-query',
      ]);
    });
  });

  describe('upcomingActions', () => {
    it('devuelve lista mapeada correctamente', async () => {
      const dueAt = new Date('2026-05-01T10:00:00.000Z');
      prismaMock.activity.findMany.mockResolvedValue([
        {
          id: 'act_1',
          title: 'Llamar a cliente',
          kind: 'call',
          dueAt,
          entityType: 'lead',
          entityId: 'lead_1',
        },
      ]);

      await expect(service.upcomingActions('user_1')).resolves.toEqual([
        {
          id: 'act_1',
          title: 'Llamar a cliente',
          kind: 'call',
          due_at: dueAt.toISOString(),
          entity_type: 'lead',
          entity_id: 'lead_1',
        },
      ]);
    });

    it('devuelve array vacío cuando no hay activities', async () => {
      prismaMock.activity.findMany.mockResolvedValue([]);

      await expect(service.upcomingActions('user_1')).resolves.toEqual([]);
    });

    it('filtra por ownerId del userId recibido', async () => {
      prismaMock.activity.findMany.mockResolvedValue([]);

      await service.upcomingActions('user_123');

      expect(prismaMock.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'user_123', completedAt: null }),
        }),
      );
    });

    it('envía orden ascendente por dueAt y límite 10', async () => {
      prismaMock.activity.findMany.mockResolvedValue([]);

      await service.upcomingActions('user_1');

      expect(prismaMock.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueAt: 'asc' },
          take: 10,
        }),
      );
    });
  });

  describe('topPriorityLeads', () => {
    it('devuelve top leads mapeados por priorityScore desc', async () => {
      prismaMock.lead.findMany.mockResolvedValue([
        {
          id: 'lead_1',
          priorityScore: 100,
          stage: { name: 'Qualified' },
          company: { name: 'Alpha' },
        },
        {
          id: 'lead_2',
          priorityScore: 90,
          stage: { name: 'Discovery' },
          company: { name: 'Beta' },
        },
      ]);

      await expect(service.topPriorityLeads()).resolves.toEqual([
        {
          id: 'lead_1',
          title: 'Alpha',
          priority_score: 100,
          stage_name: 'Qualified',
        },
        {
          id: 'lead_2',
          title: 'Beta',
          priority_score: 90,
          stage_name: 'Discovery',
        },
      ]);
    });

    it('devuelve array vacío cuando no hay leads abiertos', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);

      await expect(service.topPriorityLeads()).resolves.toEqual([]);
    });

    it('stage_name es null cuando el lead no tiene stage', async () => {
      prismaMock.lead.findMany.mockResolvedValue([
        {
          id: 'lead_1',
          priorityScore: 70,
          stage: null,
          company: { name: 'Alpha' },
        },
      ]);

      await expect(service.topPriorityLeads()).resolves.toEqual([
        {
          id: 'lead_1',
          title: 'Alpha',
          priority_score: 70,
          stage_name: null,
        },
      ]);
    });

    it('incluye stage.name en la query y el resultado', async () => {
      prismaMock.lead.findMany.mockResolvedValue([
        {
          id: 'lead_1',
          priorityScore: 80,
          stage: { name: 'Proposal' },
          company: { name: 'Alpha' },
        },
      ]);

      const result = await service.topPriorityLeads();

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith({
        where: { status: 'open', deletedAt: null },
        orderBy: { priorityScore: 'desc' },
        take: 5,
        include: {
          stage: { select: { name: true } },
          company: { select: { name: true } },
        },
      });
      expect(result[0]).toMatchObject({ stage_name: 'Proposal' });
    });
  });
});
