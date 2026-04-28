import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_lead_routes',
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

interface LeadDto {
  id: string;
  companyId: string;
  primaryContactId: string | null;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  source: 'manual' | 'csv_import' | 'enrichment' | 'n8n_webhook' | 'other';
  status: 'open' | 'won' | 'lost' | 'archived';
  priorityScore: number;
  priorityManual: number | null;
  nextActionAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface Store {
  leads: Map<string, LeadDto>;
}

const store: Store = {
  leads: new Map(),
};

vi.mock('../../modules/leads/index.js', () => {
  class LeadNotFoundError extends Error {
    constructor(id: string) {
      super(`Lead "${id}" no encontrado`);
      this.name = 'LeadNotFoundError';
    }
  }

  class LeadCompanyMismatchError extends Error {
    constructor(contactId: string, companyId: string) {
      super(`El contacto "${contactId}" no pertenece a la empresa "${companyId}"`);
      this.name = 'LeadCompanyMismatchError';
    }
  }

  class StageNotInPipelineError extends Error {
    constructor(stageId: string, pipelineId: string) {
      super(`El stage "${stageId}" no pertenece al pipeline "${pipelineId}"`);
      this.name = 'StageNotInPipelineError';
    }
  }

  class InvalidLeadTransitionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InvalidLeadTransitionError';
    }
  }

  const createLeadSchema = z.object({
    companyId: z.string().min(1),
    pipelineId: z.string().min(1),
    stageId: z.string().min(1),
    ownerId: z.string().min(1),
    primaryContactId: z.string().min(1).optional(),
    source: z
      .enum(['manual', 'csv_import', 'enrichment', 'n8n_webhook', 'other'])
      .default('manual'),
    priorityManual: z.number().int().min(0).max(100).optional(),
    nextActionAt: z.string().datetime().optional(),
  });

  const updateLeadSchema = z.object({
    companyId: z.string().min(1).optional(),
    pipelineId: z.string().min(1).optional(),
    stageId: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
    primaryContactId: z.string().min(1).optional(),
    source: z.enum(['manual', 'csv_import', 'enrichment', 'n8n_webhook', 'other']).optional(),
    priorityManual: z.number().int().min(0).max(100).optional(),
    nextActionAt: z.string().datetime().optional(),
    status: z.enum(['open', 'won', 'lost']).optional(),
    lostReason: z.string().min(1).max(500).optional(),
  });

  const listLeadsQuerySchema = z.object({
    stageId: z.string().min(1).optional(),
    pipelineId: z.string().min(1).optional(),
    ownerId: z.string().min(1).optional(),
    status: z.enum(['open', 'won', 'lost']).optional(),
    priorityMin: z.coerce.number().int().min(0).max(100).optional(),
    companyId: z.string().min(1).optional(),
    q: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  });

  const lostLeadSchema = z.object({
    lostReason: z.string().min(1).max(500),
  });

