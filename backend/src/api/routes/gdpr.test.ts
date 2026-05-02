import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_admin_gdpr_routes',
  email: 'admin@heyday.test',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'user_operator_gdpr_routes',
  email: 'operator@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const { getUserForTokenMock, purgeOldLogsMock } = vi.hoisted(() => ({
  getUserForTokenMock: vi.fn(),
  purgeOldLogsMock: vi.fn(),
}));

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: getUserForTokenMock,
  },
}));

vi.mock('../../modules/gdpr/index.js', () => ({
  gdprService: {
    purgeOldLogs: purgeOldLogsMock,
  },
}));

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerGdprRoutes } = await import('./gdpr.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerGdprRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('gdpr routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserForTokenMock.mockImplementation(async (payload: { sub: string }) =>
      payload.sub === ADMIN.id ? ADMIN : OPERATOR,
    );
    purgeOldLogsMock.mockResolvedValue({
      aiLogsDeleted: 42,
      externalLogsDeleted: 7,
      retentionDays: 90,
    });

    app = await buildTestApp();
    adminToken = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_admin_gdpr_routes' });
    operatorToken = signAccessToken({
      sub: OPERATOR.id,
      role: 'operator',
      sid: 'ses_operator_gdpr_routes',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /admin/gdpr/purge-logs -> 200 con admin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gdpr/purge-logs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { retentionDays: 90 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      aiLogsDeleted: 42,
      externalLogsDeleted: 7,
      retentionDays: 90,
    });
    expect(purgeOldLogsMock).toHaveBeenCalledWith(90);
  });

  it('POST /admin/gdpr/purge-logs -> 401 sin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gdpr/purge-logs',
      payload: { retentionDays: 90 },
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /admin/gdpr/purge-logs -> 403 con operator token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gdpr/purge-logs',
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { retentionDays: 90 },
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /admin/gdpr/purge-logs -> 400 con body inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gdpr/purge-logs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { retentionDays: 0 },
    });

    expect(res.statusCode).toBe(400);
  });
});
