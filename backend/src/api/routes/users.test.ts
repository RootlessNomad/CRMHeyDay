import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_admin_routes',
  email: 'admin@heyday.test',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'op_id',
  email: 'operator@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const USER_1: PublicUserDto = {
  id: 'user_1',
  email: 'user1@heyday.test',
  name: 'User One',
  role: 'viewer',
  isActive: true,
  lastLoginAt: null,
};

const USER_2: PublicUserDto = {
  id: 'user_2',
  email: 'user2@heyday.test',
  name: 'User Two',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const {
  getUserForTokenMock,
  registerAdminMock,
  listMock,
  getByIdMock,
  updateMock,
  setActiveMock,
  auditRecordMock,
} = vi.hoisted(() => ({
  getUserForTokenMock: vi.fn(),
  registerAdminMock: vi.fn(),
  listMock: vi.fn(),
  getByIdMock: vi.fn(),
  updateMock: vi.fn(),
  setActiveMock: vi.fn(),
  auditRecordMock: vi.fn(),
}));

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: getUserForTokenMock,
    registerAdmin: registerAdminMock,
  },
}));

vi.mock('../../modules/users/service.js', () => ({
  usersService: {
    list: listMock,
    getById: getByIdMock,
    update: updateMock,
    setActive: setActiveMock,
  },
}));

vi.mock('../../modules/audit/index.js', () => ({
  auditService: {
    record: auditRecordMock,
  },
}));

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerUsersRoutes } = await import('./users.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerUsersRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('users routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserForTokenMock.mockImplementation(async (payload: { sub: string }) =>
      payload.sub === ADMIN.id ? ADMIN : OPERATOR,
    );
    listMock.mockResolvedValue([ADMIN, USER_1, USER_2]);
    getByIdMock.mockImplementation(async (id: string) => {
      return [ADMIN, USER_1, USER_2].find((user) => user.id === id) ?? null;
    });
    updateMock.mockImplementation(async (id: string, patch: Record<string, unknown>) => {
      const existing = [ADMIN, USER_1, USER_2].find((user) => user.id === id);
      if (!existing) {
        throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      }
      return { ...existing, ...patch };
    });
    setActiveMock.mockImplementation(async (id: string, isActive: boolean) => {
      const existing = [ADMIN, USER_1, USER_2].find((user) => user.id === id);
      if (!existing) {
        throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      }
      return { ...existing, isActive };
    });
    registerAdminMock.mockResolvedValue({
      id: 'user_new',
      email: 'new@heyday.test',
      name: 'New User',
      role: 'admin',
      isActive: true,
      lastLoginAt: null,
    } satisfies PublicUserDto);

    app = await buildTestApp();
    adminToken = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_test' });
    operatorToken = signAccessToken({ sub: 'op_id', role: 'operator', sid: 'ses_op' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/users -> 200 con lista', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([ADMIN, USER_1, USER_2]);
  });

  it('GET /admin/users/:id -> 200 con usuario', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${USER_1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(USER_1);
  });

  it('GET /admin/users/:id -> 404 si no existe', async () => {
    getByIdMock.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/missing',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('POST /admin/users -> 201 happy path', async () => {
    updateMock.mockResolvedValueOnce({
      id: 'user_new',
      email: 'new@heyday.test',
      name: 'New User',
      role: 'viewer',
      isActive: true,
      lastLoginAt: null,
    } satisfies PublicUserDto);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: {
        email: 'new@heyday.test',
        name: 'New User',
        password: 'supersafe123',
        role: 'viewer',
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(201);
    expect(registerAdminMock).toHaveBeenCalledWith({
      email: 'new@heyday.test',
      name: 'New User',
      password: 'supersafe123',
    });
    expect(updateMock).toHaveBeenCalledWith('user_new', { role: 'viewer' });
    expect(res.json()).toMatchObject({ id: 'user_new', role: 'viewer' });
    expect(auditRecordMock).toHaveBeenCalledWith({
      action: 'user.create',
      actorUserId: ADMIN.id,
      entityType: 'user',
      entityId: 'user_new',
      metadata: { role: 'viewer' },
    });
  });

  it('POST /admin/users -> 409 email duplicado', async () => {
    registerAdminMock.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), {
        code: 'P2002',
        name: 'PrismaClientKnownRequestError',
      }),
    );
    listMock.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/users',
      payload: {
        email: 'dup@heyday.test',
        name: 'Duplicated',
        password: 'supersafe123',
        role: 'admin',
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Email ya registrado' },
    });
  });

  it('PATCH /admin/users/:id -> 200 happy path', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${USER_1.id}`,
      payload: { name: 'Updated Name' },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(USER_1.id, { name: 'Updated Name' });
    expect(res.json()).toMatchObject({ id: USER_1.id, name: 'Updated Name' });
    expect(auditRecordMock).toHaveBeenCalledWith({
      action: 'user.update',
      actorUserId: ADMIN.id,
      entityType: 'user',
      entityId: USER_1.id,
      metadata: { changed: ['name'] },
    });
  });

  it('PATCH /admin/users/:id -> 400 auto-desactivacion', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${ADMIN.id}`,
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'No puedes desactivarte a ti mismo' },
    });
  });

  it('PATCH /admin/users/:id -> 400 ultimo admin', async () => {
    getByIdMock.mockResolvedValueOnce(ADMIN);
    listMock.mockResolvedValueOnce([ADMIN]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/users/${ADMIN.id}`,
      payload: { role: 'viewer' },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Debe existir al menos un admin activo' },
    });
  });

  it('POST /admin/users/:id/password/reset -> 200 con temporaryPassword', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${USER_1.id}/password/reset`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ temporaryPassword: string }>();
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    expect(updateMock).toHaveBeenCalledWith(
      USER_1.id,
      expect.objectContaining({ password: expect.any(String) }),
    );
    expect(auditRecordMock).toHaveBeenCalledWith({
      action: 'user.password_reset',
      actorUserId: ADMIN.id,
      entityType: 'user',
      entityId: USER_1.id,
      metadata: {},
    });
  });

  it('GET /admin/users -> 401 sin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/users -> 403 con token de operator', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
