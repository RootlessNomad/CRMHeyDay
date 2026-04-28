import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  TagAssignInput,
  TagDto,
  TagListQuery,
  TagUpdateInput,
} from '../../modules/tags/index.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_tag_routes',
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
  tags: Map<string, TagDto>;
  assignments: Set<string>;
}

const store: Store = {
  tags: new Map(),
  assignments: new Set(),
};

vi.mock('../../modules/tags/service.js', () => {
  class TagNotFoundError extends Error {
    constructor(id: string, message = `Tag "${id}" no encontrada`) {
      super(message);
      this.name = 'TagNotFoundError';
    }
  }

  class TagNameConflictError extends Error {
    constructor(name: string) {
      super(`Ya existe una tag con el nombre "${name}"`);
      this.name = 'TagNameConflictError';
    }
  }

  class TagAssignmentEntityNotFoundError extends Error {
    constructor(entityType: string, entityId: string) {
      super(`Entidad "${entityType}" con id "${entityId}" no encontrada`);
      this.name = 'TagAssignmentEntityNotFoundError';
    }
  }

  class TagAssignmentConflictError extends Error {
    constructor(tagId: string, entityType: string, entityId: string) {
      super(`La tag "${tagId}" ya está asignada a "${entityType}" con id "${entityId}"`);
      this.name = 'TagAssignmentConflictError';
    }
  }

  const tagsService = {
    async list(query: TagListQuery) {
      return [...store.tags.values()].filter((row) => {
        if (query.kind && row.kind !== query.kind) return false;
        if (query.q && !row.name.toLowerCase().includes(query.q.toLowerCase())) return false;
        return true;
      });
    },
    async getById(id: string) {
      const row = store.tags.get(id);
      if (!row) throw new TagNotFoundError(id);
      return row;
    },
    async create(input: { name: string; color?: string; kind: TagDto['kind'] }) {
      if ([...store.tags.values()].some((row) => row.name === input.name)) {
        throw new TagNameConflictError(input.name);
      }
      const now = new Date().toISOString();
      const row: TagDto = {
        id: `tag_${store.tags.size + 1}`,
        name: input.name,
        color: input.color ?? null,
        kind: input.kind,
        created_at: now,
      };
      store.tags.set(row.id, row);
      return row;
    },
    async update(id: string, patch: TagUpdateInput) {
      const row = store.tags.get(id);
      if (!row) throw new TagNotFoundError(id);
      if (
        patch.name &&
        [...store.tags.values()].some((item) => item.id !== id && item.name === patch.name)
      ) {
        throw new TagNameConflictError(patch.name);
      }
      const updated: TagDto = {
        ...row,
        name: patch.name ?? row.name,
        color: patch.color ?? row.color,
        kind: patch.kind ?? row.kind,
      };
      store.tags.set(id, updated);
      return updated;
    },
    async delete(id: string) {
      if (!store.tags.has(id)) throw new TagNotFoundError(id);
      store.tags.delete(id);
    },
    async assign(input: TagAssignInput) {
      if (!store.tags.has(input.tag_id)) throw new TagNotFoundError(input.tag_id);
      if (input.entity_id === 'missing_entity') {
        throw new TagAssignmentEntityNotFoundError(input.entity_type, input.entity_id);
      }
      const key = `${input.tag_id}:${input.entity_type}:${input.entity_id}`;
      if (store.assignments.has(key)) {
        throw new TagAssignmentConflictError(input.tag_id, input.entity_type, input.entity_id);
      }
      store.assignments.add(key);
      return store.tags.get(input.tag_id)!;
    },
    async unassign(input: TagAssignInput) {
      const key = `${input.tag_id}:${input.entity_type}:${input.entity_id}`;
      store.assignments.delete(key);
    },
    async getForEntity(entityType: string, entityId: string) {
      const tagIds = [...store.assignments.values()]
        .filter((key) => key.endsWith(`:${entityType}:${entityId}`))
        .map((key) => key.split(':')[0])
        .filter((id): id is string => Boolean(id));
      return tagIds.map((id) => store.tags.get(id)!).sort((a, b) => a.name.localeCompare(b.name));
    },
  };

  return {
    tagsService,
    TagNotFoundError,
    TagNameConflictError,
    TagAssignmentEntityNotFoundError,
    TagAssignmentConflictError,
  };
});

