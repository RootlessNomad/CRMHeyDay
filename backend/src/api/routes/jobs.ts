// Rutas de consulta de jobs (mirror de BullMQ en tabla `jobs`).
// Sólo lectura desde la UI. No hay endpoint público para crear jobs — los
// jobs se encolan desde la lógica de negocio interna.
//
// GET /jobs/:id  — status + payload + result (auth requerida)

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { jobsService } from '../../modules/jobs/service.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerJobsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/jobs/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const job = await jobsService.getById(id);
    return { job };
  });
}
