import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';

const ADMIN: PublicUserDto = {
  id: 'user_intel_routes',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const OPERATOR: PublicUserDto = {
  id: 'user_intel_routes_operator',
  email: 'operator@heyday.test',
  name: 'Operator',
  role: 'operator',
  isActive: true,
  lastLoginAt: null,
};

const createEnrichmentRunMock = vi.fn();
const getEnrichmentRunMock = vi.fn();
const listByCompanyMock = vi.fn();
const bulkImportCsvMock = vi.fn();
const listPainPointsMock = vi.fn();
const createPainPointMock = vi.fn();
const updatePainPointMock = vi.fn();
const deletePainPointMock = vi.fn();
const getUserForTokenMock = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: getUserForTokenMock,
  },
}));

vi.mock('../../modules/intel/index.js', () => ({
  EnrichmentRunCreateSchema: {
    parse: (value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('invalid');
      const body = value as Record<string, unknown>;
      if (!body['companyId'] && !body['inputUrl']) {
        const error = new Error('invalid');
        (error as Error & { statusCode?: number }).statusCode = 400;
        throw error;
      }
      return body;
    },
  },
  BulkImportResultSchema: { parse: (value: unknown) => value },
  EnrichmentRunIdParamsSchema: { parse: (value: unknown) => value as { id: string } },
  CompanyIdParamsSchema: { parse: (value: unknown) => value as { id: string } },
  PainPointListQuerySchema: { parse: (value: unknown) => value },
  PainPointCreateSchema: { parse: (value: unknown) => value },
  PainPointUpdateSchema: { parse: (value: unknown) => value },
  intelService: {
    createEnrichmentRun: createEnrichmentRunMock,
    getEnrichmentRun: getEnrichmentRunMock,
    listByCompany: listByCompanyMock,
    bulkImportCsv: bulkImportCsvMock,
    listPainPoints: listPainPointsMock,
    createPainPoint: createPainPointMock,
    updatePainPoint: updatePainPointMock,
    deletePainPoint: deletePainPointMock,
  },
}));

vi.mock('../../modules/intel/service.js', () => ({
  IntelNotFoundError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'IntelNotFoundError';
    }
  },
  IntelValidationError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'IntelValidationError';
    }
  },
  IntelCsvTooLargeError: class extends Error {},
  IntelCsvTooManyRowsError: class extends Error {},
  PainPointNotFoundError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PainPointNotFoundError';
    }
  },
}));

function buildMultipartBody(
  filename: string,
  contentType: string,
  content: string,
): { body: Buffer; boundary: string } {
  const boundary = '----heyday-intel-boundary';
  const body = Buffer.from(
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n'),
    'utf-8',
  );
  return { body, boundary };
}

