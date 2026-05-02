import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  CredentialPublicDto,
  CredentialWithHealthDto,
} from '../../modules/credentials/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_admin_credentials',
  email: 'admin@heyday.test',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'user_operator_credentials',
  email: 'operator@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const SAMPLE_CRED: CredentialPublicDto = {
  id: 'cred_001',
  key: 'google_places',
  provider: 'google',
  label: 'Google Places API',
  keyVersion: 1,
  isActive: true,
  lastUsedAt: null,
  lastRotatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const SAMPLE_CRED_WITH_HEALTH: CredentialWithHealthDto = {
  ...SAMPLE_CRED,
  health: {
    lastStatus: 'unknown',
    lastCheckedAt: null,
    lastError: null,
    successCount24h: 0,
    errorCount24h: 0,
  },
};

const SAMPLE_CRED_WITH_HEALTH_HTTP = {
  ...SAMPLE_CRED_WITH_HEALTH,
  createdAt: SAMPLE_CRED_WITH_HEALTH.createdAt.toISOString(),
  updatedAt: SAMPLE_CRED_WITH_HEALTH.updatedAt.toISOString(),
};

const {
  getUserForTokenMock,
  listWithHealthMock,
  getWithHealthByIdMock,
  createMock,
  rotateMock,
  setActiveMock,
  deleteMock,
  getPublicByIdMock,
  enqueueMock,
  auditRecordMock,
  MockCredentialNotFoundError,
  MockCredentialConflictError,
} = vi.hoisted(() => ({
  getUserForTokenMock: vi.fn(),
  listWithHealthMock: vi.fn(),
  getWithHealthByIdMock: vi.fn(),
  createMock: vi.fn(),
  rotateMock: vi.fn(),
  setActiveMock: vi.fn(),
  deleteMock: vi.fn(),
  getPublicByIdMock: vi.fn(),
  enqueueMock: vi.fn(),
  auditRecordMock: vi.fn(),
  MockCredentialNotFoundError: class MockCredentialNotFoundError extends Error {
    readonly code = 'CREDENTIAL_NOT_FOUND';

    constructor(idOrKey: string) {
      super(`Credential '${idOrKey}' no encontrada`);
      this.name = 'CredentialNotFoundError';
    }
  },
  MockCredentialConflictError: class MockCredentialConflictError extends Error {
    readonly code = 'CREDENTIAL_CONFLICT';

    constructor(key: string) {
      super(`Ya existe una credential con key '${key}'`);
      this.name = 'CredentialConflictError';
    }
  },
}));

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../core/queue/queues.js', () => ({
  enqueue: enqueueMock.mockResolvedValue({ jobId: 'job_test_001' }),
}));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: getUserForTokenMock,
  },
}));

vi.mock('../../modules/credentials/service.js', () => ({
  CredentialNotFoundError: MockCredentialNotFoundError,
  CredentialConflictError: MockCredentialConflictError,
  credentialsService: {
    listWithHealth: listWithHealthMock,
    getWithHealthById: getWithHealthByIdMock,
    create: createMock,
    rotate: rotateMock,
    setActive: setActiveMock,
    delete: deleteMock,
    getPublicById: getPublicByIdMock,
  },
}));

