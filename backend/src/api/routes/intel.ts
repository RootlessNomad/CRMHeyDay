import type { FastifyInstance } from 'fastify';

import {
  CompanyIdParamsSchema,
  EnrichmentRunCreateSchema,
  EnrichmentRunIdParamsSchema,
  intelService,
} from '../../modules/intel/index.js';
import { IntelNotFoundError, IntelValidationError } from '../../modules/intel/service.js';

function rethrowIntelError(app: FastifyInstance, error: unknown): never {
  if (error instanceof IntelNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof IntelValidationError) throw app.httpErrors.badRequest(error.message);
  throw error;
}

export async function registerIntelRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/intel/enrichment-runs',
    {
      preHandler: [app.requireAuth],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: { authUser?: { id?: string }; ip: string }) =>
            request.authUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = EnrichmentRunCreateSchema.parse(request.body);
      const actorUserId = request.authUser?.id;
      if (!actorUserId) throw app.httpErrors.unauthorized();

      try {
        const result = await intelService.createEnrichmentRun(body, actorUserId);
        return reply.code(202).send({
          jobId: result.jobId,
          runId: result.run.id,
          companyId: result.run.company_id,
          status: result.run.status,
        });
      } catch (error) {
        rethrowIntelError(app, error);
      }
    },
  );

  app.get('/intel/enrichment-runs/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = EnrichmentRunIdParamsSchema.parse(request.params);
    try {
      return await intelService.getEnrichmentRun(id);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.get('/intel/companies/:id/enrichment', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = CompanyIdParamsSchema.parse(request.params);
    try {
      return await intelService.listByCompany(id);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });
}
