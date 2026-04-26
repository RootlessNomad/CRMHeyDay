import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signAccessToken } from '../../core/auth/tokens.js';
import type { PublicUserDto, AuthService } from '../../modules/auth/service.js';
import authPlugin from './auth.js';

function makeAuthMock(user: PublicUserDto | null): AuthService {
  const mock = {
    getUserForToken: vi.fn(async () => {
      if (!user) {
        const { AuthError } = await import('../../core/auth/errors.js');
        throw AuthError.invalidCredentials();
      }
      return user;
    }),
  };
  return mock as unknown as AuthService;
}

async function buildApp(auth: AuthService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(authPlugin, { auth });
  app.get('/protected', { preHandler: [app.requireAuth] }, async (req) => ({
    user: req.authUser,
    sid: req.authSessionId,
  }));
  app.get(
    '/admin-only',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (req) => ({ user: req.authUser }),
  );
  app.setErrorHandler((err, _req, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    reply.code(e.statusCode ?? 500).send({ code: e.code, message: e.message });
  });
  return app;
}

const ADMIN: PublicUserDto = {
  id: 'u_1',
  email: 'alex@heyday.studio',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

describe('requireAuth', () => {
  let app: FastifyInstance;
  let validToken: string;

  beforeEach(async () => {
    app = await buildApp(makeAuthMock(ADMIN));
    validToken = signAccessToken({ sub: 'u_1', role: 'admin', sid: 'ses_1' });
  });

  it('401 sin header Authorization', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('401 si el header no empieza por "Bearer "', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic abc' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401 si el token es inválido', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('200 con token válido y expone authUser + authSessionId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { user: PublicUserDto; sid: string };
    expect(body.user.id).toBe('u_1');
    expect(body.sid).toBe('ses_1');
  });
});

describe('requireRole', () => {
  it('403 si el role no coincide', async () => {
    const operator: PublicUserDto = { ...ADMIN, role: 'operator' };
    const app = await buildApp(makeAuthMock(operator));
    const token = signAccessToken({ sub: 'u_1', role: 'operator', sid: 'ses_1' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('200 si el role coincide', async () => {
    const app = await buildApp(makeAuthMock(ADMIN));
    const token = signAccessToken({ sub: 'u_1', role: 'admin', sid: 'ses_1' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