vi.mock('../../modules/audit/index.js', () => ({
  auditService: {
    record: auditRecordMock,
  },
}));

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerCredentialsRoutes } = await import('./credentials.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerCredentialsRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('credentials routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    getUserForTokenMock.mockImplementation(async (payload: { sub: string }) =>
      payload.sub === ADMIN.id ? ADMIN : OPERATOR,
    );
    listWithHealthMock.mockResolvedValue([SAMPLE_CRED_WITH_HEALTH]);
    getWithHealthByIdMock.mockResolvedValue(SAMPLE_CRED_WITH_HEALTH);
    createMock.mockResolvedValue(SAMPLE_CRED);
    rotateMock.mockResolvedValue({
      ...SAMPLE_CRED,
      keyVersion: 2,
      lastRotatedAt: new Date(),
    } satisfies CredentialPublicDto);
    setActiveMock.mockResolvedValue({ ...SAMPLE_CRED, isActive: false });
    deleteMock.mockResolvedValue(undefined);
    getPublicByIdMock.mockResolvedValue(SAMPLE_CRED);
    enqueueMock.mockResolvedValue({ jobId: 'job_test_001' });

    app = await buildTestApp();
    adminToken = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_admin_credentials' });
    operatorToken = signAccessToken({
      sub: OPERATOR.id,
      role: 'operator',
      sid: 'ses_operator_credentials',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/credentials -> 200, lista correcta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/credentials',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([SAMPLE_CRED_WITH_HEALTH_HTTP]);
  });

  it('GET /admin/credentials/:id -> 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/credentials/${SAMPLE_CRED.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SAMPLE_CRED_WITH_HEALTH_HTTP);
  });

  it('GET /admin/credentials/:id -> 404', async () => {
    getWithHealthByIdMock.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/admin/credentials/missing',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /admin/credentials -> 201, body es CredentialPublicDto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/credentials',
      payload: {
        key: 'google_places',
        provider: 'google',
        label: 'Google Places API',
        plaintext: 'super-secret',
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(201);
    expect(createMock).toHaveBeenCalledWith({
      key: 'google_places',
      provider: 'google',
      label: 'Google Places API',
      plaintext: 'super-secret',
      actorUserId: ADMIN.id,
    });
    const body = res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('plaintext');
    expect(body).not.toHaveProperty('ciphertext');
    expect(body).not.toHaveProperty('iv');
    expect(body).not.toHaveProperty('authTag');
  });

  it('POST /admin/credentials -> 409 key duplicada', async () => {
    createMock.mockRejectedValueOnce(new MockCredentialConflictError('google_places'));

    const res = await app.inject({
      method: 'POST',
      url: '/admin/credentials',
      payload: {
        key: 'google_places',
        provider: 'google',
        label: 'Google Places API',
        plaintext: 'super-secret',
      },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: "Ya existe una credential con key 'google_places'",
      },
    });
  });

  it('POST /admin/credentials/:id/rotate -> 200, body NO tiene newPlaintext', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/credentials/${SAMPLE_CRED.id}/rotate`,
      payload: { newPlaintext: 'rotated-secret' },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(rotateMock).toHaveBeenCalledWith({
      id: SAMPLE_CRED.id,
      newPlaintext: 'rotated-secret',
      actorUserId: ADMIN.id,
    });
    const body = res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('newPlaintext');
  });

  it('PATCH /admin/credentials/:id/active -> 200', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/credentials/${SAMPLE_CRED.id}/active`,
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(setActiveMock).toHaveBeenCalledWith(SAMPLE_CRED.id, false, ADMIN.id);
    expect(res.json()).toMatchObject({ id: SAMPLE_CRED.id, isActive: false });
  });

  it('DELETE /admin/credentials/:id -> 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/credentials/${SAMPLE_CRED.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(204);
    expect(deleteMock).toHaveBeenCalledWith(SAMPLE_CRED.id, ADMIN.id);
  });

  it('POST /admin/credentials/:id/test -> 202 con { jobId }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/credentials/${SAMPLE_CRED.id}/test`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(202);
    expect(getPublicByIdMock).toHaveBeenCalledWith(SAMPLE_CRED.id);
    expect(enqueueMock).toHaveBeenCalledWith('integration_test', {
      credentialId: SAMPLE_CRED.id,
      actorUserId: ADMIN.id,
    });
    expect(res.json()).toEqual({ jobId: 'job_test_001' });
  });

  it('GET /admin/credentials -> 401 sin token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/credentials',
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/credentials -> 403 con token de operator', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/credentials',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
