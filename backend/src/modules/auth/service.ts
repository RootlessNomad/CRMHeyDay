// Servicio de autenticación. Framework-agnóstico: no conoce Fastify.
// IT-09 wirea estas funciones como handlers HTTP.
//
// Flujo login:
//   1. Buscar usuario por email (case-insensitive).
//   2. Verificar password con bcrypt en tiempo constante (compara siempre aunque no exista).
//   3. Crear registro en `sessions` con refresh_token_hash + expiresAt.
//   4. Devolver access + refresh + user.
//
// Flujo refresh (rotación):
//   1. Verificar firma del refresh token (expiración, signature).
//   2. Buscar session por id + refresh_token_hash; debe no estar revocada ni expirada.
//   3. Revocar session actual (revokedAt = now).
//   4. Crear nueva session con nuevo refresh token.
//   5. Devolver access + nuevo refresh.
//
// Reuso del mismo refresh → invalidar todas las sesiones del usuario (defense-in-depth).

import type { PrismaClient, User } from '@prisma/client';

import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import { AuthError } from '../../core/auth/errors.js';
import { BCRYPT_COST, hashPassword, verifyPassword } from '../../core/auth/password.js';
import {
  type AccessTokenPayload,
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../core/auth/tokens.js';

// Hash fijo (válido pero imposible de matchear en la práctica) para el camino
// "usuario no encontrado". Sincrónico al arranque — ~300ms una sola vez.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('__heyday_invalid_placeholder__', BCRYPT_COST);

export interface PublicUserDto {
  id: string;
  email: string;
  name: string;
  role: User['role'];
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface LoginResult {
  user: PublicUserDto;
  tokens: TokenPair;
  sessionId: string;
}

export interface SessionContext {
  userAgent?: string | null;
  ip?: string | null;
}

function toPublicUser(user: User): PublicUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
  };
}

export class AuthService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  // ------------------------------------------------------------------
  // Registro (solo para seed / admin CRUD en IT-05).
  // ------------------------------------------------------------------
  async registerAdmin(params: {
    email: string;
    name: string;
    password: string;
  }): Promise<PublicUserDto> {
    const email = params.email.trim().toLowerCase();
    const passwordHash = await hashPassword(params.password);

    const user = await this.db.user.upsert({
      where: { email },
      update: {
        name: params.name,
        passwordHash,
        role: 'admin',
        isActive: true,
      },
      create: {
        email,
        name: params.name,
        passwordHash,
        role: 'admin',
        isActive: true,
      },
    });
    return toPublicUser(user);
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------
  async login(rawEmail: string, password: string, ctx: SessionContext = {}): Promise<LoginResult> {
    const email = (rawEmail ?? '').trim().toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      // Ejecutamos un hash fake para reducir (aunque no eliminar) diferencia
      // de timing entre email válido e inválido.
      await verifyPassword(password ?? '', DUMMY_BCRYPT_HASH);
      throw AuthError.invalidCredentials();
    }

    const ok = await verifyPassword(password ?? '', user.passwordHash);
    if (!ok) throw AuthError.invalidCredentials();

    return this.issueSession(user, ctx);
  }

  // ------------------------------------------------------------------
  // Refresh con rotación
  // ------------------------------------------------------------------
  async refresh(rawRefreshToken: string, ctx: SessionContext = {}): Promise<LoginResult> {
    if (!rawRefreshToken) throw AuthError.invalidCredentials();

    const payload = verifyRefreshToken(rawRefreshToken); // firma + expiración
    const hash = hashRefreshToken(rawRefreshToken);
    const now = new Date();

    const session = await this.db.session.findUnique({ where: { id: payload.sid } });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.refreshTokenHash !== hash ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      // Posible reuso de refresh → revoca todas las sesiones del usuario como mitigación.
      if (session && session.revokedAt !== null) {
        await this.db.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      throw AuthError.invalidCredentials();
    }

    const user = await this.db.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.isActive) throw AuthError.invalidCredentials();

    // Rotación: revoca sesión actual y emite una nueva.
    await this.db.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });

    return this.issueSession(user, ctx);
  }

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------
  async logout(sessionId: string): Promise<void> {
    if (!sessionId) return;
    await this.db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAllOfUser(userId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ------------------------------------------------------------------
  // Helpers usados por middleware (IT-09)
  // ------------------------------------------------------------------
  async getUserForToken(payload: AccessTokenPayload): Promise<PublicUserDto> {
    const user = await this.db.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw AuthError.invalidCredentials();

    const session = await this.db.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt !== null) throw AuthError.expired();

    return toPublicUser(user);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------
  private async issueSession(user: User, ctx: SessionContext): Promise<LoginResult> {
    // Generamos el id de sesión aquí (no via @default(cuid())) porque el
    // refresh token embebe `sid` y necesitamos el id ANTES de insertar.
    const sessionId = 'ses_' + randomSessionId();

    const refresh = signRefreshToken({ sub: user.id, sid: sessionId });

    // En la tabla Session pre-declaramos el id para que el jwt lo referencie.
    const session = await this.db.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: refresh.hash,
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
        expiresAt: refresh.expiresAt,
      },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      sid: session.id,
    });
    const accessExpiresAt = decodeExpiry(accessToken);

    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: toPublicUser({ ...user, lastLoginAt: new Date() }),
      sessionId: session.id,
      tokens: {
        accessToken,
        refreshToken: refresh.token,
        accessExpiresAt,
        refreshExpiresAt: refresh.expiresAt,
      },
    };
  }
}

// ---------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------

function randomSessionId(): string {
  // Node 20 expone globalThis.crypto (Web Crypto). En tipos de TS sin lib `dom`
  // el global es opcional; lo accedemos vía cast a unknown para no depender
  // de la global `Crypto` (lib DOM) que el backend no incluye.
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  throw AuthError.internal('Web Crypto no disponible en runtime');
}

function decodeExpiry(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) throw AuthError.internal('Token sin exp');
  return new Date(decoded.exp * 1000);
}

// Instancia por defecto usando el singleton Prisma.
export const authService = new AuthService();
