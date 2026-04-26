import type { Credential, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../audit/service.js';
import {
  CredentialConflictError,
  CredentialNotFoundError,
  CredentialsService,
  type CredentialPublicDto,
} from './service.js';

// ----- Fake Prisma ---------------------------------------------------------

interface FakeDb {
  credentials: Map<string, Credential>;
  auditCalls: Array<{ action: string; actorUserId?: string | null; entityId?: string | null }>;
}

function buildFakeDb(): FakeDb {
  return { credentials: new Map(), auditCalls: [] };
}

function makePrismaMock(db: FakeDb): PrismaClient {
  const prisma = {
    credential: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; key?: string } }) => {
        if (where.id) return db.credentials.get(where.id) ?? null;
        if (where.key) {
          return [...db.credentials.values()].find((c) => c.key === where.key) ?? null;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { keyVersion?: { lt: number } } } = {}) => {
        const all = [...db.credentials.values()];
        if (where?.keyVersion?.lt) {
          const limit = where.keyVersion.lt;
          return all.filter((c) => c.keyVersion < limit);
        }
        return all;
      }),
      create: vi.fn(async ({ data }: { data: Partial<Credential> & { key: string } }) => {
        const id = 'cred_' + (db.credentials.size + 1);
        const row: Credential = {
          id,
          key: data.key,
          provider: data.provider!,
          label: data.label!,
          ciphertext: data.ciphertext as Buffer,
          iv: data.iv as Buffer,
          authTag: data.authTag as Buffer,
          keyVersion: data.keyVersion ?? 1,
          isActive: data.isActive ?? true,
          lastUsedAt: null,
          lastRotatedAt: null,
          createdById: data.createdById!,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        db.credentials.set(id, row);
        return row;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<Credential> }) => {
          const existing = db.credentials.get(where.id);
          if (!existing) throw new Error('credential not found');
          const updated = { ...existing, ...data, updatedAt: new Date() } as Credential;
          db.credentials.set(where.id, updated);
          return updated;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const existing = db.credentials.get(where.id);
        if (!existing) throw new Error('credential not found');
        db.credentials.delete(where.id);
        return existing;
      }),
    },
  };
  return prisma as unknown as PrismaClient;
}

function makeAuditMock(db: FakeDb): AuditService {
  const mock = {
    record: vi.fn(
      async (entry: { action: string; actorUserId?: string | null; entityId?: string | null }) => {
        db.auditCalls.push({
          action: entry.action,
          actorUserId: entry.actorUserId ?? null,
          entityId: entry.entityId ?? null,
        });
      },
    ),
  };
  return mock as unknown as AuditService;
}

// ----- Tests ---------------------------------------------------------------

describe('CredentialsService', () => {
  let db: FakeDb;
  let service: CredentialsService;

  beforeEach(() => {
    db = buildFakeDb();
    const prisma = makePrismaMock(db);
    const audit = makeAuditMock(db);
    service = new CredentialsService(prisma, audit);
  });

  async function seedOne(): Promise<CredentialPublicDto> {
    return service.create({
      key: 'anthropic_primary',
      provider: 'anthropic',
      label: 'Clave principal Anthropic',
      plaintext: 'sk-ant-api03-very-secret',
      actorUserId: 'user_alex',
    });
  }

  it('create cifra y no persiste el plaintext en la fila', async () => {
    const created = await seedOne();
    expect(created.key).toBe('anthropic_primary');
    expect(created.isActive).toBe(true);

    const row = db.credentials.get(created.id)!;
    expect(row.ciphertext.toString('utf8')).not.toContain('sk-ant');
    expect(row.iv).toHaveLength(12);
    expect(row.authTag).toHaveLength(16);
    expect(row.keyVersion).toBe(1);

    expect(db.auditCalls).toContainEqual(
      expect.objectContaining({ action: 'credential.create', actorUserId: 'user_alex' }),
    );
  });

  it('create rechaza duplicado por key con CredentialConflictError', async () => {
    await seedOne();
    await expect(seedOne()).rejects.toBeInstanceOf(CredentialConflictError);
  });

  it('listPublic y getPublicById no exponen ciphertext ni iv ni authTag', async () => {
    const created = await seedOne();
    const list = await service.listPublic();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('ciphertext');
    expect(list[0]).not.toHaveProperty('iv');
    expect(list[0]).not.toHaveProperty('authTag');

    const one = await service.getPublicById(created.id);
    expect(one).not.toHaveProperty('ciphertext');
    expect(one?.key).toBe('anthropic_primary');
  });

  it('reveal devuelve el plaintext y actualiza lastUsedAt', async () => {
    const created = await seedOne();
    const plaintext = await service.reveal('anthropic_primary');
    expect(plaintext).toBe('sk-ant-api03-very-secret');

    const row = db.credentials.get(created.id)!;
    expect(row.lastUsedAt).toBeInstanceOf(Date);
  });

  it('reveal lanza CredentialNotFoundError para key inexistente', async () => {
    await expect(service.reveal('no-existe')).rejects.toBeInstanceOf(CredentialNotFoundError);
  });

  it('reveal de credential desactivada lanza CredentialNotFoundError', async () => {
    const created = await seedOne();
    await service.setActive(created.id, false, 'user_alex');
    await expect(service.reveal('anthropic_primary')).rejects.toBeInstanceOf(
      CredentialNotFoundError,
    );
  });

  it('rotate cambia ciphertext, bump lastRotatedAt y registra audit', async () => {
    const created = await seedOne();
    const before = db.credentials.get(created.id)!;

    const updated = await service.rotate({
      id: created.id,
      newPlaintext: 'sk-ant-api03-rotated-xyz',
      actorUserId: 'user_alba',
    });

    const after = db.credentials.get(created.id)!;
    expect(after.ciphertext.equals(before.ciphertext)).toBe(false);
    expect(after.iv.equals(before.iv)).toBe(false);
    expect(updated.lastRotatedAt).toBeInstanceOf(Date);

    // El nuevo plaintext debe descifrarse correctamente
    expect(await service.reveal('anthropic_primary')).toBe('sk-ant-api03-rotated-xyz');

    expect(db.auditCalls).toContainEqual(
      expect.objectContaining({ action: 'credential.rotate', actorUserId: 'user_alba' }),
    );
  });

  it('setActive(false)/setActive(true) registra activate/deactivate en audit', async () => {
    const created = await seedOne();
    await service.setActive(created.id, false, 'user_alex');
    await service.setActive(created.id, true, 'user_alex');

    const actions = db.auditCalls.map((a) => a.action);
    expect(actions).toContain('credential.deactivate');
    expect(actions).toContain('credential.activate');
  });

  it('delete elimina la fila y registra audit', async () => {
    const created = await seedOne();
    await service.delete(created.id, 'user_alex');
    expect(db.credentials.size).toBe(0);
    expect(db.auditCalls.map((a) => a.action)).toContain('credential.delete');
  });

  it('delete de id inexistente lanza CredentialNotFoundError', async () => {
    await expect(service.delete('nope', 'user_alex')).rejects.toBeInstanceOf(
      CredentialNotFoundError,
    );
  });
});
