import type { FastifyInstance } from 'fastify';

import { DashboardService } from '../../modules/dashboard/index.js';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard/metrics', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const actorUserId = req.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();
    const service = new DashboardService();
    const result = await service.metrics(actorUserId);
    return reply.header('Cache-Control', 'private, max-age=30').send(result);
  });

  app.get('/dashboard/upcoming-actions', { preHandler: [app.requireAuth] }, async (req, reply) => {
    const actorUserId = req.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();
    const service = new DashboardService();
    const result = await service.upcomingActions(actorUserId);
    return reply.header('Cache-Control', 'private, max-age=30').send(result);
  });

  app.get(
    '/dashboard/top-priority-leads',
    { preHandler: [app.requireAuth] },
    async (_req, reply) => {
      const service = new DashboardService();
      const result = await service.topPriorityLeads();
      return reply.header('Cache-Control', 'private, max-age=30').send(result);
    },
  );
}
