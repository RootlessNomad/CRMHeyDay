import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

import {
  CompaniesImportService,
  ImportCapError,
  ImportHeaderError,
} from '../../modules/imports/service.js';

function isAcceptedCsvUpload(filename: string | undefined, mimeType: string): boolean {
  const hasCsvExtension = typeof filename === 'string' && filename.toLowerCase().endsWith('.csv');
  const hasAcceptedMime = mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel';
  return hasCsvExtension || hasAcceptedMime;
}

export async function registerImportsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (importsApp) => {
    await importsApp.register(multipart, {
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    });

    importsApp.post(
      '/companies/import-csv',
      { preHandler: [importsApp.requireAuth] },
      async (req, reply) => {
        const actorUserId = req.authUser?.id;
        if (!actorUserId) throw importsApp.httpErrors.unauthorized();
        if (!req.isMultipart()) {
          return reply.code(400).send({ error: 'missing_file' });
        }

        const data = await req.file();
        if (!data) {
          return reply.code(400).send({ error: 'missing_file' });
        }
        if (!isAcceptedCsvUpload(data.filename, data.mimetype)) {
          return reply.code(400).send({ error: 'invalid_file_type' });
        }

        const dryRun = (req.query as { dry_run?: string } | undefined)?.dry_run === 'true';
        const buffer = await data.toBuffer();

        try {
          const service = new CompaniesImportService();
          return reply.code(200).send(await service.run(buffer, actorUserId, dryRun));
        } catch (err) {
          if (err instanceof ImportHeaderError) {
            return reply
              .code(422)
              .send({ error: 'missing_required_headers', headers: err.headers });
          }
          if (err instanceof ImportCapError) {
            return reply.code(400).send({ error: 'too_many_rows', limit: 1000 });
          }
          throw err;
        }
      },
    );
  });
}
