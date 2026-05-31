import type { FastifyInstance } from 'fastify';

import { BulkDiscoveryRequestSchema, discoveryService } from '../../modules/discovery/index.js';

export async function registerDiscoveryRoutes(app: FastifyInstance): Promise<void> {
  // Discovery consume una API de pago (Google Places) → gate admin + rate limit.
  app.post(
    '/discovery/bulk-search',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: { authUser?: { id?: string }; ip: string }) =>
            request.authUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = BulkDiscoveryRequestSchema.parse(request.body);
      const actorUserId = request.authUser?.id;
      if (!actorUserId) throw app.httpErrors.unauthorized();

      const { jobId } = await discoveryService.enqueueBulkDiscovery(body, actorUserId);
      return reply.code(202).send({ jobId });
    },
  );
}
