import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ActivityCreateSchema,
  ActivityListQuerySchema,
  ActivityUpdateSchema,
  activitiesService,
} from '../../modules/activities/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerActivitiesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/activities', { preHandler: [app.requireAuth] }, async (request) => {
    const query = ActivityListQuerySchema.parse(request.query);
    return activitiesService.list(query);
  });

  app.post('/activities', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = ActivityCreateSchema.parse(request.body);
    const createdById = request.authUser?.id;
    if (!createdById) throw app.httpErrors.unauthorized();

    // TODO(roles): restringir creación/edición por rol cuando exista RBAC.
    const activity = await activitiesService.create(body, createdById);
    return reply.code(201).send(activity);
  });

  app.get('/activities/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    return activitiesService.getById(id);
  });

  app.patch('/activities/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = ActivityUpdateSchema.parse(request.body);
    return activitiesService.update(id, body);
  });

  app.delete('/activities/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    await activitiesService.delete(id);
    return reply.code(204).send();
  });
}
