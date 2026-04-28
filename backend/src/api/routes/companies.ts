import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  CompanyCreateSchema,
  CompanyListQuerySchema,
  CompanyUpdateSchema,
  companiesService,
} from '../../modules/companies/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerCompaniesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/companies', { preHandler: [app.requireAuth] }, async (request) => {
    const query = CompanyListQuerySchema.parse(request.query);
    return companiesService.list(query);
  });

  app.post('/companies', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = CompanyCreateSchema.parse(request.body);
    const createdById = request.authUser?.id;
    if (!createdById) throw app.httpErrors.unauthorized();

    const company = await companiesService.create(body, createdById);
    return reply.code(201).send(company);
  });

  app.get('/companies/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    return companiesService.getById(id);
  });

  app.patch('/companies/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = CompanyUpdateSchema.parse(request.body);
    return companiesService.update(id, body);
  });

  app.delete('/companies/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    await companiesService.softDelete(id);
    return reply.code(204).send();
  });
}
