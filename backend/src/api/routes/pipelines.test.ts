import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_pipeline_routes',
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

interface PipelineStageDto {
  id: string;
  pipelineId: string;
  name: string;
  orderIndex: number;
  kind: 'open' | 'won' | 'lost';
  color: string | null;
}

interface PipelineDto {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stages: PipelineStageDto[];
}

interface Store {
  pipelines: Map<string, PipelineDto>;
}

const store: Store = {
  pipelines: new Map(),
};

vi.mock('../../modules/pipelines/index.js', () => {
  class PipelineNotFoundError extends Error {
    constructor(id: string) {
      super(`Pipeline "${id}" no encontrado`);
      this.name = 'PipelineNotFoundError';
    }
  }

  class StageNotFoundError extends Error {
    constructor(id: string) {
      super(`Stage "${id}" no encontrado`);
      this.name = 'StageNotFoundError';
    }
  }

  class StageHasLeadsError extends Error {
    constructor(id: string) {
      super(`No se puede eliminar el stage "${id}" porque tiene leads activos`);
      this.name = 'StageHasLeadsError';
    }
  }

  class InvalidStageOrderError extends Error {
    constructor(orderIndex: number) {
      super(`orderIndex inválido: ${orderIndex}`);
      this.name = 'InvalidStageOrderError';
    }
  }

  class InvalidStageKindError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'InvalidStageKindError';
    }
  }

  const createPipelineSchema = z.object({
    name: z.string().min(1).max(100),
  });

  const updatePipelineSchema = z.object({
    name: z.string().min(1).max(100).optional(),
  });

  const createStageSchema = z.object({
    name: z.string().min(1).max(100),
    kind: z.enum(['open', 'won', 'lost']),
    color: z.string().optional(),
    orderIndex: z.number().int().optional(),
  });

  const updateStageSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    color: z.string().optional(),
    orderIndex: z.number().int().optional(),
  });

  function getStage(stageId: string): { pipeline: PipelineDto; stage: PipelineStageDto } | null {
    for (const pipeline of store.pipelines.values()) {
      const stage = pipeline.stages.find((item) => item.id === stageId);
      if (stage) return { pipeline, stage };
    }
    return null;
  }

  const pipelinesService = {
    async list() {
      return [...store.pipelines.values()].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault),
      );
    },
    async create(input: { name: string }) {
      const now = new Date().toISOString();
      const row: PipelineDto = {
        id: `pipeline_${store.pipelines.size + 1}`,
        name: input.name,
        isDefault: store.pipelines.size === 0,
        createdAt: now,
        updatedAt: now,
        stages: [],
      };
      store.pipelines.set(row.id, row);
      return row;
    },
    async update(id: string, patch: { name?: string }) {
      const row = store.pipelines.get(id);
      if (!row) throw new PipelineNotFoundError(id);
      if (patch.name !== undefined) row.name = patch.name;
      row.updatedAt = new Date().toISOString();
      return row;
    },
    async addStage(
      pipelineId: string,
      input: { name: string; kind: 'open' | 'won' | 'lost'; color?: string; orderIndex?: number },
    ) {
      const pipeline = store.pipelines.get(pipelineId);
      if (!pipeline) throw new PipelineNotFoundError(pipelineId);
      const stage: PipelineStageDto = {
        id: `stage_${pipeline.stages.length + 1}`,
        pipelineId,
        name: input.name,
        kind: input.kind,
        color: input.color ?? null,
        orderIndex: input.orderIndex ?? pipeline.stages.length,
      };
      pipeline.stages.push(stage);
      pipeline.stages.sort((a, b) => a.orderIndex - b.orderIndex);
      pipeline.updatedAt = new Date().toISOString();
      return stage;
    },
    async updateStage(id: string, patch: { name?: string; color?: string; orderIndex?: number }) {
      const result = getStage(id);
      if (!result) throw new StageNotFoundError(id);
      const { stage, pipeline } = result;
      if (patch.name !== undefined) stage.name = patch.name;
      if (patch.color !== undefined) stage.color = patch.color;
      if (patch.orderIndex !== undefined) stage.orderIndex = patch.orderIndex;
      pipeline.stages.sort((a, b) => a.orderIndex - b.orderIndex);
      pipeline.updatedAt = new Date().toISOString();
      return stage;
    },
    async deleteStage(id: string) {
      if (id === 'stage_blocked') throw new StageHasLeadsError(id);
      const result = getStage(id);
      if (!result) throw new StageNotFoundError(id);
      result.pipeline.stages = result.pipeline.stages.filter((stage) => stage.id !== id);
      result.pipeline.updatedAt = new Date().toISOString();
    },
  };

  return {
    createPipelineSchema,
    updatePipelineSchema,
    createStageSchema,
    updateStageSchema,
    pipelinesService,
    PipelineNotFoundError,
    StageNotFoundError,
    StageHasLeadsError,
    InvalidStageOrderError,
    InvalidStageKindError,
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

describe('pipelines routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    store.pipelines.clear();
    const server = await import('../server.js');
    app = await server.buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_pipeline_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 sin auth para todos los endpoints', async () => {
    const requests = [
      { method: 'GET', url: '/pipelines' },
      { method: 'POST', url: '/pipelines', payload: { name: 'No Auth' } },
      { method: 'PATCH', url: '/pipelines/pipeline_1', payload: { name: 'No Auth' } },
      {
        method: 'POST',
        url: '/pipelines/pipeline_1/stages',
        payload: { name: 'Stage', kind: 'open' },
      },
      { method: 'PATCH', url: '/pipeline-stages/stage_1', payload: { name: 'Stage' } },
      { method: 'DELETE', url: '/pipeline-stages/stage_1' },
    ] as const;

    for (const request of requests) {
      const res = await app.inject(request);
      expect(res.statusCode).toBe(401);
    }
  });

  it('GET /pipelines devuelve 200', async () => {
    await createPipeline(app, token, { name: 'Sales' });

    const res = await authInject(app, token, { method: 'GET', url: '/pipelines' });

    expect(res.statusCode).toBe(200);
    expect(res.json<Array<{ name: string }>>()).toMatchObject([{ name: 'Sales' }]);
  });

  it('POST /pipelines devuelve 201', async () => {
    const res = await authInject(app, token, {
      method: 'POST',
      url: '/pipelines',
      payload: { name: 'Sales' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Sales', isDefault: true });
  });

  it('PATCH /pipelines/:id devuelve 200', async () => {
    const pipeline = await createPipeline(app, token, { name: 'Before' });

    const res = await authInject(app, token, {
      method: 'PATCH',
      url: `/pipelines/${pipeline.id}`,
      payload: { name: 'After' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: pipeline.id, name: 'After' });
  });

  it('POST /pipelines/:id/stages devuelve 201', async () => {
    const pipeline = await createPipeline(app, token, { name: 'Sales' });

    const res = await authInject(app, token, {
      method: 'POST',
      url: `/pipelines/${pipeline.id}/stages`,
      payload: { name: 'Qualified', kind: 'open', color: '#FF0000' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      pipelineId: pipeline.id,
      name: 'Qualified',
      kind: 'open',
      color: '#FF0000',
    });
  });

  it('DELETE /pipeline-stages/:id devuelve 409 cuando el stage tiene leads', async () => {
    const pipeline = await createPipeline(app, token, { name: 'Sales' });
    store.pipelines.set(pipeline.id, {
      ...store.pipelines.get(pipeline.id)!,
      stages: [
        {
          id: 'stage_blocked',
          pipelineId: pipeline.id,
          name: 'Blocked',
          orderIndex: 0,
          kind: 'open',
          color: null,
        },
      ],
    });

    const res = await authInject(app, token, {
      method: 'DELETE',
      url: '/pipeline-stages/stage_blocked',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

async function createPipeline(
  app: FastifyInstance,
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await authInject(app, token, { method: 'POST', url: '/pipelines', payload });
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
