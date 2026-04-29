import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_dashboard_routes',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const metricsMock = vi.fn();
const upcomingActionsMock = vi.fn();
const topPriorityLeadsMock = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: vi.fn(async () => ADMIN),
  },
}));

vi.mock('../../modules/dashboard/index.js', () => {
  class DashboardService {
    async metrics(userId: string) {
      return metricsMock(userId);
    }

    async upcomingActions(userId: string) {
      return upcomingActionsMock(userId);
    }

    async topPriorityLeads() {
      return topPriorityLeadsMock();
    }
  }

  return { DashboardService };
});

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerDashboardRoutes } = await import('./dashboard.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerDashboardRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('dashboard routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    metricsMock.mockReset();
    upcomingActionsMock.mockReset();
    topPriorityLeadsMock.mockReset();
    app = await buildTestApp();
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_dashboard_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /dashboard/metrics responde 200 con shape correcta', async () => {
    metricsMock.mockResolvedValue({
      leads_open: 2,
      leads_stale: 1,
      approvals_pending: 0,
      jobs_running: 3,
      ai_cost_month_usd: 1.5,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/metrics',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      leads_open: 2,
      leads_stale: 1,
      approvals_pending: 0,
      jobs_running: 3,
      ai_cost_month_usd: 1.5,
    });
    expect(metricsMock).toHaveBeenCalledWith(ADMIN.id);
  });

  it('GET /dashboard/upcoming-actions responde 200 con array', async () => {
    upcomingActionsMock.mockResolvedValue([
      {
        id: 'act_1',
        title: 'Llamar',
        kind: 'call',
        due_at: '2026-05-01T10:00:00.000Z',
        entity_type: 'lead',
        entity_id: 'lead_1',
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming-actions',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: 'act_1',
        title: 'Llamar',
        kind: 'call',
        due_at: '2026-05-01T10:00:00.000Z',
        entity_type: 'lead',
        entity_id: 'lead_1',
      },
    ]);
    expect(upcomingActionsMock).toHaveBeenCalledWith(ADMIN.id);
  });

  it('GET /dashboard/top-priority-leads responde 200 con array', async () => {
    topPriorityLeadsMock.mockResolvedValue([
      {
        id: 'lead_1',
        title: 'Alpha',
        priority_score: 100,
        stage_name: 'Qualified',
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/top-priority-leads',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        id: 'lead_1',
        title: 'Alpha',
        priority_score: 100,
        stage_name: 'Qualified',
      },
    ]);
    expect(topPriorityLeadsMock).toHaveBeenCalledTimes(1);
  });

  it('401 en métricas sin auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/metrics',
    });

    expect(res.statusCode).toBe(401);
  });

  it('401 en upcoming-actions sin auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming-actions',
    });

    expect(res.statusCode).toBe(401);
  });

  it('incluye Cache-Control en respuestas exitosas', async () => {
    metricsMock.mockResolvedValue({
      leads_open: 0,
      leads_stale: 0,
      approvals_pending: 0,
      jobs_running: 0,
      ai_cost_month_usd: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/metrics',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });
});
