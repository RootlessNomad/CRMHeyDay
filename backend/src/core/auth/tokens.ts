// JWT access + refresh.
// - Access: corto (15m default), verificado en cada request.
// - Refresh: largo (14d default). Se almacena el sha256 del refresh token en
//   la tabla `sessions` para poder revocar/rotar. Nunca guardamos el token en claro.
// - En cada `refresh` se rota: se revoca la sesión actual y se emite una nueva.

import { createHash, randomUUID } from 'node:crypto';

import jwt, { type SignOptions, type JwtPayload } from 'jsonwebtoken';

// `jsonwebtoken` es CommonJS — en ESM estricto (Node 20+) los errores tipados
// sólo son accesibles vía el default export, no como named imports.
const { TokenExpiredError, JsonWebTokenError, NotBeforeError } = jwt;
import type { UserRole } from '@prisma/client';

import { env } from '../config/env.js';
import { AuthError } from './errors.js';

export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
  sid: string; // session id (de sessions.id)
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string; // userId
  sid: string; // session id
  jti: string; // identificador único del token (permite detectar reuso)
  type: 'refresh';
}

function requireSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = env[name];
  if (!value) {
    throw AuthError.internal(`Falta la variable ${name}`);
  }
  return value;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(
    { ...payload, type: 'access' satisfies 'access' },
    requireSecret('JWT_ACCESS_SECRET'),
    options,
  );
}

export interface SignedRefresh {
  token: string;
  jti: string;
  hash: string;
  expiresAt: Date;
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type' | 'jti'>,
): SignedRefresh {
  const jti = randomUUID();
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
    algorithm: 'HS256',
    jwtid: jti,
  };
  // Nota: no incluimos `jti` en el payload — `options.jwtid` lo inyecta automáticamente
  // y jsonwebtoken rechaza la duplicación ("Bad options.jwtid — payload already has jti").
  const token = jwt.sign(
    { ...payload, type: 'refresh' satisfies 'refresh' },
    requireSecret('JWT_REFRESH_SECRET'),
    options,
  );
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) {
    throw AuthError.internal('No se pudo calcular la expiración del refresh');
  }
  return {
    token,
    jti,
    hash: hashRefreshToken(token),
    expiresAt: new Date(decoded.exp * 1000),
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, requireSecret('JWT_ACCESS_SECRET'), {
      algorithms: ['HS256'],
    }) as JwtPayload & AccessTokenPayload;
    if (decoded.type !== 'access') {
      throw AuthError.invalidCredentials();
    }
    return {
      sub: decoded.sub,
      role: decoded.role,
      sid: decoded.sid,
      type: 'access',
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) throw AuthError.expired();
    if (err instanceof JsonWebTokenError || err instanceof NotBeforeError) {
      throw AuthError.invalidCredentials();
    }
    if (err instanceof AuthError) throw err;
    throw AuthError.invalidCredentials();
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, requireSecret('JWT_REFRESH_SECRET'), {
      algorithms: ['HS256'],
    }) as JwtPayload & RefreshTokenPayload;
    if (decoded.type !== 'refresh') {
      throw AuthError.invalidCredentials();
    }
    return {
      sub: decoded.sub,
      sid: decoded.sid,
      jti: decoded.jti,
      type: 'refresh',
    };
  } catch (err) {
    if (err instanceof TokenExpiredError) throw AuthError.expired();
    if (err instanceof JsonWebTokenError || err instanceof NotBeforeError) {
      throw AuthError.invalidCredentials();
    }
    if (err instanceof AuthError) throw err;
    throw AuthError.invalidCredentials();
  }
}

/**
 * sha256 del refresh token. Nunca almacenamos el token en claro.
 * La comparación se hace por igualdad del hash, no del token.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
