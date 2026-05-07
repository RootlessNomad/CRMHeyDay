import { ERROR_CODES } from '@heyday/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  CreateEmailAccountInputSchema,
  ForbiddenError,
  GetMessageQuerySchema,
  ImapConnectionError,
  ListMessagesQuerySchema,
  NotFoundError,
  SetFlagsInputSchema,
  UpdateEmailAccountInputSchema,
  emailAccountService,
  imapService,
} from '../../modules/mail/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });
const MessageParamsSchema = z.object({
  id: z.string().min(1),
  uid: z.coerce.number().int().positive(),
});

function sendMailError(
  app: FastifyInstance,
  reply: FastifyReply,
  error: unknown,
): FastifyReply | never {
  if (
    error instanceof ForbiddenError ||
    (error instanceof Error && error.name === 'ForbiddenError')
  ) {
    throw error;
  }

  if (
    error instanceof NotFoundError ||
    (error instanceof Error && error.name === 'NotFoundError')
  ) {
    throw app.httpErrors.notFound(error instanceof Error ? error.message : 'Recurso no encontrado');
  }

  if (
    error instanceof ImapConnectionError ||
    (error instanceof Error && error.name === 'ImapConnectionError')
  ) {
    return reply.code(502).send({
      error: {
        code: ERROR_CODES.INTEGRATION_UNAVAILABLE,
        message: error instanceof Error ? error.message : 'Servicio IMAP no disponible',
      },
    });
  }

  throw error;
}

export async function registerMailRoutes(app: FastifyInstance): Promise<void> {
  const authGuard = { preHandler: [app.requireAuth] };

  app.get('/mail/accounts', authGuard, async (request) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const data = await emailAccountService.listForUser(authUser.id);
    return { data };
  });

  app.post('/mail/accounts', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    try {
      const body = CreateEmailAccountInputSchema.parse(request.body);
      const created = await emailAccountService.create(body, authUser.id);
      return reply.code(201).send(created);
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });

  app.patch('/mail/accounts/:id', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateEmailAccountInputSchema.parse(request.body);

    try {
      return await emailAccountService.update(id, body, authUser.id);
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });

  app.delete('/mail/accounts/:id', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const { id } = IdParamsSchema.parse(request.params);

    try {
      await emailAccountService.delete(id, authUser.id);
      return reply.code(200).send();
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });

  app.get('/mail/accounts/:id/folders', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const { id } = IdParamsSchema.parse(request.params);

    try {
      const { account, password } = await emailAccountService.getAccessible(id, authUser.id);
      const data = await imapService.listFolders(account, password);
      return reply.code(200).send({ data });
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });

  app.get(
    '/mail/accounts/:id/messages',
    {
      preHandler: [app.requireAuth],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request: { authUser?: { id?: string }; ip: string }) =>
            request.authUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) throw app.httpErrors.unauthorized();

      const { id } = IdParamsSchema.parse(request.params);
      const query = ListMessagesQuerySchema.parse(request.query);

      try {
        const { account, password } = await emailAccountService.getAccessible(id, authUser.id);
        const data = await imapService.listMessages(
          account,
          password,
          query.folder,
          query.page,
          query.page_size,
        );
        return reply.code(200).send({ data });
      } catch (error) {
        return sendMailError(app, reply, error);
      }
    },
  );

  app.get('/mail/accounts/:id/messages/:uid', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const { id, uid } = MessageParamsSchema.parse(request.params);
    const query = GetMessageQuerySchema.parse(request.query);

    try {
      const { account, password } = await emailAccountService.getAccessible(id, authUser.id);
      return await imapService.getMessage(account, password, query.folder, uid);
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });

  app.post('/mail/accounts/:id/messages/:uid/flags', authGuard, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) throw app.httpErrors.unauthorized();

    const { id, uid } = MessageParamsSchema.parse(request.params);
    const body = SetFlagsInputSchema.parse(request.body);

    try {
      const { account, password } = await emailAccountService.getAccessible(id, authUser.id);
      await imapService.setFlags(account, password, body.folder, uid, {
        seen: body.seen,
        flagged: body.flagged,
      });
      return reply.code(200).send();
    } catch (error) {
      return sendMailError(app, reply, error);
    }
  });
}
