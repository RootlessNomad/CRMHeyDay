import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import {
  BulkImportResultSchema,
  CompanyIdParamsSchema,
  EnrichmentRunCreateSchema,
  EnrichmentRunIdParamsSchema,
  intelService,
} from '../../modules/intel/index.js';
import {
  IntelCsvTooLargeError,
  IntelCsvTooManyRowsError,
  IntelNotFoundError,
  IntelValidationError,
} from '../../modules/intel/service.js';

function isAcceptedCsvUpload(filename: string | undefined, mimeType: string): boolean {
  const hasCsvExtension = typeof filename === 'string' && filename.toLowerCase().endsWith('.csv');
  const hasAcceptedMime = mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel';
  return hasCsvExtension || hasAcceptedMime;
}

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
