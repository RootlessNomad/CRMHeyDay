// Extensiones de tipado para FastifyRequest. Declaramos aquí lo que los plugins
// de la capa HTTP atan al request (user, sessionId, etc.) para que todos los
// handlers obtengan autocompletado tras `requireAuth`.

import type { PublicUserDto } from '../modules/auth/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Usuario autenticado tras `requireAuth`. */
    authUser?: PublicUserDto;
    /** Session id del access token. */
    authSessionId?: string;
  }
}

export {};
