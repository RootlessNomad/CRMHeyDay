// Rutas de health/readiness. Sin auth — usadas por EasyPanel, Docker healthchecks
// y la UI del dashboard para ping.
//
// /health  → siempre 200 si el proceso vive
// /ready   → 200 sólo si DB + Redis responden; si no, 503

import type { FastifyInstance } from 'fastify';

import { redis } from '../../core/queue/connection.js';
import { prisma } from '../../core/prisma/client.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = { db: 'fail', redis: 'fail' };
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks['db'] = 'ok';
    } catch {
      /* deja 'fail' */
    }
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') checks['redis'] = 'ok';
    } catch {
      /* deja 'fail' */
    }
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'degraded',
      checks,
    });
  });
}
