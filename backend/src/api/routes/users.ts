import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authService } from '../../modules/auth/index.js';
import { auditService } from '../../modules/audit/index.js';
import { usersService } from '../../modules/users/index.js';

const IdParamsSchema = z.object({ id: z.string().min(1) });

const UserRoleSchema = z.enum(['admin', 'operator', 'viewer']);

const InviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
  role: UserRoleSchema,
});

const PatchUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    role: UserRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

function isPrismaKnownError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === code)
  );
}

export async function registerUsersRoutes(app: FastifyInstance): Promise<void> {
  const adminGuard = { preHandler: [app.requireAuth, app.requireRole('admin')] };

  app.get('/admin/users', adminGuard, async () => {
    return usersService.list();
  });

  app.get('/admin/users/:id', adminGuard, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const user = await usersService.getById(id);
    if (!user) throw app.httpErrors.notFound(`Usuario "${id}" no encontrado`);
    return user;
  });

  app.post('/admin/users', adminGuard, async (request, reply) => {
    const body = InviteUserSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    const existing = await usersService.list();
    const duplicated = existing.some(
      (user) => user.email.toLowerCase() === body.email.toLowerCase(),
    );
    if (duplicated) throw app.httpErrors.conflict('Email ya registrado');

    try {
      let user = await authService.registerAdmin({
        email: body.email,
        name: body.name,
        password: body.password,
      });

      if (body.role !== 'admin') {
        user = await usersService.update(user.id, { role: body.role });
      }

      void auditService.record({
        action: 'user.create',
        actorUserId,
        entityType: 'user',
        entityId: user.id,
        metadata: { role: user.role },
      });

      return reply.code(201).send(user);
    } catch (error) {
      if (isPrismaKnownError(error, 'P2002')) {
        throw app.httpErrors.conflict('Email ya registrado');
      }
      throw error;
    }
  });

  app.patch('/admin/users/:id', adminGuard, async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const patch = PatchUserSchema.parse(request.body);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    const existing = await usersService.getById(id);
    if (!existing) throw app.httpErrors.notFound(`Usuario "${id}" no encontrado`);

    if (patch.isActive === false && id === actorUserId) {
      throw app.httpErrors.badRequest('No puedes desactivarte a ti mismo');
    }

    if (patch.isActive === false || (patch.role !== undefined && patch.role !== 'admin')) {
      const allUsers = await usersService.list();
      const otherActiveAdmins = allUsers.filter(
        (user) => user.id !== id && user.role === 'admin' && user.isActive,
      );
      if (otherActiveAdmins.length === 0) {
        throw app.httpErrors.badRequest('Debe existir al menos un admin activo');
      }
    }

    try {
      const user = await usersService.update(id, patch);

      void auditService.record({
        action: 'user.update',
        actorUserId,
        entityType: 'user',
        entityId: id,
        metadata: { changed: Object.keys(patch) },
      });

      return user;
    } catch (error) {
      if (isPrismaKnownError(error, 'P2025')) {
        throw app.httpErrors.notFound(`Usuario "${id}" no encontrado`);
      }
      throw error;
    }
  });

  app.post('/admin/users/:id/password/reset', adminGuard, async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const actorUserId = request.authUser?.id;
    if (!actorUserId) throw app.httpErrors.unauthorized();

    const existing = await usersService.getById(id);
    if (!existing) throw app.httpErrors.notFound(`Usuario "${id}" no encontrado`);

    const temporaryPassword = randomBytes(12).toString('base64url');
    await usersService.update(id, { password: temporaryPassword });

    void auditService.record({
      action: 'user.password_reset',
      actorUserId,
      entityType: 'user',
      entityId: id,
      metadata: {},
    });

    return reply.send({ temporaryPassword });
  });
}
