import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type { AiUsageSummaryDto, IntegrationHealthSnapshotDto } from '../../modules/admin/index.js';
import type { AuditLogDto } from '../../modules/audit/index.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_admin_admin_routes',
  email: 'admin@heyday.test',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'user_operator_admin_routes',
  email: 'operator@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const AI_USAGE_SUMMARY: AiUsageSummaryDto = {
  periodDays: 30,
  totalCostUsd: 1.5,
  totalInputTokens: 100,
  totalOutputTokens: 50,
  totalCalls: 2,
  byFeature: [
    {
      feature: 'content_draft',
      costUsd: 1.5,
      calls: 2,
      inputTokens: 100,
      outputTokens: 50,
    },
  ],
  byModel: [{ model: 'gpt-5-mini', costUsd: 1.5, calls: 2 }],
  byDay: [{ date: '2026-04-29', costUsd: 1.5, calls: 2 }],
};

const AUDIT_PAGE: { items: AuditLogDto[]; total: number; page: number; limit: number } = {
  items: [
    {
      id: '1',
      actorUserId: ADMIN.id,
      actorName: ADMIN.name,
      actorEmail: ADMIN.email,
      action: 'user.create',
      entityType: 'user',
      entityId: 'user_1',
      metadata: { role: 'viewer' },
      ip: '127.0.0.1',
      createdAt: new Date('2026-04-29T12:00:00.000Z'),
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

const INTEGRATION_HEALTH: IntegrationHealthSnapshotDto[] = [
  {
    credentialId: 'cred_1',
    key: 'apollo',
    provider: 'apollo',
    label: 'Apollo',
    isActive: true,
    lastStatus: 'ok',
    lastCheckedAt: new Date('2026-04-29T10:00:00.000Z'),
    lastError: null,
    successCount24h: 4,
    errorCount24h: 0,
  },
];

const { getUserForTokenMock, getAiUsageSummaryMock, getIntegrationHealthMock, listPaginatedMock } =
  vi.hoisted(() => ({
    getUserForTokenMock: vi.fn(),
    getAiUsageSummaryMock: vi.fn(),
    getIntegrationHealthMock: vi.fn(),
    listPaginatedMock: vi.fn(),
  }));

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: getUserForTokenMock,
  },
}));

vi.mock('../../modules/admin/index.js', () => ({
  adminService: {
    getAiUsageSummary: getAiUsageSummaryMock,
    getIntegrationHealth: getIntegrationHealthMock,
  },
}));

vi.mock('../../modules/audit/index.js', () => ({
  auditService: {
    listPaginated: listPaginatedMock,
  },
}));

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerAdminRoutes } = await import('./admin.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerAdminRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('admin routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserForTokenMock.mockImplementation(async (payload: { sub: string }) =>
      payload.sub === ADMIN.id ? ADMIN : OPERATOR,
    );
    getAiUsageSummaryMock.mockResolvedValue(AI_USAGE_SUMMARY);
    getIntegrationHealthMock.mockResolvedValue(INTEGRATION_HEALTH);
    listPaginatedMock.mockResolvedValue(AUDIT_PAGE);

    app = await buildTestApp();
    adminToken = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_admin_admin_routes' });
    operatorToken = signAccessToken({
      sub: OPERATOR.id,
      role: 'operator',
      sid: 'ses_operator_admin_routes',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/ai-usage -> 200 con admin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage?days=30',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(AI_USAGE_SUMMARY);
    expect(getAiUsageSummaryMock).toHaveBeenCalledWith({ days: 30 });
  });

  it('GET /admin/ai-usage -> 401 sin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/ai-usage -> 403 con operator token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /admin/audit-log -> 200 retorna resultado paginado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit-log?action=user.create&page=1&limit=50&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.999Z',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ...AUDIT_PAGE,
      items: [
        {
          ...AUDIT_PAGE.items[0],
          createdAt: AUDIT_PAGE.items[0]?.createdAt.toISOString(),
        },
      ],
    });
    expect(listPaginatedMock).toHaveBeenCalledWith({
      actorUserId: undefined,
      action: 'user.create',
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-04-30T23:59:59.999Z'),
      page: 1,
      limit: 50,
    });
  });

  it('GET /admin/audit-log -> 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit-log',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/integration-health -> 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/integration-health',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        ...INTEGRATION_HEALTH[0],
        lastCheckedAt: INTEGRATION_HEALTH[0]?.lastCheckedAt?.toISOString() ?? null,
      },
    ]);
  });

  it('GET /admin/integration-health -> 403 con operator token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/integration-health',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
