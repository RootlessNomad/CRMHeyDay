import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  credentialsService,
  CredentialNotFoundError,
  CredentialConflictError,
} from '../../modules/credentials/index.js';
import { enqueue, QUEUE_NAMES } from '../../core/queue/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

const CreateCredentialSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'Solo minúsculas, dígitos y _'),
  provider: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  plaintext: z.string().min(1).max(8192),
});

const RotateCredentialSchema = z.object({
  newPlaintext: z.string().min(1).max(8192),
});

const SetActiveSchema = z.object({
  isActive: z.boolean(),
});

export async function registerCredentialsRoutes(app: FastifyInstance): Promise<void> {
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  app.get('/admin/credentials', adminGuard, async (_request, reply) => {
    const list = await credentialsService.listWithHealth();
    return reply.code(200).send(list);
  });

  app.get('/admin/credentials/:id', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const cred = await credentialsService.getWithHealthById(id);
    if (!cred) throw app.httpErrors.notFound(`Credencial "${id}" no encontrada`);
    return reply.code(200).send(cred);
  });

  app.post('/admin/credentials', adminGuard, async (request, reply) => {
    const body = CreateCredentialSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const created = await credentialsService.create({ ...body, actorUserId });
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof CredentialConflictError) throw app.httpErrors.conflict(err.message);
      throw err;
    }
  });

  app.post('/admin/credentials/:id/rotate', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const { newPlaintext } = RotateCredentialSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const updated = await credentialsService.rotate({ id, newPlaintext, actorUserId });
      return reply.code(200).send(updated);
    } catch (err) {
      if (err instanceof CredentialNotFoundError) throw app.httpErrors.notFound(err.message);
      throw err;
    }
  });

  app.patch('/admin/credentials/:id/active', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const { isActive } = SetActiveSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      const updated = await credentialsService.setActive(id, isActive, actorUserId);
      return reply.code(200).send(updated);
    } catch (err) {
      if (err instanceof CredentialNotFoundError) throw app.httpErrors.notFound(err.message);
      throw err;
    }
  });

  app.delete('/admin/credentials/:id', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      await credentialsService.delete(id, actorUserId);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof CredentialNotFoundError) throw app.httpErrors.notFound(err.message);
      throw err;
    }
  });

  app.post('/admin/credentials/:id/test', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    const credential = await credentialsService.getPublicById(id);
    if (!credential) throw app.httpErrors.notFound(`Credencial "${id}" no encontrada`);

    const { jobId } = await enqueue(QUEUE_NAMES.integrationTest, {
      credentialId: id,
      actorUserId,
    });

    return reply.code(202).send({ jobId });
  });
}
