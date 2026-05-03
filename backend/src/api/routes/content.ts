import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ContentDailyLimitError,
  DraftRequestSchema,
  IdeaCreateBodySchema,
  type IdeaCreateManualInput,
  IdeaListQuerySchema,
  IdeaNotFoundError,
  IdeaUpdateSchema,
  contentService,
} from '../../modules/content/index.js';

const IdeaIdParamsSchema = z.object({
  id: z.string().min(1),
});

function rethrowContentError(app: FastifyInstance, error: unknown): never {
  if (error instanceof IdeaNotFoundError) throw app.httpErrors.notFound(error.message);
  if (error instanceof ContentDailyLimitError) {
    const err = app.httpErrors.tooManyRequests(error.message);
    throw err;
  }
  throw error;
}

export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  const authGuard = { preHandler: [app.requireAuth] };

  app.get('/content/ideas', authGuard, async (request, reply) => {
    const query = IdeaListQuerySchema.parse(request.query);
    const result = await contentService.listIdeas(query);
    return reply.code(200).send(result);
  });

  app.post('/content/ideas', authGuard, async (request, reply) => {
    const body = IdeaCreateBodySchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    try {
      if ('generate' in body && body.generate === true) {
        const result = await contentService.requestIdeaGeneration(body, actorUserId);
        return reply.code(202).send({ job_id: result.jobId });
      }

      const created = await contentService.createIdeaManual(
        body as IdeaCreateManualInput,
        actorUserId,
      );
      return reply.code(201).send(created);
    } catch (error) {
      rethrowContentError(app, error);
    }
  });

  app.get('/content/ideas/:id', authGuard, async (request, reply) => {
    const { id } = IdeaIdParamsSchema.parse(request.params);
    try {
      const idea = await contentService.getIdeaById(id);
      return reply.code(200).send(idea);
    } catch (error) {
      rethrowContentError(app, error);
    }
  });

  app.patch('/content/ideas/:id', authGuard, async (request, reply) => {
    const { id } = IdeaIdParamsSchema.parse(request.params);
    const body = IdeaUpdateSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();
    try {
      const updated = await contentService.updateIdea(id, body, actorUserId);
      return reply.code(200).send(updated);
    } catch (error) {
      rethrowContentError(app, error);
    }
  });

  app.delete('/content/ideas/:id', authGuard, async (request, reply) => {
    const { id } = IdeaIdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();
    try {
      await contentService.deleteIdea(id, actorUserId);
      return reply.code(204).send();
    } catch (error) {
      rethrowContentError(app, error);
    }
  });

  app.post('/content/ideas/:id/draft', authGuard, async (request, reply) => {
    const { id } = IdeaIdParamsSchema.parse(request.params);
    const body = DraftRequestSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();
    try {
      const result = await contentService.requestDraftsForIdea(id, body.channels, actorUserId);
      return reply.code(202).send({ items: result.items, job_ids: result.jobIds });
    } catch (error) {
      rethrowContentError(app, error);
    }
  });
}
