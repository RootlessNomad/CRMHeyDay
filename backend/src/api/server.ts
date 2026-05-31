// API entrypoint. `buildApp()` es testable (puede usarse con `app.inject()`);
// `main()` arranca el proceso.
//
// Plugins registrados:
//   helmet       → headers de seguridad + CSP defaults
//   cors         → permite sólo `APP_URL` (con credentials: true para cookies)
//   cookie       → parseo de `Cookie` header; no se usa `signed` (cookies contienen
//                   sólo el refresh JWT, que ya está firmado por nosotros)
//   sensible     → utilidades (`httpErrors`) y decoradores estándar
//   rate-limit   → 100 req/min global con Redis store (compartido con BullMQ)
//   auth (propio)→ decoradores `requireAuth` y `requireRole`
//
// Todas las respuestas llevan header `x-request-id`. El logger pino emite `reqId`
// en cada log para correlacionar request ↔ trabajo del worker (si encola un job).

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';

import { env } from '../core/config/env.js';
import { rootLogger } from '../core/observability/logger.js';
import { redis } from '../core/queue/connection.js';
import authPlugin from './plugins/auth.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerActivitiesRoutes } from './routes/activities.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerCompaniesRoutes } from './routes/companies.js';
import { registerContentRoutes } from './routes/content.js';
import { registerContactsRoutes } from './routes/contacts.js';
import { registerCredentialsRoutes } from './routes/credentials.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';
import { registerGdprRoutes } from './routes/gdpr.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerImportsRoutes } from './routes/imports.js';
import { registerIntelRoutes } from './routes/intel.js';
import { registerJobsRoutes } from './routes/jobs.js';
import { registerLeadsRoutes } from './routes/leads.js';
import { registerMailRoutes } from './routes/mail.js';
import { registerPipelinesRoutes } from './routes/pipelines.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerTagsRoutes } from './routes/tags.js';
import { registerTaxonomiesRoutes } from './routes/taxonomies.js';
import { registerUsersRoutes } from './routes/users.js';
import './types.js'; // side-effect: amplía FastifyRequest con authUser

export interface BuildAppOptions {
  /** Desactiva rate-limit (útil para tests). Default: activo. */
  disableRateLimit?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // Fastify 5 infiere un FastifyInstance<..., Logger, ...> cuando se pasa
  // `loggerInstance` con un pino.Logger concreto. Los route registrators
  // declaran `FastifyInstance` con generics por defecto (FastifyBaseLogger),
  // que es supertipo. Casteamos una sola vez al construirlo para evitar
  // arrastrar el generic específico por toda la API.
  const app = Fastify({
    // Fastify 5: `logger` sólo acepta options; para instancia custom hay que usar
    // `loggerInstance`.
    loggerInstance: rootLogger,
    disableRequestLogging: false,
    // Generador de reqId respetando x-request-id del cliente si viene.
    genReqId: (req) => {
      const hdr = req.headers['x-request-id'];
      if (typeof hdr === 'string' && hdr.length > 0 && hdr.length <= 128) return hdr;
      return randomUUID();
    },
    // Confiar en el primer proxy (EasyPanel pone X-Forwarded-For correcto).
    trustProxy: env.APP_ENV === 'production' ? 1 : true,
    // Límites para evitar DoS con bodies enormes.
    bodyLimit: 1_048_576, // 1 MB por default (CSV bulk irá por endpoint dedicado con multipart)
  }) as unknown as FastifyInstance;

  // Respuesta lleva siempre el reqId para debug cruzado.
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // ---- Seguridad
  await app.register(helmet, {
    // Este backend sólo sirve JSON — no necesita CSP de HTML propio; el front
    // (Next.js) gestiona su CSP en IT-10.
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: env.APP_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
  });
  await app.register(cookie, {
    // No usamos firmas: el refresh JWT ya está firmado con HS256 por nosotros.
  });
  await app.register(sensible);

  if (!opts.disableRateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: '1 minute',
      redis, // reutiliza el cliente ioredis ya cacheado
      nameSpace: env.QUEUE_PREFIX + ':rl:',
      // Si Redis cae, el API no tumba por rate-limit — degrada grácilmente.
      skipOnError: true,
    });
  }

  // ---- Plugins propios
  await app.register(authPlugin);
  registerErrorHandler(app);

  // ---- Rutas: /health sin prefijo (healthcheck de EasyPanel), resto bajo /api/v1
  await registerHealthRoutes(app);

  await app.register(
    async (v1) => {
      await registerActivitiesRoutes(v1);
      await registerCalendarRoutes(v1);
      await registerAdminRoutes(v1);
      await registerAuthRoutes(v1);
      await registerCompaniesRoutes(v1);
      await registerContentRoutes(v1);
      await registerContactsRoutes(v1);
      await registerCredentialsRoutes(v1);
      await registerDashboardRoutes(v1);
      await registerDiscoveryRoutes(v1);
      await registerGdprRoutes(v1);
      await registerImportsRoutes(v1);
      await registerIntelRoutes(v1);
      await registerJobsRoutes(v1);
      await registerLeadsRoutes(v1);
      await registerMailRoutes(v1);
      await registerPipelinesRoutes(v1);
      await registerSearchRoutes(v1);
      await registerTagsRoutes(v1);
      await registerTaxonomiesRoutes(v1);
      await registerUsersRoutes(v1);
    },
    { prefix: '/api/v1' },
  );

  return app;
}

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
    rootLogger.info({ port: env.API_PORT, env: env.APP_ENV }, 'API listening');
  } catch (err) {
    rootLogger.fatal(
      { err: err instanceof Error ? err.message : String(err) },
      'API failed to start',
    );
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    rootLogger.info({ signal }, 'API shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      rootLogger.error({ err: err instanceof Error ? err.message : String(err) }, 'shutdown error');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Arranque automático sólo si este archivo es el entrypoint ejecutado por tsx/node.
// Mantener `buildApp` importable desde tests.
const entryArg = process.argv[1] ?? '';
const isEntrypoint =
  import.meta.url === `file://${entryArg}` ||
  entryArg.endsWith('server.ts') ||
  entryArg.endsWith('server.js');

if (isEntrypoint) {
  void main();
}
