import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_content_routes',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const listIdeasMock = vi.fn();
const createIdeaManualMock = vi.fn();
const requestIdeaGenerationMock = vi.fn();
const getIdeaByIdMock = vi.fn();
const updateIdeaMock = vi.fn();
const deleteIdeaMock = vi.fn();
const requestDraftsForIdeaMock = vi.fn();
const getUserForTokenMock = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: { getUserForToken: getUserForTokenMock },
}));

vi.mock('../../modules/content/index.js', () => ({
  IdeaListQuerySchema: { parse: (value: unknown) => value },
  IdeaCreateBodySchema: { parse: (value: unknown) => value },
  IdeaUpdateSchema: { parse: (value: unknown) => value },
  DraftRequestSchema: { parse: (value: unknown) => value },
  IdeaNotFoundError: class extends Error {
    constructor(id: string) {
      super(`Idea ${id} not found`);
      this.name = 'IdeaNotFoundError';
    }
  },
  ContentDailyLimitError: class extends Error {
    constructor() {
      super('Daily content generation limit reached');
      this.name = 'ContentDailyLimitError';
    }
  },
  contentService: {
    listIdeas: listIdeasMock,
    createIdeaManual: createIdeaManualMock,
    requestIdeaGeneration: requestIdeaGenerationMock,
    getIdeaById: getIdeaByIdMock,
    updateIdea: updateIdeaMock,
    deleteIdea: deleteIdeaMock,
    requestDraftsForIdea: requestDraftsForIdeaMock,
  },
}));

describe('content routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getUserForTokenMock.mockResolvedValue(ADMIN);
    listIdeasMock.mockResolvedValue({
      items: [{ id: 'idea_1', title: 'Idea 1', pillar_id: 'pillar_1' }],
      total: 1,
      limit: 20,
      offset: 0,
    });
    createIdeaManualMock.mockResolvedValue({
      id: 'idea_1',
      title: 'Idea 1',
      angle: 'Angle',
      pillar_id: 'pillar_1',
      pillar_label: 'Educacion',
      service_line_id: null,
      icp_vertical: null,
      brief_es: 'Brief',
      status: 'idea',
      created_by_id: ADMIN.id,
      created_at: '2026-05-03T10:00:00.000Z',
      updated_at: '2026-05-03T10:00:00.000Z',
      items_count: 0,
    });
    requestIdeaGenerationMock.mockResolvedValue({ jobId: 'job_idea_1' });
    getIdeaByIdMock.mockResolvedValue(
      createIdeaManualMock.mock.results[0]?.value ?? {
        id: 'idea_1',
        title: 'Idea 1',
      },
    );
    updateIdeaMock.mockResolvedValue({
      id: 'idea_1',
      title: 'Idea 1 updated',
      angle: 'Angle',
      pillar_id: 'pillar_1',
      pillar_label: 'Educacion',
      service_line_id: null,
      icp_vertical: null,
      brief_es: 'Brief',
      status: 'idea',
      created_by_id: ADMIN.id,
      created_at: '2026-05-03T10:00:00.000Z',
      updated_at: '2026-05-03T10:05:00.000Z',
      items_count: 0,
    });
    deleteIdeaMock.mockResolvedValue(undefined);
    requestDraftsForIdeaMock.mockResolvedValue({
      items: [{ id: 'item_1' }, { id: 'item_2' }, { id: 'item_3' }],
      jobIds: ['job_1', 'job_2', 'job_3'],
    });
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_content_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /content/ideas { generate: true } -> 202 { job_id }', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/content/ideas',
      payload: { generate: true, pillar_id: 'pillar_1', brief_es: 'Brief' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ job_id: 'job_idea_1' });
  });

  it('POST /content/ideas manual -> 201 IdeaDto', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/content/ideas',
      payload: { title: 'Idea 1', angle: 'Angle', pillar_id: 'pillar_1', brief_es: 'Brief' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'idea_1', title: 'Idea 1' });
  });

  it('POST /content/ideas sin auth -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/ideas',
      payload: { title: 'Idea 1', angle: 'Angle', pillar_id: 'pillar_1', brief_es: 'Brief' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /content/ideas -> 200 { items, total }', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/content/ideas' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, items: [{ id: 'idea_1' }] });
  });

  it('GET /content/ideas/:id inexistente -> 404', async () => {
    const { IdeaNotFoundError } = await import('../../modules/content/index.js');
    getIdeaByIdMock.mockRejectedValueOnce(new IdeaNotFoundError('missing'));

    const res = await authInject(app, token, { method: 'GET', url: '/content/ideas/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /content/ideas/:id/draft -> 202 { items: 3, job_ids: 3 }', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/content/ideas/idea_1/draft',
      payload: { channels: ['instagram', 'linkedin', 'newsletter'] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      items: [{ id: 'item_1' }, { id: 'item_2' }, { id: 'item_3' }],
      job_ids: ['job_1', 'job_2', 'job_3'],
    });
  });

  it('DELETE /content/ideas/:id -> 204', async () => {
    const res = await authInject(app, token, { method: 'DELETE', url: '/content/ideas/idea_1' });
    expect(res.statusCode).toBe(204);
  });
});

async function authInject(
  app: FastifyInstance,
  token: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    payload?: object;
  },
) {
  return app.inject({
    ...options,
    headers: { authorization: `Bearer ${token}` },
  });
}
