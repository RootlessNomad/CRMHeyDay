import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createLeadSchema,
  leadsService,
  listLeadsQuerySchema,
  lostLeadSchema,
  updateLeadSchema,
} from '../../modules/leads/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerLeadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leads', { preHandler: [app.requireAuth] }, async (request) => {
    const query = listLeadsQuerySchema.parse(request.query);
    return leadsService.list(query);
  });

  app.post('/leads', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = createLeadSchema.parse(request.body);
    const actor = request.authUser;
    if (!actor) throw app.httpErrors.unauthorized();

    const lead = await leadsService.create(body, actor);
    return reply.code(201).send(lead);
  });

  app.get('/leads/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    return leadsService.getById(id);
  });

  app.patch('/leads/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = updateLeadSchema.parse(request.body);
    const actor = request.authUser;
    if (!actor) throw app.httpErrors.unauthorized();

    return leadsService.update(id, body, actor);
  });

  app.post('/leads/:id/won', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actor = request.authUser;
    if (!actor) throw app.httpErrors.unauthorized();

    return leadsService.markWon(id, actor);
  });

  app.post('/leads/:id/lost', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = lostLeadSchema.parse(request.body);
    const actor = request.authUser;
    if (!actor) throw app.httpErrors.unauthorized();

    return leadsService.markLost(id, body.lostReason, actor);
  });

  app.delete('/leads/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actor = request.authUser;
    if (!actor) throw app.httpErrors.unauthorized();

    await leadsService.softDelete(id, actor);
    return reply.code(204).send();
  });
}