describe('tags routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.tags.clear();
    store.assignments.clear();
    store.tags.set('tag_a', {
      id: 'tag_a',
      name: 'Alpha',
      color: null,
      kind: 'general',
      created_at: '2026-04-01T10:00:00.000Z',
    });
    store.tags.set('tag_b', {
      id: 'tag_b',
      name: 'Beta',
      color: '#123456',
      kind: 'vertical',
      created_at: '2026-04-01T10:00:00.000Z',
    });
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_tag_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/tags' },
      { method: 'POST', url: '/tags', payload: { name: 'New Tag' } },
      { method: 'GET', url: '/tags/tag_a' },
      { method: 'PATCH', url: '/tags/tag_a', payload: { name: 'Renamed' } },
      { method: 'DELETE', url: '/tags/tag_a' },
      {
        method: 'POST',
        url: '/tags/assign',
        payload: { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' },
      },
      {
        method: 'POST',
        url: '/tags/unassign',
        payload: { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' },
      },
      { method: 'GET', url: '/tags/by-entity?entity_type=company&entity_id=company_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('GET /tags lista con filtros', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/tags?kind=vertical&q=bet' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      expect.objectContaining({ id: 'tag_b', name: 'Beta', kind: 'vertical' }),
    ]);
  });

  it('POST /tags crea y GET /:id devuelve la tag', async () => {
    const created = await authInject(app, token, {
      method: 'POST',
      url: '/tags',
      payload: { name: 'Persona', kind: 'persona', color: '#ABCDEF' },
    });

    expect(created.statusCode).toBe(201);
    const dto = created.json<{ id: string }>();

    const fetched = await authInject(app, token, { method: 'GET', url: `/tags/${dto.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(created.json());
  });

  it('POST /tags devuelve 409 si el nombre ya existe', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/tags',
      payload: { name: 'Alpha' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('GET /tags/:id devuelve 404 si no existe', async () => {
    const res = await authInject(app, token, { method: 'GET', url: '/tags/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('PATCH /tags/:id actualiza la tag', async () => {
    const res = await authInject(app, token, {
      method: 'PATCH',
      url: '/tags/tag_a',
      payload: { kind: 'service_interest', name: 'Alpha Prime' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Alpha Prime', kind: 'service_interest' });
  });

  it('DELETE /tags/:id devuelve 204', async () => {
    const res = await authInject(app, token, { method: 'DELETE', url: '/tags/tag_a' });
    expect(res.statusCode).toBe(204);
  });

  it('assign y unassign idempotente funcionan', async () => {
    const assigned = await authInject(app, token, {
      method: 'POST',
      url: '/tags/assign',
      payload: { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' },
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json()).toMatchObject({ id: 'tag_a' });

    const byEntity = await authInject(app, token, {
      method: 'GET',
      url: '/tags/by-entity?entity_type=company&entity_id=company_1',
    });
    expect(byEntity.statusCode).toBe(200);
    expect(byEntity.json()).toEqual([expect.objectContaining({ id: 'tag_a' })]);

    const firstUnassign = await authInject(app, token, {
      method: 'POST',
      url: '/tags/unassign',
      payload: { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' },
    });
    const secondUnassign = await authInject(app, token, {
      method: 'POST',
      url: '/tags/unassign',
      payload: { tag_id: 'tag_a', entity_type: 'company', entity_id: 'company_1' },
    });

    expect(firstUnassign.statusCode).toBe(204);
    expect(secondUnassign.statusCode).toBe(204);
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