describe('intel routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getUserForTokenMock.mockResolvedValue(ADMIN);
    createEnrichmentRunMock.mockResolvedValue({
      jobId: 'job_1',
      run: { id: 'run_1', company_id: 'company_1', status: 'queued' },
    });
    getEnrichmentRunMock.mockResolvedValue({
      id: 'run_1',
      company_id: 'company_1',
      source_hits: [],
      pain_points_created_count: 0,
      service_fits_created_count: 0,
    });
    listByCompanyMock.mockResolvedValue([
      { id: 'run_1', company_id: 'company_1', status: 'queued' },
    ]);
    bulkImportCsvMock.mockResolvedValue({
      batchId: 'batch_1',
      count: 2,
      runIds: ['run_1', 'run_2'],
      errors: [],
    });
    listPainPointsMock.mockResolvedValue({
      data: [
        {
          id: 'pain_point_1',
          company_id: 'company_1',
          company_name: 'ACME',
          category_id: 'category_1',
          category_key: 'late_replies',
          category_label_es: 'Respuestas tardías',
          confidence: 'observed',
          evidence_text: 'Whatsapp sin respuesta',
          evidence_source_url: 'https://acme.test/reviews',
          evidence_timestamp: '2026-05-02T10:00:00.000Z',
          detected_by: 'human',
          human_verified: true,
          verified_by_id: ADMIN.id,
          created_at: '2026-05-02T10:00:00.000Z',
          updated_at: '2026-05-02T10:00:00.000Z',
        },
      ],
      total: 1,
    });
    createPainPointMock.mockResolvedValue({
      id: 'pain_point_2',
      company_id: 'company_1',
      company_name: 'ACME',
      category_id: 'category_1',
      category_key: 'late_replies',
      category_label_es: 'Respuestas tardías',
      confidence: 'inferred',
      evidence_text: 'Inbox saturado',
      evidence_source_url: null,
      evidence_timestamp: '2026-05-02T10:00:00.000Z',
      detected_by: 'human',
      human_verified: false,
      verified_by_id: null,
      created_at: '2026-05-02T10:00:00.000Z',
      updated_at: '2026-05-02T10:00:00.000Z',
    });
    updatePainPointMock.mockResolvedValue({
      id: 'pain_point_1',
      company_id: 'company_1',
      company_name: 'ACME',
      category_id: 'category_1',
      category_key: 'late_replies',
      category_label_es: 'Respuestas tardías',
      confidence: 'observed',
      evidence_text: 'Whatsapp sin respuesta',
      evidence_source_url: 'https://acme.test/reviews',
      evidence_timestamp: '2026-05-02T10:00:00.000Z',
      detected_by: 'human',
      human_verified: true,
      verified_by_id: ADMIN.id,
      created_at: '2026-05-02T10:00:00.000Z',
      updated_at: '2026-05-02T10:05:00.000Z',
    });
    deletePainPointMock.mockResolvedValue(undefined);
    const { buildApp } = await import('../server.js');
    app = await buildApp({ disableRateLimit: true });
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_intel_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST happy path 202 con jobId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/intel/enrichment-runs',
      headers: { authorization: `Bearer ${token}` },
      payload: { companyId: 'company_1' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      jobId: 'job_1',
      runId: 'run_1',
      companyId: 'company_1',
      status: 'queued',
    });
  });

  it('POST 401 sin auth', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/intel/enrichment-runs',
      payload: { companyId: 'company_1' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST 400 sin companyId ni inputUrl', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/intel/enrichment-runs',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET run 200 con shape esperado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/intel/enrichment-runs/run_1',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'run_1',
      company_id: 'company_1',
      source_hits: [],
    });
  });

  it('GET run 404', async () => {
    const { IntelNotFoundError } = await import('../../modules/intel/service.js');
    getEnrichmentRunMock.mockRejectedValueOnce(new IntelNotFoundError('missing'));

    const response = await app.inject({
      method: 'GET',
      url: '/intel/enrichment-runs/missing',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it('GET company history 200 con array', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/intel/companies/company_1/enrichment',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: 'run_1', company_id: 'company_1', status: 'queued' }]);
  });

  it('GET pain-points 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/intel/pain-points?confidence=observed&limit=20&offset=0',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [expect.objectContaining({ id: 'pain_point_1', confidence: 'observed' })],
      total: 1,
    });
    expect(listPainPointsMock).toHaveBeenCalledWith({
      confidence: 'observed',
      limit: '20',
      offset: '0',
    });
  });

  it('GET pain-points 403 sin admin', async () => {
    getUserForTokenMock.mockResolvedValueOnce(OPERATOR);
    const operatorToken = signAccessToken({
      sub: OPERATOR.id,
      role: 'operator',
      sid: 'ses_intel_routes_operator',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/intel/pain-points',
      headers: { authorization: `Bearer ${operatorToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(listPainPointsMock).not.toHaveBeenCalled();
  });

  it('POST pain-points 201', async () => {
    const payload = {
      company_id: 'company_1',
      category_id: 'category_1',
      confidence: 'inferred',
      evidence_text: 'Inbox saturado',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/intel/pain-points',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 'pain_point_2',
      detected_by: 'human',
    });
    expect(createPainPointMock).toHaveBeenCalledWith(payload, ADMIN.id);
  });

  it('DELETE pain-points 204', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/intel/pain-points/pain_point_1',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
    expect(deletePainPointMock).toHaveBeenCalledWith('pain_point_1', ADMIN.id);
  });

  it('POST bulk-import 202 con CSV válido', async () => {
    const { body, boundary } = buildMultipartBody(
      'leads.csv',
      'text/csv',
      'name,website\nAcme,https://acme.test\nBeta,https://beta.test',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/intel/bulk-import',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      batch_id: 'batch_1',
      count: 2,
      run_ids: ['run_1', 'run_2'],
      errors: [],
    });
    expect(bulkImportCsvMock).toHaveBeenCalledWith(expect.any(Buffer), 'leads.csv', ADMIN.id);
  });

  it('POST bulk-import 401 sin auth', async () => {
    const { body, boundary } = buildMultipartBody(
      'leads.csv',
      'text/csv',
      'name,website\nAcme,https://acme.test',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/intel/bulk-import',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(response.statusCode).toBe(401);
  });
});
