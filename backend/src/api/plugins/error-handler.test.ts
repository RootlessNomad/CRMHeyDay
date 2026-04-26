import { ERROR_CODES } from '@heyday/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AuthError } from '../../core/auth/errors.js';
import { InvalidJobPayloadError } from '../../core/queue/types.js';
import { CredentialNotFoundError } from '../../modules/credentials/service.js';
import { JobNotFoundError } from '../../modules/jobs/service.js';
import { registerErrorHandler } from './error-handler.js';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/auth', () => {
    throw AuthError.invalidCredentials();
  });
  app.get('/zod', () => {
    const schema = z.object({ n: z.number() });
    schema.parse({ n: 'x' });
  });
  app.get('/notfound-job', () => {
    throw new JobNotFoundError('x');
  });
  app.get('/notfound-cred', () => {
    throw new CredentialNotFoundError('x');
  });
  app.get('/bad-job-payload', () => {
    throw new InvalidJobPayloadError('enrichment', [{ path: 'companyId', message: 'required' }]);
  });
  app.get('/boom', () => {
    throw new Error('something awful');
  });
  registerErrorHandler(app);
  return app;
}

describe('error-handler', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('AuthError → statusCode + code propio', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: ERROR_CODES.AUTH_INVALID_CREDENTIALS, message: 'Credenciales inválidas' },
    });
  });

  it('ZodError → 400 VALIDATION_ERROR con details', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod' });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error.details).toBeInstanceOf(Array);
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('JobNotFoundError → 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/notfound-job' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.NOT_FOUND } });
  });

  it('CredentialNotFoundError → 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/notfound-cred' });
    expect(res.statusCode).toBe(404);
  });

  it('InvalidJobPayloadError → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ method: 'GET', url: '/bad-job-payload' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.VALIDATION_ERROR } });
  });

  it('Error genérico → 500 INTERNAL_ERROR con mensaje genérico (no filtra el original)', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    // Mensaje genérico — el original "something awful" NO aparece.
    expect(body.error.message).not.toContain('awful');
  });

  it('404 no-matched devuelve shape uniforme', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-existe' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.NOT_FOUND } });
  });
});