  const leadsService = {
    async list(query: { page: number; pageSize: number; q?: string; status?: string }) {
      const active = [...store.leads.values()].filter((lead) => lead.deletedAt === null);
      const filtered = active.filter((lead) => {
        if (query.status && lead.status !== query.status) return false;
        if (query.q && !lead.id.toLowerCase().includes(query.q.toLowerCase())) return false;
        return true;
      });
      const start = (query.page - 1) * query.pageSize;
      return {
        items: filtered.slice(start, start + query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        total: filtered.length,
      };
    },
    async getById(id: string) {
      const row = store.leads.get(id);
      if (!row || row.deletedAt !== null) throw new LeadNotFoundError(id);
      return row;
    },
    async create(
      input: {
        companyId: string;
        pipelineId: string;
        stageId: string;
        ownerId: string;
        primaryContactId?: string;
        source: LeadDto['source'];
        priorityManual?: number;
        nextActionAt?: string;
      },
      actor: PublicUserDto,
    ) {
      const now = new Date().toISOString();
      const row: LeadDto = {
        id: `lead_${store.leads.size + 1}`,
        companyId: input.companyId,
        primaryContactId: input.primaryContactId ?? null,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        ownerId: input.ownerId,
        source: input.source,
        status: 'open',
        priorityScore: input.priorityManual ?? 0,
        priorityManual: input.priorityManual ?? null,
        nextActionAt: input.nextActionAt ?? null,
        lostReason: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      void actor;
      store.leads.set(row.id, row);
      return row;
    },
    async update(
      id: string,
      patch: Partial<LeadDto> & { pipelineId?: string },
      actor: PublicUserDto,
    ) {
      void actor;
      const row = store.leads.get(id);
      if (!row || row.deletedAt !== null) throw new LeadNotFoundError(id);
      if (patch.pipelineId && patch.pipelineId !== row.pipelineId) {
        throw new InvalidLeadTransitionError('No se permite cambiar de pipeline en v1');
      }
      if (patch.stageId !== undefined) row.stageId = patch.stageId;
      if (patch.ownerId !== undefined) row.ownerId = patch.ownerId;
      if (patch.priorityManual !== undefined) row.priorityManual = patch.priorityManual;
      if (patch.status !== undefined) row.status = patch.status;
      row.updatedAt = new Date().toISOString();
      return row;
    },
    async markWon(id: string, actor: PublicUserDto) {
      void actor;
      const row = store.leads.get(id);
      if (!row || row.deletedAt !== null) throw new LeadNotFoundError(id);
      row.status = 'won';
      row.stageId = 'stage_won_1';
      row.updatedAt = new Date().toISOString();
      return row;
    },
    async markLost(id: string, lostReason: string, actor: PublicUserDto) {
      void actor;
      const row = store.leads.get(id);
      if (!row || row.deletedAt !== null) throw new LeadNotFoundError(id);
      row.status = 'lost';
      row.stageId = 'stage_lost_1';
      row.lostReason = lostReason;
      row.updatedAt = new Date().toISOString();
      return row;
    },
    async softDelete(id: string, actor: PublicUserDto) {
      void actor;
      const row = store.leads.get(id);
      if (!row || row.deletedAt !== null) throw new LeadNotFoundError(id);
      row.deletedAt = new Date().toISOString();
      row.updatedAt = row.deletedAt;
    },
  };

  return {
    createLeadSchema,
    updateLeadSchema,
    listLeadsQuerySchema,
    lostLeadSchema,
    leadsService,
    LeadNotFoundError,
    LeadCompanyMismatchError,
    StageNotInPipelineError,
    InvalidLeadTransitionError,
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

describe('leads routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.leads.clear();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_lead_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/leads' },
      { method: 'POST', url: '/leads', payload: { companyId: 'company_1' } },
      { method: 'GET', url: '/leads/lead_1' },
      { method: 'PATCH', url: '/leads/lead_1', payload: { ownerId: 'user_2' } },
      { method: 'POST', url: '/leads/lead_1/won' },
      { method: 'POST', url: '/leads/lead_1/lost', payload: { lostReason: 'No fit' } },
      { method: 'DELETE', url: '/leads/lead_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('GET /leads devuelve 200', async () => {
    await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, { method: 'GET', url: '/leads?page=1&pageSize=25' });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: Array<{ companyId: string }> }>()).toMatchObject({
      items: [{ companyId: 'company_1' }],
    });
  });

  it('POST /leads devuelve 201', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/leads',
      payload: {
        companyId: 'company_1',
        pipelineId: 'pipeline_1',
        stageId: 'stage_open_1',
        ownerId: 'user_1',
        source: 'manual',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
    });
  });

  it('GET /leads/:id devuelve 200 y 404 si no existe', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const ok = await authInject(app, token, { method: 'GET', url: `/leads/${created.id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ id: created.id });

    const missing = await authInject(app, token, { method: 'GET', url: '/leads/missing' });
    expect(missing.statusCode).toBe(404);
  });

  it('PATCH /leads/:id devuelve 200', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/leads/${created.id}`,
      payload: { ownerId: 'user_2', priorityManual: 80, status: 'open' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ownerId: 'user_2', priorityManual: 80 });
  });

  it('POST /leads/:id/won devuelve 200', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, {
      method: 'POST',
      url: `/leads/${created.id}/won`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'won', stageId: 'stage_won_1' });
  });

  it('POST /leads/:id/lost devuelve 200', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, {
      method: 'POST',
      url: `/leads/${created.id}/lost`,
      payload: { lostReason: 'No fit' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'lost',
      stageId: 'stage_lost_1',
      lostReason: 'No fit',
    });
  });

  it('DELETE /leads/:id devuelve 204', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, {
      method: 'DELETE',
      url: `/leads/${created.id}`,
    });

    expect(res.statusCode).toBe(204);
  });

  it('PATCH /leads/:id devuelve 409 en pipeline change', async () => {
    const created = await createLead(app, token, {
      companyId: 'company_1',
      pipelineId: 'pipeline_1',
      stageId: 'stage_open_1',
      ownerId: 'user_1',
      source: 'manual',
    });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/leads/${created.id}`,
      payload: { pipelineId: 'pipeline_2' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

async function createLead(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await authInject(app, token, { method: 'POST', url: '/leads', payload });
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
