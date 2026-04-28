import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ContactCreateSchema,
  ContactListQuerySchema,
  ContactUpdateSchema,
  contactsService,
} from '../../modules/contacts/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

export async function registerContactsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/contacts', { preHandler: [app.requireAuth] }, async (request) => {
    const query = ContactListQuerySchema.parse(request.query);
    return contactsService.list(query);
  });

  app.post('/contacts', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = ContactCreateSchema.parse(request.body);
    const createdById = request.authUser?.id;
    if (!createdById) throw app.httpErrors.unauthorized();

    const contact = await contactsService.create(body, createdById);
    return reply.code(201).send(contact);
  });

  app.get('/contacts/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    return contactsService.getById(id);
  });

  app.patch('/contacts/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = ContactUpdateSchema.parse(request.body);
    return contactsService.update(id, body);
  });

  app.delete('/contacts/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    await contactsService.softDelete(id);
    return reply.code(204).send();
  });

  app.post('/contacts/:id/anonymize', { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    return contactsService.anonymize(id, actorUserId, request.ip);
  });
}
