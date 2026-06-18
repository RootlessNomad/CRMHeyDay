import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  BulkImportResultSchema,
  CompanyIdParamsSchema,
  EnrichmentRunCreateSchema,
  EnrichmentRunIdParamsSchema,
  OutboundPrepQuerySchema,
  OutboundPrepRegenerateSchema,
  OutboundPrepToTaskSchema,
  OutboundPrepUpdateSchema,
  PainPointCreateSchema,
  PainPointListQuerySchema,
  PainPointUpdateSchema,
  ServiceFitListQuerySchema,
  ServiceFitRegenerateSchema,
  intelService,
} from '../../modules/intel/index.js';
import {
  LeadDiscoveryRequestSchema,
  leadDiscoveryService,
} from '../../modules/lead-discovery/index.js';
import { anthropicClient } from '../../core/ai/index.js';
import {
  IntelCsvTooLargeError,
  IntelCsvTooManyRowsError,
  IntelNotFoundError,
  IntelValidationError,
  OutboundPrepNotFoundError,
  PainPointNotFoundError,
} from '../../modules/intel/service.js';

const PainPointIdParamsSchema = z.object({
  id: z.string().min(1),
});

function isAcceptedCsvUpload(filename: string | undefined, mimeType: string): boolean {
  const hasCsvExtension = typeof filename === 'string' && filename.toLowerCase().endsWith('.csv');
  const hasAcceptedMime = mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel';
  return hasCsvExtension || hasAcceptedMime;
}

function rethrowIntelError(app: FastifyInstance, error: unknown): never {
  if (error instanceof IntelNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof PainPointNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof OutboundPrepNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof IntelValidationError) throw app.httpErrors.badRequest(error.message);
  throw error;
}

export async function registerIntelRoutes(app: FastifyInstance): Promise<void> {
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  app.post(
    '/intel/lead-discovery',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: { authUser?: { id?: string }; ip: string }) =>
            request.authUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const body = LeadDiscoveryRequestSchema.parse(request.body);
      const actorUserId = request.authUser?.id;
      if (!actorUserId) throw app.httpErrors.unauthorized();
      const { jobId } = await leadDiscoveryService.enqueueleadDiscovery(body, actorUserId);
      return reply.code(202).send({ jobId });
    },
  );

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

  app.get('/intel/pain-points', adminGuard, async (request, reply) => {
    const query = PainPointListQuerySchema.parse(request.query);
    const result = await intelService.listPainPoints(query);
    return reply.code(200).send(result);
  });

  app.get('/intel/service-fit', adminGuard, async (request, reply) => {
    const query = ServiceFitListQuerySchema.parse(request.query);
    const data = await intelService.listServiceFit(query.company_id, query.limit);
    return reply.code(200).send({ data });
  });

  app.get('/intel/outbound-prep', adminGuard, async (request, reply) => {
    const query = OutboundPrepQuerySchema.parse(request.query);

    try {
      const data = await intelService.getOutboundPrep(query.company_id);
      return reply.code(200).send({ data });
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.post('/intel/outbound-prep/regenerate', adminGuard, async (request, reply) => {
    const body = OutboundPrepRegenerateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const result = await intelService.regenerateOutboundPrep(body.company_id, actorUserId);
      return reply.code(200).send(result);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.patch('/intel/outbound-prep/:company_id', adminGuard, async (request, reply) => {
    const { company_id } = OutboundPrepQuerySchema.parse(request.params);
    const body = OutboundPrepUpdateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const result = await intelService.updateOutboundPrep(company_id, body, actorUserId);
      return reply.code(200).send(result);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.post('/intel/outbound-prep/:company_id/to-task', adminGuard, async (request, reply) => {
    const { company_id } = OutboundPrepQuerySchema.parse(request.params);
    const body = OutboundPrepToTaskSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const result = await intelService.createOutreachTask(company_id, body, actorUserId);
      return reply.code(201).send(result);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.post('/intel/service-fit/regenerate', adminGuard, async (request, reply) => {
    const body = ServiceFitRegenerateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      // Desviación temporal del spec original: esta regeneración se ejecuta inline en la request, sin queue.
      const timedAi = {
        complete: async (
          input: Parameters<typeof anthropicClient.complete>[0],
        ): ReturnType<typeof anthropicClient.complete> => {
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Claude service_fit excedió el timeout de 30s.'));
            }, 30_000);

            void anthropicClient
              .complete(input)
              .then((result) => {
                clearTimeout(timeout);
                resolve(result);
              })
              .catch((error: unknown) => {
                clearTimeout(timeout);
                reject(error);
              });
          });
        },
      };

      const result = await intelService.regenerateServiceFit(body.company_id, actorUserId, timedAi);
      return reply.code(200).send(result);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.post('/intel/pain-points', adminGuard, async (request, reply) => {
    const body = PainPointCreateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const created = await intelService.createPainPoint(body, actorUserId);
      return reply.code(201).send(created);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.patch('/intel/pain-points/:id', adminGuard, async (request, reply) => {
    const { id } = PainPointIdParamsSchema.parse(request.params);
    const body = PainPointUpdateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const updated = await intelService.updatePainPoint(id, body, actorUserId);
      return reply.code(200).send(updated);
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

  app.delete('/intel/pain-points/:id', adminGuard, async (request, reply) => {
    const { id } = PainPointIdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      await intelService.deletePainPoint(id, actorUserId);
      return reply.code(204).send();
    } catch (error) {
      rethrowIntelError(app, error);
    }
  });

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

  await app.register(async (intelApp) => {
    await intelApp.register(multipart, {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    });

    intelApp.post(
      '/intel/bulk-import',
      { preHandler: [intelApp.requireAuth] },
      async (req, reply) => {
        const actorUserId = req.authUser?.id;
        if (!actorUserId) throw intelApp.httpErrors.unauthorized();
        if (!req.isMultipart()) {
          return reply
            .code(400)
            .send({ error: { code: 'missing_file', message: 'Falta el archivo CSV' } });
        }

        const upload = await req.file();
        if (!upload) {
          return reply
            .code(400)
            .send({ error: { code: 'missing_file', message: 'Falta el archivo CSV' } });
        }

        if (!isAcceptedCsvUpload(upload.filename, upload.mimetype)) {
          return reply.code(400).send({
            error: { code: 'invalid_file_type', message: 'Solo se admiten archivos .csv' },
          });
        }

        try {
          const buffer = await upload.toBuffer();
          const result = BulkImportResultSchema.parse(
            await intelService.bulkImportCsv(buffer, upload.filename, actorUserId),
          );

          return reply.code(202).send({
            batch_id: result.batchId,
            count: result.count,
            run_ids: result.runIds,
            errors: result.errors,
          });
        } catch (error) {
          if (error instanceof IntelCsvTooLargeError) {
            return reply.code(400).send({
              error: { code: error.code, message: error.message },
            });
          }
          if (error instanceof IntelCsvTooManyRowsError) {
            return reply.code(400).send({
              error: { code: error.code, message: error.message },
            });
          }
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
          ) {
            return reply.code(400).send({
              error: { code: 'CSV_TOO_LARGE', message: 'El archivo CSV no puede superar 2 MB.' },
            });
          }
          rethrowIntelError(intelApp, error);
        }
      },
    );
  });
}
