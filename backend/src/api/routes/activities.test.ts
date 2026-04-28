import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  ActivityCreateInput,
  ActivityDto,
  ActivityListQuery,
  ActivityUpdateInput,
} from '../../modules/activities/index.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_activity_routes',
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

interface Store {
  activities: Map<string, ActivityDto>;
}

const store: Store = {
  activities: new Map(),
};

vi.mock('../../modules/activities/service.js', () => {
  class ActivityNotFoundError extends Error {
    constructor(id: string, message = `Actividad "${id}" no encontrada`) {
      super(message);
      this.name = 'ActivityNotFoundError';
    }
  }

  class ActivityEntityNotFoundError extends Error {
    constructor(entityType: string, entityId: string) {
      super(`Entidad "${entityType}" con id "${entityId}" no encontrada`);
      this.name = 'ActivityEntityNotFoundError';
    }
  }

  const activitiesService = {
    async list(query: ActivityListQuery) {
      const filtered = [...store.activities.values()].filter((row) => {
        if (row.entity_type !== query.entity_type) return false;
        if (row.entity_id !== query.entity_id) return false;
        if (query.kind && row.kind !== query.kind) return false;
        if (query.owner_id && row.owner_id !== query.owner_id) return false;
        if (query.completed === 'true' && row.completed_at === null) return false;
        if (query.completed === 'false' && row.completed_at !== null) return false;
        if (query.due_from && (!row.due_at || row.due_at < query.due_from)) return false;
        if (query.due_to && (!row.due_at || row.due_at > query.due_to)) return false;
        return true;
      });

      filtered.sort((a, b) => {
        if (a.due_at === null && b.due_at === null) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (a.due_at === null) return 1;
        if (b.due_at === null) return -1;
        const dueCompare = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        if (dueCompare !== 0) return dueCompare;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const start = (query.page - 1) * query.page_size;
      return {
        rows: filtered.slice(start, start + query.page_size),
        total: filtered.length,
        page: query.page,
        page_size: query.page_size,
      };
    },
    async getById(id: string) {
      const row = store.activities.get(id);
      if (!row) throw new ActivityNotFoundError(id);
      return row;
    },
    async create(input: ActivityCreateInput, createdById: string) {
      if (input.entity_id === 'missing_entity') {
        throw new ActivityEntityNotFoundError(input.entity_type, input.entity_id);
      }

      const now = new Date().toISOString();
      const row: ActivityDto = {
        id: `activity_${store.activities.size + 1}`,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        kind: input.kind,
        title: input.title ?? null,
        body: input.body ?? null,
        owner_id: input.owner_id ?? createdById,
        due_at: input.due_at ?? null,
        completed_at: input.completed_at ?? null,
        remind_at: input.remind_at ?? null,
        created_by_id: createdById,
        created_at: now,
        updated_at: now,
      };
      store.activities.set(row.id, row);
      return row;
    },
    async update(id: string, patch: ActivityUpdateInput) {
      const row = store.activities.get(id);
      if (!row) throw new ActivityNotFoundError(id);
      const updated: ActivityDto = {
        ...row,
        kind: patch.kind ?? row.kind,
        title: patch.title ?? row.title,
        body: patch.body ?? row.body,
        owner_id: patch.owner_id ?? row.owner_id,
        due_at: patch.due_at ?? row.due_at,
        completed_at: patch.completed_at ?? row.completed_at,
        remind_at: patch.remind_at ?? row.remind_at,
        updated_at: new Date().toISOString(),
      };
      store.activities.set(id, updated);
      return updated;
    },
    async delete(id: string) {
      if (!store.activities.has(id)) throw new ActivityNotFoundError(id);
      store.activities.delete(id);
    },
  };

  return { activitiesService, ActivityNotFoundError, ActivityEntityNotFoundError };
});

interface SimpleInjectOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload?: string | object | Buffer | NodeJS.ReadableStream;
  headers?: Record<string, string>;
}

interface InjectResponse {
  statusCode: number;
  json: <T = unknown>() => T;
}

describe('activities routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.activities.clear();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_activity_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/activities?entity_type=company&entity_id=company_1' },
      {
        method: 'POST',
        url: '/activities',
        payload: { entity_type: 'company', entity_id: 'company_1', kind: 'task' },
      },
      { method: 'GET', url: '/activities/activity_1' },
      { method: 'PATCH', url: '/activities/activity_1', payload: { title: 'No Auth' } },
      { method: 'DELETE', url: '/activities/activity_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('POST crea actividad y GET /:id devuelve el mismo DTO', async () => {
    const created = await authInject(app, token, {
      method: 'POST',
      url: '/activities',
      payload: {
        entity_type: 'company',
        entity_id: 'company_1',
        kind: 'task',
        title: 'Route task',
      },
    });

    expect(created.statusCode).toBe(201);
    const dto = created.json<{ id: string; created_by_id: string; owner_id: string }>();
    expect(dto.created_by_id).toBe(ADMIN.id);
    expect(dto.owner_id).toBe(ADMIN.id);

    const fetched = await authInject(app, token, { method: 'GET', url: `/activities/${dto.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(created.json());
  });

  it('GET /activities filtra y pagina', async () => {
    for (let i = 0; i < 5; i++) {
      await createActivity(app, token, {
        entity_type: 'company',
        entity_id: 'company_1',
        kind: i % 2 === 0 ? 'task' : 'note',
        owner_id: i % 2 === 0 ? 'owner_a' : 'owner_b',
        due_at: i === 4 ? undefined : `2026-05-0${i + 1}T10:00:00.000Z`,
        completed_at: i === 0 ? '2026-05-01T12:00:00.000Z' : undefined,
        title: `Activity ${i}`,
      });
    }

    const filtered = await authInject(app, token, {
      method: 'GET',
      url: '/activities?entity_type=company&entity_id=company_1&kind=task&owner_id=owner_a&completed=false&page=1&page_size=2',
    });
    expect(filtered.statusCode).toBe(200);
    const body = filtered.json<{
      total: number;
      rows: Array<{ kind: string; owner_id: string }>;
      page_size: number;
    }>();
    expect(body.total).toBe(2);
    expect(body.page_size).toBe(2);
    expect(body.rows.every((row) => row.kind === 'task' && row.owner_id === 'owner_a')).toBe(true);
  });

  it('PATCH actualiza campos permitidos', async () => {
    const created = await createActivity(app, token, {
      entity_type: 'lead',
      entity_id: 'lead_1',
      kind: 'task',
    });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/activities/${created.id}`,
      payload: { kind: 'meeting_log', completed_at: '2026-05-10T10:00:00.000Z' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      kind: 'meeting_log',
      completed_at: '2026-05-10T10:00:00.000Z',
    });
  });

  it('DELETE devuelve 204 y luego GET devuelve 404', async () => {
    const created = await createActivity(app, token, {
      entity_type: 'contact',
      entity_id: 'contact_1',
      kind: 'note',
    });

    const removed = await authInject(app, token, {
      method: 'DELETE',
      url: `/activities/${created.id}`,
    });
    expect(removed.statusCode).toBe(204);

    const fetched = await authInject(app, token, {
      method: 'GET',
      url: `/activities/${created.id}`,
    });
    expect(fetched.statusCode).toBe(404);
  });

  it('404 cuando la entidad referenciada no existe', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/activities',
      payload: {
        entity_type: 'company',
        entity_id: 'missing_entity',
        kind: 'task',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('400 cuando falla la validación Zod del payload', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/activities',
      payload: {
        entity_type: 'company',
        entity_id: 'company_1',
        kind: 'invalid_kind',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

async function createActivity(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await authInject(app, token, { method: 'POST', url: '/activities', payload });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>();
}

async function authInject(
  app: FastifyInstance,
  token: string,
  options: SimpleInjectOptions,
): Promise<InjectResponse> {
  const res = await app.inject({
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${token}`,
    },
  });
  return res as InjectResponse;
}
