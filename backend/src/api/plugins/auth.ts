// Auth plugin: expone `app.requireAuth` y `app.requireRole(role)` como preHandlers.
//
// Uso:
//   app.get('/jobs/:id', { preHandler: [app.requireAuth] }, handler)
//   app.post('/admin/x', { preHandler: [app.requireAuth, app.requireRole('admin')] }, ...)
//
// El access token viaja en `Authorization: Bearer <jwt>`. El refresh token en cookie
// httpOnly (ver plugin de cookies en server.ts). Tras `requireAuth`, el handler
// puede leer `request.authUser` (PublicUserDto) y `request.authSessionId`.

import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { UserRole } from '@heyday/shared';

import { AuthError } from '../../core/auth/errors.js';
import { verifyAccessToken } from '../../core/auth/tokens.js';
import { authService, type AuthService } from '../../modules/auth/service.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireRole: (role: UserRole) => preHandlerHookHandler;
  }
}

export interface AuthPluginOpts {
  /** Inyectable para tests. */
  auth?: AuthService;
}

async function authPlugin(app: FastifyInstance, opts: AuthPluginOpts): Promise<void> {
  const svc = opts.auth ?? authService;

  const requireAuth: preHandlerHookHandler = async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ) => {
    const header = request.headers.authorization;
    if (!header || typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) {
      throw AuthError.invalidCredentials();
    }
    const token = header.slice(7).trim();
    if (!token) throw AuthError.invalidCredentials();

    // verifyAccessToken lanza AuthError.expired() si firma/exp fallan.
    const payload = verifyAccessToken(token);
    const user = await svc.getUserForToken(payload);

    request.authUser = user;
    request.authSessionId = payload.sid;
  };

  const requireRole = (role: UserRole): preHandlerHookHandler => {
    return async (request: FastifyRequest) => {
      if (!request.authUser) throw AuthError.invalidCredentials();
      if (request.authUser.role !== role) throw AuthError.forbidden();
    };
  };

  app.decorate('requireAuth', requireAuth);
  app.decorate('requireRole', requireRole);
}

export default fp(authPlugin, { name: 'heyday-auth' });
