// Rutas de autenticación — single source of truth para el flujo de sesión.
//
// POST /auth/login     — email + password → {user, accessToken, accessExpiresAt}
//                         + set-cookie `hd_refresh` (httpOnly, samesite=lax, secure en prod)
// POST /auth/refresh   — lee cookie → rota refresh → {accessToken, accessExpiresAt}
//                         + set-cookie nuevo refresh
// POST /auth/logout    — revoca la sesión actual + borra cookie (idempotente)
// GET  /auth/me        — devuelve PublicUserDto del access token
//
// El access token SÓLO viaja en header `Authorization: Bearer` (gestionado por el front).
// El refresh NUNCA viaja por header ni response body — sólo cookie httpOnly.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from '../../core/config/env.js';
import { AuthError } from '../../core/auth/errors.js';
import { authService } from '../../modules/auth/service.js';

const REFRESH_COOKIE = 'hd_refresh';

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function refreshCookieOpts(expiresAt: Date): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  expires: Date;
  domain?: string;
} {
  const base = {
    path: '/',
    httpOnly: true,
    secure: env.APP_ENV === 'production',
    sameSite: 'lax' as const,
    expires: expiresAt,
  };
  return env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost'
    ? { ...base, domain: env.COOKIE_DOMAIN }
    : base;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------
  // POST /auth/login
  // ------------------------------------------------------------------
  app.post(
    '/auth/login',
    {
      // Rate limit específico para login — 5/min por IP + email combinados.
      // fastify-rate-limit aplica el global; este override lo endurece.
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = LoginBodySchema.parse(request.body);
      const result = await authService.login(body.email, body.password, {
        userAgent: request.headers['user-agent'] ?? null,
        ip: request.ip,
      });

      reply.setCookie(
        REFRESH_COOKIE,
        result.tokens.refreshToken,
        refreshCookieOpts(result.tokens.refreshExpiresAt),
      );

      return reply.code(200).send({
        user: result.user,
        accessToken: result.tokens.accessToken,
        accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      });
    },
  );

  // ------------------------------------------------------------------
  // POST /auth/refresh
  // ------------------------------------------------------------------
  app.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) throw AuthError.invalidCredentials();

    const result = await authService.refresh(refreshToken, {
      userAgent: request.headers['user-agent'] ?? null,
      ip: request.ip,
    });

    reply.setCookie(
      REFRESH_COOKIE,
      result.tokens.refreshToken,
      refreshCookieOpts(result.tokens.refreshExpiresAt),
    );

    return reply.code(200).send({
      user: result.user,
      accessToken: result.tokens.accessToken,
      accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
    });
  });

  // ------------------------------------------------------------------
  // POST /auth/logout
  // ------------------------------------------------------------------
  app.post('/auth/logout', { preHandler: [app.requireAuth] }, async (request, reply) => {
    if (request.authSessionId) {
      await authService.logout(request.authSessionId);
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------
  // GET /auth/me
  // ------------------------------------------------------------------
  app.get('/auth/me', { preHandler: [app.requireAuth] }, async (request) => {
    // authUser existe tras requireAuth.
    return { user: request.authUser };
  });
}
