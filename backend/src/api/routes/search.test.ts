import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_search_routes',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: vi.fn(async () => ADMIN),
  },
}));

const searchAllMock = vi.fn(async ({ q, limit }: { q: string; limit: number }) => ({
  query: q,
  companies: [{ type: 'company', id: 'company_1', title: 'Acme', subtitle: 'acme.io', score: 100 }],
  contacts: [
    { type: 'contact', id: 'contact_1', title: 'Ana', subtitle: 'ana@acme.io', score: 50 },
  ],
  leads: [{ type: 'lead', id: 'lead_1', title: 'Acme', subtitle: 'Qualified', score: 10 }],
  activities: [
    {
      type: 'activity',
      id: 'act_1',
      title: 'demo prod',
      subtitle: 'note · Acme',
      score: 50,
    },
  ],
  _limitEcho: limit,
}));

vi.mock('../../modules/search/service.js', () => ({
  searchService: {
    searchAll: searchAllMock,
  },
}));

describe('search routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    searchAllMock.mockClear();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_search_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/search?q=ac' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /search devuelve respuesta agregada por tipo', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/search?q=ac&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(searchAllMock).toHaveBeenCalledWith({ q: 'ac', limit: 5 });
    expect(res.json()).toMatchObject({
      query: 'ac',
      companies: [expect.objectContaining({ type: 'company' })],
      contacts: [expect.objectContaining({ type: 'contact' })],
      leads: [expect.objectContaining({ type: 'lead' })],
      activities: [expect.objectContaining({ type: 'activity' })],
    });
  });

  it('400 con q demasiado corto', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/search?q=a' });
    expect(res.statusCode).toBe(400);
    expect(searchAllMock).not.toHaveBeenCalled();
  });

  it('usa limit por defecto del schema', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/search?q=ac' });
    expect(res.statusCode).toBe(200);
    expect(searchAllMock).toHaveBeenCalledWith({ q: 'ac', limit: 10 });
  });
});

async function authInject(
  app: FastifyInstance,
  token: string,
  options: {
    method: 'GET';
    url: string;
  },
) {
  return app.inject({
    ...options,
    headers: { authorization: `Bearer ${token}` },
  });
}
