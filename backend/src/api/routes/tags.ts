import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  TagAssignSchema,
  TagByEntityQuerySchema,
  TagCreateSchema,
  TagListQuerySchema,
  TagUpdateSchema,
  tagsService,
} from '../../modules/tags/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerTagsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tags', { preHandler: [app.requireAuth] }, async (request) => {
    const query = TagListQuerySchema.parse(request.query);
    return tagsService.list(query);
  });

  app.post('/tags', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = TagCreateSchema.parse(request.body);
    const tag = await tagsService.create(body);
    return reply.code(201).send(tag);
  });

  app.get('/tags/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    return tagsService.getById(id);
  });

  app.patch('/tags/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = TagUpdateSchema.parse(request.body);
    return tagsService.update(id, body);
  });

  app.delete('/tags/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    await tagsService.delete(id);
    return reply.code(204).send();
  });

  app.post('/tags/assign', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = TagAssignSchema.parse(request.body);
    const tag = await tagsService.assign(body);
    return reply.code(201).send(tag);
  });

  app.post('/tags/unassign', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = TagAssignSchema.parse(request.body);
    await tagsService.unassign(body);
    return reply.code(204).send();
  });

  app.get('/tags/by-entity', { preHandler: [app.requireAuth] }, async (request) => {
    const query = TagByEntityQuerySchema.parse(request.query);
    return tagsService.getForEntity(query.entity_type, query.entity_id);
  });
}
