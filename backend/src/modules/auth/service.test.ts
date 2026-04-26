import type { PrismaClient, Session, User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../core/auth/password.js';
import { AuthError } from '../../core/auth/errors.js';
import { AuthService } from './service.js';

// ----- Fake Prisma mínimo -------------------------------------------------

interface FakeDb {
  users: Map<string, User>;
  sessions: Map<string, Session>;
}

function buildFakeDb(): FakeDb {
  return { users: new Map(), sessions: new Map() };
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return db.users.get(where.id) ?? null;
        if (where.email) {
          const wantedEmail = where.email.toLowerCase();
          return [...db.users.values()].find((u) => u.email === wantedEmail) ?? null;
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        const existing = db.users.get(where.id);
        if (!existing) throw new Error('user not found');
        const updated = { ...existing, ...data, updatedAt: new Date() } as User;
        db.users.set(where.id, updated);
        return updated;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { email: string };
          create: Partial<User> & { email: string };
          update: Partial<User>;
        }) => {
          const existing = [...db.users.values()].find((u) => u.email === where.email);
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: new Date() } as User;
            db.users.set(existing.id, updated);
            return updated;
          }
          const id = 'user_' + (db.users.size + 1);
          const row: User = {
            id,
            email: create.email,
            passwordHash: create.passwordHash!,
            name: create.name ?? '',
            role: create.role ?? 'admin',
            isActive: create.isActive ?? true,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          db.users.set(id, row);
          return row;
        },
      ),
    },
    session: {
      create: vi.fn(async ({ data }: { data: Omit<Session, 'createdAt' | 'revokedAt'> }) => {
        const row: Session = {
          ...data,
          revokedAt: null,
          createdAt: new Date(),
        } as Session;
        db.sessions.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return db.sessions.get(where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Session> }) => {
        const s = db.sessions.get(where.id);
        if (!s) throw new Error('session not found');
        const updated = { ...s, ...data } as Session;
        db.sessions.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { userId?: string; id?: string; revokedAt?: null };
          data: Partial<Session>;
        }) => {
          let count = 0;
          for (const s of db.sessions.values()) {
            if (where.userId && s.userId !== where.userId) continue;
            if (where.id && s.id !== where.id) continue;
            if (where.revokedAt === null && s.revokedAt !== null) continue;
            Object.assign(s, data);
            count++;
          }
          return { count };
        },
      ),
    },
  };
  return prisma as unknown as PrismaClient;
}

// ----- Helpers ------------------------------------------------------------

async function seedUser(db: FakeDb, overrides: Partial<User> = {}): Promise<User> {
  const passwordHash = await hashPassword('correct-horse-battery-staple');
  const id = overrides.id ?? 'user_test';
  const user: User = {
    id,
    email: overrides.email ?? 'alex@heyday.studio',
    passwordHash,
    name: overrides.name ?? 'Alex',
    role: overrides.role ?? 'admin',
    isActive: overrides.isActive ?? true,
    lastLoginAt: overrides.lastLoginAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.users.set(id, user);
  return user;
}

// ----- Tests --------------------------------------------------------------

describe('AuthService', () => {
  let db: FakeDb;
  let prisma: PrismaClient;
  let service: AuthService;

  beforeEach(() => {
    db = buildFakeDb();
    prisma = makePrismaMock(db);
    service = new AuthService(prisma);
  });

  it('login happy path: devuelve user, tokens y crea sesión; actualiza lastLoginAt', async () => {
    await seedUser(db);

    const result = await service.login('alex@heyday.studio', 'correct-horse-battery-staple', {
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });

    expect(result.user.email).toBe('alex@heyday.studio');
    expect(result.tokens.accessToken).toMatch(/^ey/);
    expect(result.tokens.refreshToken).toMatch(/^ey/);
    expect(db.sessions.size).toBe(1);
    const [session] = [...db.sessions.values()];
    expect(session!.userId).toBe('user_test');
    expect(session!.revokedAt).toBeNull();
    expect(session!.userAgent).toBe('vitest');

    const user = db.users.get('user_test')!;
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it('login con password incorrecta lanza AUTH_INVALID_CREDENTIALS', async () => {
    await seedUser(db);
    await expect(
      service.login('alex@heyday.studio', 'wrong-password-xxx', {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(db.sessions.size).toBe(0);
  });

  it('login con email inexistente lanza AUTH_INVALID_CREDENTIALS (mismo error, anti-enum)', async () => {
    await expect(
      service.login('ghost@heyday.studio', 'whatever-long-enough-pw', {}),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('login de usuario inactivo lanza AUTH_INVALID_CREDENTIALS', async () => {
    await seedUser(db, { isActive: false });
    await expect(
      service.login('alex@heyday.studio', 'correct-horse-battery-staple', {}),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('refresh rota: revoca sesión antigua, emite nueva y mantiene mismo userId', async () => {
    await seedUser(db);
    const first = await service.login('alex@heyday.studio', 'correct-horse-battery-staple');

    const second = await service.refresh(first.tokens.refreshToken);

    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.user.id).toBe(first.user.id);

    const oldSession = db.sessions.get(first.sessionId)!;
    expect(oldSession.revokedAt).not.toBeNull();

    const newSession = db.sessions.get(second.sessionId)!;
    expect(newSession.revokedAt).toBeNull();
  });

  it('refresh con un token ya revocado lanza AUTH_INVALID_CREDENTIALS y purga el resto de sesiones activas', async () => {
    await seedUser(db);
    const first = await service.login('alex@heyday.studio', 'correct-horse-battery-staple');
    await service.refresh(first.tokens.refreshToken); // revoca la primera

    // Re-uso del primer refresh → reuse attack
    await expect(service.refresh(first.tokens.refreshToken)).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });

    // Tras reuso, TODAS las sesiones del usuario deben quedar revocadas (defense-in-depth).
    const active = [...db.sessions.values()].filter((s) => s.revokedAt === null);
    expect(active.length).toBe(0);
  });

  it('logout revoca la sesión y un segundo logout es idempotente', async () => {
    await seedUser(db);
    const { sessionId } = await service.login('alex@heyday.studio', 'correct-horse-battery-staple');

    await service.logout(sessionId);
    expect(db.sessions.get(sessionId)!.revokedAt).not.toBeNull();

    // No lanza ni afecta otras sesiones
    await expect(service.logout(sessionId)).resolves.toBeUndefined();
  });

  it('getUserForToken rechaza si la sesión está revocada (AUTH_EXPIRED)', async () => {
    await seedUser(db);
    const { tokens, sessionId, user } = await service.login(
      'alex@heyday.studio',
      'correct-horse-battery-staple',
    );
    await service.logout(sessionId);

    const { verifyAccessToken } = await import('../../core/auth/tokens.js');
    const payload = verifyAccessToken(tokens.accessToken);

    await expect(service.getUserForToken(payload)).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
    // El user sigue existiendo, sólo la sesión está muerta
    expect(db.users.get(user.id)).toBeDefined();
  });
});
