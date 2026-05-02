import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import type {
  ContentPillarDto,
  PainPointCategoryDto,
  ServiceLineDto,
} from '../../modules/taxonomies/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_admin_tax',
  email: 'admin@heyday.test',
  name: 'Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'user_op_tax',
  email: 'op@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const SAMPLE_PPC: PainPointCategoryDto = {
  id: 'ppc_001',
  key: 'cash_flow',
  labelEs: 'Flujo de caja',
  descriptionEs: 'Problemas de tesorería',
  defaultServiceRecommendations: [],
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SAMPLE_SL: ServiceLineDto = {
  id: 'sl_001',
  key: 'contabilidad',
  labelEs: 'Contabilidad',
  descriptionEs: 'Servicios de contabilidad',
  subCapabilities: [],
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const SAMPLE_CP: ContentPillarDto = {
  id: 'cp_001',
  key: 'educacion',
  labelEs: 'Educación',
  descriptionEs: 'Contenido educativo',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const {
  getUserForTokenMock,
  listPainPointCategoriesMock,
  createPainPointCategoryMock,
  updatePainPointCategoryMock,
  listServiceLinesMock,
  createServiceLineMock,
  updateServiceLineMock,
  listContentPillarsMock,
  createContentPillarMock,
  updateContentPillarMock,
  MockTaxonomyNotFoundError,
  MockTaxonomyConflictError,
} = vi.hoisted(() => ({
  getUserForTokenMock: vi.fn(),
  listPainPointCategoriesMock: vi.fn(),
  createPainPointCategoryMock: vi.fn(),
  updatePainPointCategoryMock: vi.fn(),
  listServiceLinesMock: vi.fn(),
  createServiceLineMock: vi.fn(),
  updateServiceLineMock: vi.fn(),
  listContentPillarsMock: vi.fn(),
  createContentPillarMock: vi.fn(),
  updateContentPillarMock: vi.fn(),
  MockTaxonomyNotFoundError: class extends Error {
    readonly code = 'TAXONOMY_NOT_FOUND';
    constructor(entity: string, id: string) {
      super(`${entity} '${id}' no encontrado`);
      this.name = 'TaxonomyNotFoundError';
    }
  },
  MockTaxonomyConflictError: class extends Error {
    readonly code = 'TAXONOMY_CONFLICT';
    constructor(entity: string, key: string) {
      super(`Ya existe un ${entity} con key '${key}'`);
      this.name = 'TaxonomyConflictError';
    }
  },
}));

vi.mock('../../modules/auth/service.js', () => ({
  authService: { getUserForToken: getUserForTokenMock },
}));

vi.mock('../../modules/taxonomies/index.js', () => ({
  TaxonomyNotFoundError: MockTaxonomyNotFoundError,
  TaxonomyConflictError: MockTaxonomyConflictError,
  taxonomiesService: {
    listPainPointCategories: listPainPointCategoriesMock,
    createPainPointCategory: createPainPointCategoryMock,
    updatePainPointCategory: updatePainPointCategoryMock,
    listServiceLines: listServiceLinesMock,
    createServiceLine: createServiceLineMock,
    updateServiceLine: updateServiceLineMock,
    listContentPillars: listContentPillarsMock,
    createContentPillar: createContentPillarMock,
    updateContentPillar: updateContentPillarMock,
  },
}));

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerTaxonomiesRoutes } = await import('./taxonomies.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((m) => m.default));
  await app.register(authPlugin);
  await registerTaxonomiesRoutes(app);
  registerErrorHandler(app);
  return app;
}

function toHttp<T extends { createdAt: Date; updatedAt: Date }>(dto: T) {
  return { ...dto, createdAt: dto.createdAt.toISOString(), updatedAt: dto.updatedAt.toISOString() };
}

describe('taxonomies routes', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getUserForTokenMock.mockImplementation(async (payload: { sub: string }) =>
      payload.sub === ADMIN.id ? ADMIN : OPERATOR,
    );
    listPainPointCategoriesMock.mockResolvedValue([SAMPLE_PPC]);
    createPainPointCategoryMock.mockResolvedValue(SAMPLE_PPC);
    updatePainPointCategoryMock.mockResolvedValue(SAMPLE_PPC);
    listServiceLinesMock.mockResolvedValue([SAMPLE_SL]);
    createServiceLineMock.mockResolvedValue(SAMPLE_SL);
    updateServiceLineMock.mockResolvedValue(SAMPLE_SL);
    listContentPillarsMock.mockResolvedValue([SAMPLE_CP]);
    createContentPillarMock.mockResolvedValue(SAMPLE_CP);
    updateContentPillarMock.mockResolvedValue(SAMPLE_CP);

    app = await buildTestApp();
    adminToken = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_admin_tax' });
    operatorToken = signAccessToken({ sub: OPERATOR.id, role: 'operator', sid: 'ses_op_tax' });
  });

  afterEach(async () => {
    await app.close();
  });

  // PainPointCategory
  it('GET /intel/taxonomies/pain-points -> 200 (operator)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/taxonomies/pain-points',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([toHttp(SAMPLE_PPC)]);
  });

  it('GET /intel/taxonomies/pain-points -> 401 sin token', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/taxonomies/pain-points' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /intel/taxonomies/pain-points -> 201 (admin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/taxonomies/pain-points',
      payload: { key: 'cash_flow', labelEs: 'Flujo de caja', descriptionEs: 'Desc' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ key: 'cash_flow' });
  });

  it('POST /intel/taxonomies/pain-points -> 403 (operator)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/taxonomies/pain-points',
      payload: { key: 'cash_flow', labelEs: 'x', descriptionEs: 'y' },
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /intel/taxonomies/pain-points -> 409 key duplicada', async () => {
    createPainPointCategoryMock.mockRejectedValueOnce(
      new MockTaxonomyConflictError('PainPointCategory', 'cash_flow'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/intel/taxonomies/pain-points',
      payload: { key: 'cash_flow', labelEs: 'x', descriptionEs: 'y' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH /intel/taxonomies/pain-points/:id -> 200 (admin)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/intel/taxonomies/pain-points/ppc_001',
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PATCH /intel/taxonomies/pain-points/:id -> 404 not found', async () => {
    updatePainPointCategoryMock.mockRejectedValueOnce(
      new MockTaxonomyNotFoundError('PainPointCategory', 'missing'),
    );
    const res = await app.inject({
      method: 'PATCH',
      url: '/intel/taxonomies/pain-points/missing',
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ServiceLine
  it('GET /intel/service-lines -> 200 (operator)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/service-lines',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([toHttp(SAMPLE_SL)]);
  });

  it('POST /intel/service-lines -> 201 (admin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/service-lines',
      payload: { key: 'contabilidad', labelEs: 'Contabilidad', descriptionEs: 'Desc' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it('PATCH /intel/service-lines/:id -> 404', async () => {
    updateServiceLineMock.mockRejectedValueOnce(
      new MockTaxonomyNotFoundError('ServiceLine', 'missing'),
    );
    const res = await app.inject({
      method: 'PATCH',
      url: '/intel/service-lines/missing',
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // ContentPillar
  it('GET /content/pillars -> 200 (operator)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/pillars',
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([toHttp(SAMPLE_CP)]);
  });

  it('POST /content/pillars -> 201 (admin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/content/pillars',
      payload: { key: 'educacion', labelEs: 'Educación', descriptionEs: 'Desc' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /content/pillars -> 409 key duplicada', async () => {
    createContentPillarMock.mockRejectedValueOnce(
      new MockTaxonomyConflictError('ContentPillar', 'educacion'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/content/pillars',
      payload: { key: 'educacion', labelEs: 'x', descriptionEs: 'y' },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH /content/pillars/:id -> 200 (admin)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/content/pillars/cp_001',
      payload: { isActive: false },
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
