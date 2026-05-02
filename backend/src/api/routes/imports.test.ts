import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicUserDto } from '../../modules/auth/service.js';
import { signAccessToken } from '../../core/auth/tokens.js';
import authPlugin from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import '../types.js';

const ADMIN: PublicUserDto = {
  id: 'user_import_routes',
  email: 'alex@heyday.test',
  name: 'Alex',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
};

const runMock = vi.fn();

vi.mock('../../core/queue/connection.js', () => ({ redis: null }));

vi.mock('../../modules/auth/service.js', () => ({
  authService: {
    getUserForToken: vi.fn(async () => ADMIN),
  },
}));

vi.mock('../../modules/imports/service.js', () => {
  class ImportHeaderError extends Error {
    constructor(public readonly headers: string[]) {
      super('Missing required CSV headers');
      this.name = 'ImportHeaderError';
    }
  }

  class ImportCapError extends Error {
    constructor(public readonly limit: number) {
      super(`CSV row limit exceeded (${limit})`);
      this.name = 'ImportCapError';
    }
  }

  class CompaniesImportService {
    async run(buffer: Buffer, userId: string, dryRun: boolean) {
      return runMock(buffer, userId, dryRun);
    }
  }

  return { CompaniesImportService, ImportHeaderError, ImportCapError };
});

function buildMultipartBody(
  filename: string,
  contentType: string,
  content: string,
): { body: Buffer; boundary: string } {
  const boundary = '----heyday-import-boundary';
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

async function buildTestApp(): Promise<FastifyInstance> {
  const { registerImportsRoutes } = await import('./imports.js');
  const app = Fastify({ logger: false });
  await app.register(await import('@fastify/sensible').then((mod) => mod.default));
  await app.register(authPlugin);
  await registerImportsRoutes(app);
  registerErrorHandler(app);
  return app;
}

describe('imports routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    runMock.mockReset();
    app = await buildTestApp();
    token = signAccessToken({ sub: ADMIN.id, role: 'admin', sid: 'ses_import_routes' });
  });

  afterEach(async () => {
    await app.close();
  });

  it('happy path: 200 con counters correctos', async () => {
    runMock.mockResolvedValue({
      rows_total: 2,
      rows_created: 2,
      rows_skipped_duplicate: 0,
      rows_failed: 0,
      errors: [],
      dry_run: false,
    });
    const { body, boundary } = buildMultipartBody('companies.csv', 'text/csv', 'name\nAlpha');

    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      payload: body,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ rows_total: 2, rows_created: 2 });
    expect(runMock).toHaveBeenCalledWith(expect.any(Buffer), ADMIN.id, false);
  });

  it('401 sin token auth', async () => {
    const { body, boundary } = buildMultipartBody('companies.csv', 'text/csv', 'name\nAlpha');

    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      payload: body,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('400 sin archivo adjunto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'missing_file', message: 'Falta el archivo CSV' },
    });
  });

  it('400 con archivo .txt', async () => {
    const { body, boundary } = buildMultipartBody('companies.txt', 'text/plain', 'name\nAlpha');

    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      payload: body,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'invalid_file_type', message: 'Solo se admiten archivos .csv' },
    });
  });

  it('422 con ImportHeaderError', async () => {
    const { ImportHeaderError } = await import('../../modules/imports/service.js');
    runMock.mockRejectedValue(new ImportHeaderError(['Missing required header: name']));
    const { body, boundary } = buildMultipartBody(
      'companies.csv',
      'text/csv',
      'domain\nalpha.test',
    );

    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      payload: body,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: {
        code: 'missing_required_headers',
        message: 'Faltan cabeceras obligatorias en el CSV',
        details: { headers: ['Missing required header: name'] },
      },
    });
  });

  it('400 con ImportCapError', async () => {
    const { ImportCapError } = await import('../../modules/imports/service.js');
    runMock.mockRejectedValue(new ImportCapError(1000));
    const { body, boundary } = buildMultipartBody('companies.csv', 'text/csv', 'name\nAlpha');

    const res = await app.inject({
      method: 'POST',
      url: '/companies/import-csv',
      payload: body,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'too_many_rows',
        message: 'El archivo supera el máximo de 1000 filas permitido',
        details: { limit: 1000 },
      },
    });
  });
});
