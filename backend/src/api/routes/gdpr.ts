import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { gdprService } from '../../modules/gdpr/index.js';

const PurgeLogsBodySchema = z.object({
  retentionDays: z.number().int().min(1).max(3650),
});

export async function registerGdprRoutes(app: FastifyInstance): Promise<void> {
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  app.post('/admin/gdpr/purge-logs', adminGuard, async (request, reply) => {
    const { retentionDays } = PurgeLogsBodySchema.parse(request.body);
    const result = await gdprService.purgeOldLogs(retentionDays);
    return reply.code(200).send(result);
  });
}
