import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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
const getItemByIdMock = vi.fn();
const createVersionMock = vi.fn();
const getUserForTokenMock = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: { getUserForToken: getUserForTokenMock },
}));

vi.mock('../../modules/content/index.js', () => {
  class IdeaNotFoundError extends Error {
    constructor(id: string) {
      super(`Idea ${id} not found`);
      this.name = 'IdeaNotFoundError';
    }
  }

  class ItemNotFoundError extends Error {
    constructor(id: string) {
      super(`ContentItem ${id} not found`);
      this.name = 'ItemNotFoundError';
    }
  }

  class ContentDailyLimitError extends Error {
    constructor() {
      super('Daily content generation limit reached');
      this.name = 'ContentDailyLimitError';
    }
  }

  class ConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConflictError';
    }
  }

  return {
    IdeaListQuerySchema: {
      parse: (value: unknown) =>
        z
          .object({
            status: z.enum(['idea', 'in_production', 'shipped', 'archived']).optional(),
            pillar_id: z.string().optional(),
            vertical: z
              .enum(['physiotherapy', 'pilates', 'yoga', 'gym_fitness', 'bakery', 'cafe', 'other'])
              .optional(),
            q: z.string().optional(),
            limit: z.coerce.number().int().min(1).max(200).default(20),
            offset: z.coerce.number().int().min(0).default(0),
          })
          .parse(value),
    },
    IdeaCreateBodySchema: { parse: (value: unknown) => value },
    IdeaUpdateSchema: { parse: (value: unknown) => value },
    DraftRequestSchema: {
      parse: (value: unknown) =>
        z
          .object({
            channels: z
              .array(z.enum(['instagram', 'linkedin', 'newsletter']))
              .min(1)
              .max(3)
              .default(['instagram', 'linkedin', 'newsletter']),
          })
          .parse(value),
    },
    CreateVersionBodySchema: {
      parse: (value: unknown) =>
        z
          .object({
            body: z.string().trim().min(1).max(50000),
            title: z.string().trim().min(1).max(500).optional(),
            hooks: z.array(z.string().trim().min(1)).max(10).default([]),
            ctas: z.array(z.string().trim().min(1)).max(10).default([]),
            hashtags: z.array(z.string().trim().min(1)).max(30).default([]),
          })
          .parse(value),
    },
    IdeaNotFoundError,
    ItemNotFoundError,
    ContentDailyLimitError,
    ConflictError,
    contentService: {
      listIdeas: listIdeasMock,
      createIdeaManual: createIdeaManualMock,
      requestIdeaGeneration: requestIdeaGenerationMock,
      getIdeaById: getIdeaByIdMock,
      updateIdea: updateIdeaMock,
      deleteIdea: deleteIdeaMock,
      requestDraftsForIdea: requestDraftsForIdeaMock,
      getItemById: getItemByIdMock,
      createVersion: createVersionMock,
    },
  };
});

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
    getIdeaByIdMock.mockResolvedValue({
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
    getItemByIdMock.mockResolvedValue({
      id: 'item_1',
      idea_id: 'idea_1',
      channel: 'instagram',
      status: 'draft',
      scheduled_for: '2026-05-05',
      current_version_id: 'version_2',
      current_version: {
        id: 'version_2',
        item_id: 'item_1',
        version_number: 2,
        title: 'Titulo',
        body: 'Body',
        hooks: ['Hook'],
        ctas: ['CTA'],
        hashtags: ['#heyday'],
        generated_by: 'human',
        edited_by_id: ADMIN.id,
        created_at: '2026-05-03T10:00:00.000Z',
      },
      versions: [
        {
          id: 'version_2',
          item_id: 'item_1',
          version_number: 2,
          title: 'Titulo',
          body: 'Body',
          hooks: ['Hook'],
          ctas: ['CTA'],
          hashtags: ['#heyday'],
          generated_by: 'human',
          edited_by_id: ADMIN.id,
          created_at: '2026-05-03T10:00:00.000Z',
        },
      ],
      created_by_id: ADMIN.id,
      created_at: '2026-05-03T10:00:00.000Z',
      updated_at: '2026-05-03T10:00:00.000Z',
    });
    createVersionMock.mockResolvedValue({
      id: 'version_3',
      item_id: 'item_1',
      version_number: 3,
      title: 'Nuevo titulo',
      body: 'Nuevo body',
      hooks: ['Hook'],
      ctas: ['CTA'],
      hashtags: ['#heyday'],
      generated_by: 'human',
      edited_by_id: ADMIN.id,
      created_at: '2026-05-03T10:05:00.000Z',
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

  it('GET /content/items/:id -> 200 con shape correcta', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/content/items/item_1' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: 'item_1',
      current_version: { id: 'version_2', version_number: 2 },
      versions: [{ id: 'version_2', item_id: 'item_1' }],
    });
  });

  it('GET /content/items/:id sin auth -> 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/content/items/item_1' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /content/items/:id item no existe -> 404', async () => {
    const { ItemNotFoundError } = await import('../../modules/content/index.js');
    getItemByIdMock.mockRejectedValueOnce(new ItemNotFoundError('missing'));

    const res = await authInject(app, token, { method: 'GET', url: '/content/items/missing' });
    expect(res.statusCode).toBe(404);
  });

  it('POST /content/items/:id/versions -> 201 con ContentVersionDto', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/content/items/item_1/versions',
      payload: { body: 'Nuevo body', title: 'Nuevo titulo', hooks: ['Hook'] },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: 'version_3',
      item_id: 'item_1',
      version_number: 3,
      body: 'Nuevo body',
    });
  });

  it('POST /content/items/:id/versions sin auth -> 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/items/item_1/versions',
      payload: { body: 'Nuevo body' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /content/items/:id/versions body invalido (body vacio) -> 400', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/content/items/item_1/versions',
      payload: { body: '   ' },
    });

    expect(res.statusCode).toBe(400);
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
