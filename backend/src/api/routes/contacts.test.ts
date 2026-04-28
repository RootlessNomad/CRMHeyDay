import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  ContactCreateInput,
  ContactDto,
  ContactListQuery,
  ContactUpdateInput,
} from '../../modules/contacts/schemas.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_contact_routes',
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
  contacts: Map<string, ContactDto & { deleted_at: string | null }>;
  companies: Set<string>;
}

const store: Store = {
  contacts: new Map(),
  companies: new Set(['company_1', 'company_2']),
};

vi.mock('../../modules/contacts/service.js', () => {
  class ContactNotFoundError extends Error {
    constructor(id: string, message = `Contacto "${id}" no encontrado`) {
      super(message);
      this.name = 'ContactNotFoundError';
    }
  }

  class ContactPrimaryConflictError extends Error {
    constructor(companyId: string) {
      super(`Ya existe un contacto principal activo para la empresa "${companyId}"`);
      this.name = 'ContactPrimaryConflictError';
    }
  }

  class ContactCompanyNotFoundError extends Error {
    constructor(companyId: string) {
      super(`Empresa "${companyId}" no encontrada`);
      this.name = 'ContactCompanyNotFoundError';
    }
  }

  function publicDto(row: ContactDto & { deleted_at: string | null }): ContactDto {
    const { deleted_at: _deletedAt, ...dto } = row;
    return dto;
  }

  function activeContacts() {
    return [...store.contacts.values()].filter((row) => row.deleted_at === null);
  }

  function unmarkOtherPrimaries(companyId: string, excludeId?: string) {
    for (const row of activeContacts()) {
      if (row.company_id !== companyId || row.id === excludeId || !row.is_primary) continue;
      row.is_primary = false;
      row.updated_at = new Date().toISOString();
    }
  }

  const contactsService = {
    async list(query: ContactListQuery) {
      const filtered = activeContacts().filter((row) => {
        if (query.q) {
          const q = query.q.toLowerCase();
          const haystack = [row.first_name, row.last_name ?? '', row.email ?? '']
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (query.company_id && row.company_id !== query.company_id) return false;
        if (query.is_primary !== undefined && row.is_primary !== query.is_primary) return false;
        return true;
      });
      filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      const start = (query.page - 1) * query.pageSize;
      return {
        items: filtered.slice(start, start + query.pageSize).map(publicDto),
        page: query.page,
        pageSize: query.pageSize,
        total: filtered.length,
      };
    },
    async getById(id: string) {
      const row = store.contacts.get(id);
      if (!row || row.deleted_at !== null) throw new ContactNotFoundError(id);
      return publicDto(row);
    },
    async create(input: ContactCreateInput, createdById: string) {
      if (input.company_id && !store.companies.has(input.company_id)) {
        throw new ContactCompanyNotFoundError(input.company_id);
      }
      if (input.is_primary && input.company_id) unmarkOtherPrimaries(input.company_id);

      const now = new Date().toISOString();
      const row: ContactDto & { deleted_at: string | null } = {
        id: `contact_${store.contacts.size + 1}`,
        company_id: input.company_id ?? null,
        first_name: input.first_name,
        last_name: input.last_name ?? null,
        role_title: input.role_title ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        linkedin_url: input.linkedin_url ?? null,
        is_primary: input.is_primary,
        consent_status: input.consent_status,
        created_by_id: createdById,
        created_at: now,
        updated_at: now,
        anonymized_at: null,
        deleted_at: null,
      };
      store.contacts.set(row.id, row);
      return publicDto(row);
    },
    async update(id: string, patch: ContactUpdateInput) {
      const row = store.contacts.get(id);
      if (!row || row.deleted_at !== null) throw new ContactNotFoundError(id);
      if (
        patch.company_id !== undefined &&
        patch.company_id !== null &&
        !store.companies.has(patch.company_id)
      ) {
        throw new ContactCompanyNotFoundError(patch.company_id);
      }

      const nextCompanyId = patch.company_id !== undefined ? patch.company_id : row.company_id;
      const nextPrimary = patch.is_primary !== undefined ? patch.is_primary : row.is_primary;
      if (
        nextPrimary &&
        nextCompanyId &&
        (patch.is_primary === true || patch.company_id !== undefined)
      ) {
        unmarkOtherPrimaries(nextCompanyId, id);
      }

      if (patch.first_name !== undefined) row.first_name = patch.first_name;
      if (patch.last_name !== undefined) row.last_name = patch.last_name;
      if (patch.role_title !== undefined) row.role_title = patch.role_title;
      if (patch.email !== undefined) row.email = patch.email;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp;
      if (patch.linkedin_url !== undefined) row.linkedin_url = patch.linkedin_url;
      if (patch.company_id !== undefined) row.company_id = patch.company_id;
      if (patch.is_primary !== undefined) row.is_primary = patch.is_primary;
      if (patch.consent_status !== undefined) row.consent_status = patch.consent_status;
      row.updated_at = new Date().toISOString();
      return publicDto(row);
    },
    async softDelete(id: string) {
      const row = store.contacts.get(id);
      if (!row || row.deleted_at !== null) throw new ContactNotFoundError(id);
      row.deleted_at = new Date().toISOString();
      row.is_primary = false;
      row.updated_at = new Date().toISOString();
    },
    async anonymize(id: string, actorUserId: string, ip: string | null) {
      const row = store.contacts.get(id);
      if (!row || row.deleted_at !== null) throw new ContactNotFoundError(id);
      if (row.anonymized_at) throw new ContactNotFoundError(id, 'Ya anonimizado');
      row.first_name = 'Anonymized';
      row.last_name = `#${id.slice(-6).toUpperCase()}`;
      row.role_title = null;
      row.email = null;
      row.phone = null;
      row.whatsapp = null;
      row.linkedin_url = null;
      row.is_primary = false;
      row.consent_status = 'revoked';
      row.anonymized_at = new Date().toISOString();
      row.updated_at = row.anonymized_at;
      void actorUserId;
      void ip;
      return publicDto(row);
    },
  };

  return {
    contactsService,
    ContactNotFoundError,
    ContactPrimaryConflictError,
    ContactCompanyNotFoundError,
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

describe('contacts routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.contacts.clear();
    store.companies.clear();
    store.companies.add('company_1');
    store.companies.add('company_2');
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_contact_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/contacts' },
      { method: 'POST', url: '/contacts', payload: { first_name: 'No Auth' } },
      { method: 'GET', url: '/contacts/contact_1' },
      { method: 'PATCH', url: '/contacts/contact_1', payload: { first_name: 'No Auth' } },
      { method: 'DELETE', url: '/contacts/contact_1' },
      { method: 'POST', url: '/contacts/contact_1/anonymize' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('POST crea contacto y GET /:id devuelve el mismo DTO', async () => {
    const created = await authInject(app, token, {
      method: 'POST',
      url: '/contacts',
      payload: {
        first_name: 'Alex',
        email: 'alex@heyday.test',
        company_id: 'company_1',
      },
    });

    expect(created.statusCode).toBe(201);
    const dto = created.json<{ id: string; created_by_id: string; company_id: string | null }>();
    expect(dto.company_id).toBe('company_1');
    expect(dto.created_by_id).toBe(ADMIN.id);

    const fetched = await authInject(app, token, { method: 'GET', url: `/contacts/${dto.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(created.json());
  });

  it('GET /contacts filtra por q, company_id, is_primary y pagina', async () => {
    for (let i = 0; i < 15; i++) {
      await createContact(app, token, {
        first_name: `Route ${i}`,
        last_name: i % 2 === 0 ? 'Needle' : 'Other',
        email: `route-${i}@heyday.test`,
        company_id: i % 2 === 0 ? 'company_1' : 'company_2',
        is_primary: i % 5 === 0,
      });
    }

    const filtered = await authInject(app, token, {
      method: 'GET',
      url: '/contacts?q=needle&company_id=company_1&is_primary=true&page=1&pageSize=10',
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json<{
      total: number;
      items: Array<{ last_name: string | null }>;
    }>();
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.items.every((item) => item.last_name === 'Needle')).toBe(true);

    const paged = await authInject(app, token, {
      method: 'GET',
      url: '/contacts?page=2&pageSize=10',
    });
    const pagedBody = paged.json<{ page: number; pageSize: number; items: unknown[] }>();
    expect(pagedBody.page).toBe(2);
    expect(pagedBody.pageSize).toBe(10);
    expect(pagedBody.items).toHaveLength(5);
  });

  it('PATCH actualiza campos y reasigna primario', async () => {
    const first = await createContact(app, token, {
      first_name: 'First',
      company_id: 'company_1',
      is_primary: true,
    });
    const second = await createContact(app, token, {
      first_name: 'Second',
      company_id: 'company_1',
      is_primary: false,
    });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/contacts/${second.id}`,
      payload: { first_name: 'Updated', is_primary: true },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ first_name: 'Updated', is_primary: true });
    expect(store.contacts.get(first.id)?.is_primary).toBe(false);
  });

  it('DELETE oculta el contacto y es 404 en segundo delete/get/list', async () => {
    const created = await createContact(app, token, {
      first_name: 'Delete Route',
      company_id: 'company_1',
      is_primary: true,
    });

    const firstDelete = await authInject(app, token, {
      method: 'DELETE',
      url: `/contacts/${created.id}`,
    });
    expect(firstDelete.statusCode).toBe(204);

    const secondDelete = await authInject(app, token, {
      method: 'DELETE',
      url: `/contacts/${created.id}`,
    });
    expect(secondDelete.statusCode).toBe(404);

    const getDeleted = await authInject(app, token, {
      method: 'GET',
      url: `/contacts/${created.id}`,
    });
    expect(getDeleted.statusCode).toBe(404);

    const list = await authInject(app, token, { method: 'GET', url: '/contacts' });
    const body = list.json<{ items: Array<{ id: string }> }>();
    expect(body.items.some((item) => item.id === created.id)).toBe(false);
    expect(store.contacts.get(created.id)?.is_primary).toBe(false);
  });

  it('POST /contacts/:id/anonymize devuelve 200 y elimina PII en la respuesta', async () => {
    const created = await createContact(app, token, {
      first_name: 'Marina',
      last_name: 'Costa',
      role_title: 'CEO',
      email: 'marina@heyday.test',
      phone: '+34999999999',
      whatsapp: '+34999999999',
      linkedin_url: 'https://linkedin.com/in/marina-costa',
      company_id: 'company_1',
      is_primary: true,
    });

    const res = await authInject(app, token, {
      method: 'POST',
      url: `/contacts/${created.id}/anonymize`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      first_name: 'Anonymized',
      last_name: `#${created.id.slice(-6).toUpperCase()}`,
      role_title: null,
      email: null,
      phone: null,
      whatsapp: null,
      linkedin_url: null,
      is_primary: false,
      consent_status: 'revoked',
    });
  });
});

async function createContact(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await authInject(app, token, { method: 'POST', url: '/contacts', payload });
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
