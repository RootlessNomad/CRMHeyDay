import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  CompanyCreateInput,
  CompanyDto,
  CompanyListQuery,
  CompanyUpdateInput,
} from '../../modules/companies/schemas.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_company_routes',
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
  companies: Map<string, CompanyDto & { deleted_at: string | null }>;
}

const store: Store = { companies: new Map() };

vi.mock('../../modules/companies/service.js', () => {
  class CompanyDomainConflictError extends Error {
    constructor(
      public readonly existingId: string,
      domain: string,
    ) {
      super(`Ya existe una empresa con el dominio "${domain}"`);
      this.name = 'CompanyDomainConflictError';
    }
  }

  class CompanyNotFoundError extends Error {
    constructor(id: string) {
      super(`Empresa "${id}" no encontrada`);
      this.name = 'CompanyNotFoundError';
    }
  }

  function normalizeDomain(input: string | null | undefined): string | null {
    const trimmed = input?.trim();
    if (!trimmed) return null;
    return (
      trimmed
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        ?.trim() || null
    );
  }

  function publicDto(row: CompanyDto & { deleted_at: string | null }): CompanyDto {
    const { deleted_at: _deletedAt, ...dto } = row;
    return dto;
  }

  const companiesService = {
    async list(query: CompanyListQuery) {
      const active = [...store.companies.values()].filter((row) => row.deleted_at === null);
      const filtered = active.filter((row) => {
        if (query.q) {
          const q = query.q.toLowerCase();
          const haystack = [row.name, row.domain ?? '', row.city ?? ''].join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (query.icp_vertical && row.icp_vertical !== query.icp_vertical) return false;
        if (query.city && row.city !== query.city) return false;
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
      const row = store.companies.get(id);
      if (!row || row.deleted_at !== null) throw new CompanyNotFoundError(id);
      return publicDto(row);
    },
    async create(input: CompanyCreateInput, createdById: string) {
      const domain = normalizeDomain(input.domain) ?? normalizeDomain(input.website);
      const existing = [...store.companies.values()].find(
        (row) => row.deleted_at === null && row.domain === domain,
      );
      if (existing && domain) throw new CompanyDomainConflictError(existing.id, domain);
      const now = new Date().toISOString();
      const row: CompanyDto & { deleted_at: string | null } = {
        id: `company_${store.companies.size + 1}`,
        name: input.name,
        website: input.website ?? null,
        domain,
        industry: input.industry ?? null,
        icp_vertical: input.icp_vertical ?? null,
        country: input.country,
        region: input.region ?? null,
        city: input.city ?? null,
        postal_code: input.postal_code ?? null,
        address: input.address ?? null,
        size_signal: input.size_signal ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        whatsapp: input.whatsapp ?? null,
        linkedin_url: input.linkedin_url ?? null,
        instagram_handle: input.instagram_handle ?? null,
        notes: input.notes ?? null,
        created_by_id: createdById,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      store.companies.set(row.id, row);
      return publicDto(row);
    },
    async update(id: string, patch: CompanyUpdateInput) {
      const row = store.companies.get(id);
      if (!row || row.deleted_at !== null) throw new CompanyNotFoundError(id);
      if (patch.domain !== undefined) row.domain = normalizeDomain(patch.domain);
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.city !== undefined) row.city = patch.city;
      if (patch.icp_vertical !== undefined) row.icp_vertical = patch.icp_vertical;
      row.updated_at = new Date().toISOString();
      return publicDto(row);
    },
    async softDelete(id: string) {
      const row = store.companies.get(id);
      if (!row || row.deleted_at !== null) throw new CompanyNotFoundError(id);
      row.deleted_at = new Date().toISOString();
      row.domain = null;
    },
  };

  return { companiesService, CompanyDomainConflictError, CompanyNotFoundError };
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

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerCompaniesRoutes } = await import('./companies.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerCompaniesRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('companies routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.companies.clear();
    app = await buildTestApp();
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_company_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/companies' },
      { method: 'POST', url: '/companies', payload: { name: 'No Auth' } },
      { method: 'GET', url: '/companies/company_1' },
      { method: 'PATCH', url: '/companies/company_1', payload: { name: 'No Auth' } },
      { method: 'DELETE', url: '/companies/company_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('POST crea empresa y GET /:id devuelve el mismo DTO', async () => {
    const created = await authInject(app, token, {
      method: 'POST',
      url: '/companies',
      payload: { name: 'HeyDay', domain: 'https://www.heyday-route.test/' },
    });

    expect(created.statusCode).toBe(201);
    const dto = created.json<{ id: string; domain: string; created_by_id: string }>();
    expect(dto.domain).toBe('heyday-route.test');
    expect(dto.created_by_id).toBe(ADMIN.id);

    const fetched = await authInject(app, token, { method: 'GET', url: `/companies/${dto.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toEqual(dto);
  });

  it('POST con dominio duplicado devuelve 409 COMPANY_DOMAIN_CONFLICT', async () => {
    const first = await createCompany(app, token, { name: 'First', domain: 'dupe-route.test' });

    const duplicate = await authInject(app, token, {
      method: 'POST',
      url: '/companies',
      payload: { name: 'Second', domain: 'https://dupe-route.test/path' },
    });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({
      error: {
        code: 'COMPANY_DOMAIN_CONFLICT',
        details: { existing_id: first.id },
      },
    });
  });

  it('POST con body inválido devuelve 400 VALIDATION_ERROR', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/companies',
      payload: { name: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('PATCH actualiza campos', async () => {
    const created = await createCompany(app, token, {
      name: 'Patch Me',
      domain: 'patch-route.test',
    });
    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/companies/${created.id}`,
      payload: { city: 'Madrid', icp_vertical: 'physiotherapy' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ city: 'Madrid', icp_vertical: 'physiotherapy' });
  });

  it('DELETE oculta la empresa y es 404 en segundo delete/get/list', async () => {
    const created = await createCompany(app, token, {
      name: 'Delete Route',
      domain: 'delete-route.test',
    });

    const firstDelete = await authInject(app, token, {
      method: 'DELETE',
      url: `/companies/${created.id}`,
    });
    expect(firstDelete.statusCode).toBe(204);

    const secondDelete = await authInject(app, token, {
      method: 'DELETE',
      url: `/companies/${created.id}`,
    });
    expect(secondDelete.statusCode).toBe(404);

    const getDeleted = await authInject(app, token, {
      method: 'GET',
      url: `/companies/${created.id}`,
    });
    expect(getDeleted.statusCode).toBe(404);

    const list = await authInject(app, token, { method: 'GET', url: '/companies' });
    const body = list.json<{ items: Array<{ id: string }> }>();
    expect(body.items.some((item) => item.id === created.id)).toBe(false);
  });

  it('GET /companies filtra por q, icp_vertical y pagina', async () => {
    for (let i = 0; i < 15; i++) {
      await createCompany(app, token, {
        name: `Route Batch ${i}`,
        domain: `route-batch-${i}.test`,
        icp_vertical: i % 2 === 0 ? 'physiotherapy' : 'cafe',
        city: i % 3 === 0 ? 'Madrid' : 'Valencia',
      });
    }
    await createCompany(app, token, {
      name: 'Needle Route',
      domain: 'needle-route.test',
      icp_vertical: 'physiotherapy',
      city: 'Madrid',
    });

    const filtered = await authInject(app, token, {
      method: 'GET',
      url: '/companies?q=needle&icp_vertical=physiotherapy&page=1&pageSize=10',
    });
    expect(filtered.statusCode).toBe(200);
    const filteredBody = filtered.json<{ total: number; items: Array<{ name: string }> }>();
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.items[0]?.name).toBe('Needle Route');

    const paged = await authInject(app, token, {
      method: 'GET',
      url: '/companies?page=2&pageSize=10',
    });
    const pagedBody = paged.json<{ page: number; pageSize: number; items: unknown[] }>();
    expect(pagedBody.page).toBe(2);
    expect(pagedBody.pageSize).toBe(10);
    expect(pagedBody.items).toHaveLength(6);
  });
});

async function createCompany(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await authInject(app, token, { method: 'POST', url: '/companies', payload });
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
