import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  CalendarEventCreateInput,
  CalendarEventDto,
  CalendarEventListQuery,
  CalendarEventUpdateInput,
} from '../../modules/calendar/index.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_calendar_admin',
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
  events: Map<string, CalendarEventDto>;
}

const store: Store = {
  events: new Map(),
};

vi.mock('../../modules/calendar/service.js', () => {
  class CalendarEventNotFoundError extends Error {
    constructor(id: string) {
      super(`Evento de calendario "${id}" no encontrado`);
      this.name = 'CalendarEventNotFoundError';
    }
  }

  class CalendarRelatedEntityNotFoundError extends Error {
    constructor(entityType: string, entityId: string) {
      super(`Entidad "${entityType}" con id "${entityId}" no encontrada`);
      this.name = 'CalendarRelatedEntityNotFoundError';
    }
  }

  class ForbiddenError extends Error {
    readonly statusCode = 403;

    constructor(message = 'FORBIDDEN') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }

  const calendarService = {
    async list(query: CalendarEventListQuery) {
      return [...store.events.values()].filter((row) => {
        if (row.ends_at < query.from) return false;
        if (row.starts_at > query.to) return false;
        if (query.visibility === 'personal' && row.visibility !== 'personal') return false;
        if (query.visibility === 'general' && row.visibility !== 'general') return false;
        return true;
      });
    },
    async create(input: CalendarEventCreateInput, createdById: string) {
      if (input.related_entity_id === 'missing_entity') {
        throw new CalendarRelatedEntityNotFoundError(
          input.related_entity_type ?? 'lead',
          'missing_entity',
        );
      }

      const now = new Date().toISOString();
      const row: CalendarEventDto = {
        id: `calendar_${store.events.size + 1}`,
        owner_id: input.visibility === 'personal' ? createdById : null,
        created_by_id: createdById,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        starts_at: input.all_day
          ? `${input.starts_at.slice(0, 10)}T00:00:00.000Z`
          : input.starts_at,
        ends_at: input.all_day ? `${input.ends_at.slice(0, 10)}T00:00:00.000Z` : input.ends_at,
        all_day: input.all_day,
        visibility: input.visibility,
        related_entity_type: input.related_entity_type ?? null,
        related_entity_id: input.related_entity_id ?? null,
        color: input.color ?? null,
        created_at: now,
        updated_at: now,
      };
      store.events.set(row.id, row);
      return row;
    },
    async update(id: string, patch: CalendarEventUpdateInput) {
      const row = store.events.get(id);
      if (!row) throw new CalendarEventNotFoundError(id);
      if (id === 'forbidden_event') throw new ForbiddenError();

      const updated: CalendarEventDto = {
        ...row,
        title: patch.title ?? row.title,
        description: patch.description ?? row.description,
        location: patch.location ?? row.location,
        starts_at: patch.starts_at ?? row.starts_at,
        ends_at: patch.ends_at ?? row.ends_at,
        all_day: patch.all_day ?? row.all_day,
        visibility: patch.visibility ?? row.visibility,
        related_entity_type: patch.related_entity_type ?? row.related_entity_type,
        related_entity_id: patch.related_entity_id ?? row.related_entity_id,
        color: patch.color ?? row.color,
        updated_at: new Date().toISOString(),
      };
      store.events.set(id, updated);
      return updated;
    },
    async softDelete(id: string) {
      if (id === 'forbidden_event') throw new ForbiddenError();
      if (!store.events.has(id)) throw new CalendarEventNotFoundError(id);
      store.events.delete(id);
    },
  };

  return {
    calendarService,
    CalendarEventNotFoundError,
    CalendarRelatedEntityNotFoundError,
    ForbiddenError,
  };
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

describe('calendar routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.events.clear();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_calendar_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      {
        method: 'GET',
        url: '/calendar/events?from=2026-05-05T00:00:00.000Z&to=2026-05-05T23:59:59.000Z&visibility=both',
      },
      {
        method: 'POST',
        url: '/calendar/events',
        payload: {
          title: 'Sin auth',
          starts_at: '2026-05-05T09:00:00.000Z',
          ends_at: '2026-05-05T10:00:00.000Z',
          visibility: 'personal',
        },
      },
      { method: 'PATCH', url: '/calendar/events/calendar_1', payload: { title: 'No auth' } },
      { method: 'DELETE', url: '/calendar/events/calendar_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('GET /calendar/events devuelve 200 con { data }', async () => {
    store.events.set('calendar_1', {
      id: 'calendar_1',
      owner_id: ADMIN.id,
      created_by_id: ADMIN.id,
      title: 'Evento',
      description: null,
      location: null,
      starts_at: '2026-05-05T09:00:00.000Z',
      ends_at: '2026-05-05T10:00:00.000Z',
      all_day: false,
      visibility: 'personal',
      related_entity_type: null,
      related_entity_id: null,
      color: null,
      created_at: '2026-05-04T09:00:00.000Z',
      updated_at: '2026-05-04T09:00:00.000Z',
    });

    const res = await authInject(app, token, {
      method: 'GET',
      url: '/calendar/events?from=2026-05-05T00:00:00.000Z&to=2026-05-05T23:59:59.000Z&visibility=both',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [store.events.get('calendar_1')] });
  });

  it('POST crea evento personal', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/calendar/events',
      payload: {
        title: 'Llamada',
        starts_at: '2026-05-05T09:00:00.000Z',
        ends_at: '2026-05-05T10:00:00.000Z',
        all_day: false,
        visibility: 'personal',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      created_by_id: ADMIN.id,
      owner_id: ADMIN.id,
      visibility: 'personal',
    });
  });

  it('PATCH devuelve 403 ante violación RBAC', async () => {
    store.events.set('forbidden_event', {
      id: 'forbidden_event',
      owner_id: 'user_alba',
      created_by_id: 'user_alba',
      title: 'Privado',
      description: null,
      location: null,
      starts_at: '2026-05-05T09:00:00.000Z',
      ends_at: '2026-05-05T10:00:00.000Z',
      all_day: false,
      visibility: 'personal',
      related_entity_type: null,
      related_entity_id: null,
      color: null,
      created_at: '2026-05-04T09:00:00.000Z',
      updated_at: '2026-05-04T09:00:00.000Z',
    });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: '/calendar/events/forbidden_event',
      payload: { title: 'Bloqueado' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('DELETE devuelve 403 ante violación RBAC', async () => {
    store.events.set('forbidden_event', {
      id: 'forbidden_event',
      owner_id: null,
      created_by_id: 'user_alba',
      title: 'General',
      description: null,
      location: null,
      starts_at: '2026-05-05T09:00:00.000Z',
      ends_at: '2026-05-05T10:00:00.000Z',
      all_day: false,
      visibility: 'general',
      related_entity_type: null,
      related_entity_id: null,
      color: null,
      created_at: '2026-05-04T09:00:00.000Z',
      updated_at: '2026-05-04T09:00:00.000Z',
    });

    const res = await authInject(app, token, {
      method: 'DELETE',
      url: '/calendar/events/forbidden_event',
    });

    expect(res.statusCode).toBe(403);
  });

  it('404 cuando el evento no existe', async () => {
    const res = await authInject(app, token, {
      method: 'PATCH',
      url: '/calendar/events/missing_event',
      payload: { title: 'Nada' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('400 cuando falla la validación Zod del payload', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/calendar/events',
      payload: {
        title: '',
        starts_at: '2026-05-05T10:00:00.000Z',
        ends_at: '2026-05-05T09:00:00.000Z',
        all_day: false,
        visibility: 'personal',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

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
