import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  CalendarEventCreateSchema,
  CalendarEventListQuerySchema,
  CalendarEventNotFoundError,
  CalendarEventUpdateSchema,
  CalendarRelatedEntityNotFoundError,
  ForbiddenError,
  calendarService,
} from '../../modules/calendar/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

function rethrowCalendarError(app: FastifyInstance, error: unknown): never {
  if (
    error instanceof ForbiddenError ||
    (error instanceof Error && error.name === 'ForbiddenError')
  ) {
    throw error;
  }

  if (
    error instanceof CalendarEventNotFoundError ||
    (error instanceof Error && error.name === 'CalendarEventNotFoundError') ||
    error instanceof CalendarRelatedEntityNotFoundError ||
    (error instanceof Error && error.name === 'CalendarRelatedEntityNotFoundError')
  ) {
    throw app.httpErrors.notFound(error instanceof Error ? error.message : 'Recurso no encontrado');
  }

  throw error;
}

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.get('/calendar/events', { preHandler: [app.requireAuth] }, async (request) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const query = CalendarEventListQuerySchema.parse(request.query);
    const data = await calendarService.list(query, authUser.id);
    return { data };
  });

  app.post('/calendar/events', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    try {
      const body = CalendarEventCreateSchema.parse(request.body);
      const created = await calendarService.create(body, authUser.id);
      return reply.code(201).send(created);
    } catch (error) {
      rethrowCalendarError(app, error);
    }
  });

  app.patch('/calendar/events/:id', { preHandler: [app.requireAuth] }, async (request) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();
    const isAdmin = authUser.role === 'admin';

    const { id } = IdParamsSchema.parse(request.params);
    const body = CalendarEventUpdateSchema.parse(request.body);

    try {
      return await calendarService.update(id, body, {
        id: authUser.id,
        role: isAdmin ? 'admin' : authUser.role,
      });
    } catch (error) {
      rethrowCalendarError(app, error);
    }
  });

  app.delete('/calendar/events/:id', { preHandler: [app.requireAuth] }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();
    const isAdmin = authUser.role === 'admin';

    const { id } = IdParamsSchema.parse(request.params);

    try {
      await calendarService.softDelete(id, {
        id: authUser.id,
        role: isAdmin ? 'admin' : authUser.role,
      });
      return reply.code(204).send();
    } catch (error) {
      rethrowCalendarError(app, error);
    }
  });
}
