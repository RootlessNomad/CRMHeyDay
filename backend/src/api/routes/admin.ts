import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { adminService } from '../../modules/admin/index.js';
import { auditService } from '../../modules/audit/index.js';

const AiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const AuditLogQuerySchema = z.object({
  actorUserId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function parseDateInput(value: string | undefined, field: 'from' | 'to'): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field} date`);
  }
  return date;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  app.get('/admin/ai-usage', adminGuard, async (request, reply) => {
    const { days } = AiUsageQuerySchema.parse(request.query);
    const summary = await adminService.getAiUsageSummary({ days });
    return reply.code(200).send(summary);
  });

  app.get('/admin/audit-log', adminGuard, async (request, reply) => {
    const query = AuditLogQuerySchema.parse(request.query);

    let from: Date | undefined;
    let to: Date | undefined;
    try {
      from = parseDateInput(query.from, 'from');
      to = parseDateInput(query.to, 'to');
    } catch (error) {
      throw app.httpErrors.badRequest(
        error instanceof Error ? error.message : 'Invalid audit log date',
      );
    }

    const result = await auditService.listPaginated({
      actorUserId: query.actorUserId,
      action: query.action,
      from,
      to,
      page: query.page,
      limit: query.limit,
    });

    return reply.code(200).send(result);
  });

  app.get('/admin/integration-health', adminGuard, async (_request, reply) => {
    const snapshot = await adminService.getIntegrationHealth();
    return reply.code(200).send(snapshot);
  });
}
