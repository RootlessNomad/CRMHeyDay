// CredentialsService — CRUD + rotación + revelado interno de secretos Level 3.
//
// Regla de oro: ni `plaintext` ni `ciphertext` salen por la API HTTP. Sólo
// `reveal()` devuelve el plaintext, y está pensado para llamadas internas
// (e.g. `core/config/secrets.ts` que resuelve on-demand al llamar a una API
// externa). `listPublic()` / `getPublic()` exponen únicamente metadatos.
//
// Todas las operaciones mutables escriben en audit_log con metadatos NO
// sensibles (key, provider, acción). Nunca guardamos el plaintext en el log.

import type { Credential, Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';
import {
  VAULT_CURRENT_KEY_VERSION,
  VaultError,
  decrypt,
  encrypt,
  reencryptToCurrent,
  type EncryptedSecret,
} from '../../core/crypto/vault.js';
import { auditService, type AuditService } from '../audit/service.js';

export interface CredentialPublicDto {
  id: string;
  key: string;
  provider: string;
  label: string;
  keyVersion: number;
  isActive: boolean;
  lastUsedAt: Date | null;
  lastRotatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  key: string;
  provider: string;
  label: string;
  plaintext: string;
  actorUserId: string;
}

export interface RotateCredentialInput {
  id: string;
  newPlaintext: string;
  actorUserId: string;
}

export interface HealthDto {
  lastStatus: 'ok' | 'warn' | 'error' | 'unknown';
  lastCheckedAt: Date | null;
  lastError: string | null;
  successCount24h: number;
  errorCount24h: number;
}

export interface CredentialWithHealthDto extends CredentialPublicDto {
  health: HealthDto | null;
}

export class CredentialNotFoundError extends Error {
  readonly code = 'CREDENTIAL_NOT_FOUND';
  constructor(idOrKey: string) {
    super(`Credential '${idOrKey}' no encontrada`);
    this.name = 'CredentialNotFoundError';
  }
}

export class CredentialConflictError extends Error {
  readonly code = 'CREDENTIAL_CONFLICT';
  constructor(key: string) {
    super(`Ya existe una credential con key '${key}'`);
    this.name = 'CredentialConflictError';
  }
}

function toPublic(c: Credential): CredentialPublicDto {
  return {
    id: c.id,
    key: c.key,
    provider: c.provider,
    label: c.label,
    keyVersion: c.keyVersion,
    isActive: c.isActive,
    lastUsedAt: c.lastUsedAt,
    lastRotatedAt: c.lastRotatedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toHealth(
  h: {
    lastStatus: string;
    lastCheckedAt: Date | null;
    lastError: string | null;
    successCount24h: number;
    errorCount24h: number;
  } | null,
): HealthDto | null {
  if (!h) return null;
  return {
    lastStatus: h.lastStatus as HealthDto['lastStatus'],
    lastCheckedAt: h.lastCheckedAt,
    lastError: h.lastError,
    successCount24h: h.successCount24h,
    errorCount24h: h.errorCount24h,
  };
}

function rowToEncrypted(c: Credential): EncryptedSecret {
  return {
    ciphertext: Buffer.from(c.ciphertext),
    iv: Buffer.from(c.iv),
    authTag: Buffer.from(c.authTag),
    keyVersion: c.keyVersion,
  };
}

export class CredentialsService {
  private readonly db: PrismaClient;
  private readonly audit: AuditService;

  constructor(db: PrismaClient = defaultPrisma, audit: AuditService = auditService) {
    this.db = db;
    this.audit = audit;
  }

  // ------------------------------------------------------------------
  // Consultas públicas (NO devuelven secretos)
  // ------------------------------------------------------------------
  async listPublic(): Promise<CredentialPublicDto[]> {
    const rows = await this.db.credential.findMany({ orderBy: { key: 'asc' } });
    return rows.map(toPublic);
  }

  async getPublicById(id: string): Promise<CredentialPublicDto | null> {
    const row = await this.db.credential.findUnique({ where: { id } });
    return row ? toPublic(row) : null;
  }

  async getPublicByKey(key: string): Promise<CredentialPublicDto | null> {
    const row = await this.db.credential.findUnique({ where: { key } });
    return row ? toPublic(row) : null;
  }

  // ------------------------------------------------------------------
  // Revelado interno (SÓLO para servicios del backend; nunca expuesto por HTTP)
  // ------------------------------------------------------------------
  async reveal(key: string): Promise<string> {
    const row = await this.db.credential.findUnique({ where: { key } });
    if (!row || !row.isActive) throw new CredentialNotFoundError(key);

    const plaintext = decrypt(rowToEncrypted(row));

    // Actualizamos lastUsedAt de forma best-effort (no bloqueamos si falla).
    await this.db.credential
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        /* ignorar errores de update; no queremos romper la llamada de negocio */
      });

    return plaintext;
  }

  // ------------------------------------------------------------------
  // Mutaciones
  // ------------------------------------------------------------------
  async create(input: CreateCredentialInput): Promise<CredentialPublicDto> {
    const existing = await this.db.credential.findUnique({ where: { key: input.key } });
    if (existing) throw new CredentialConflictError(input.key);

    const enc = encrypt(input.plaintext);

    const created = await this.db.credential.create({
      data: {
        key: input.key,
        provider: input.provider,
        label: input.label,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyVersion: enc.keyVersion,
        isActive: true,
        createdById: input.actorUserId,
      },
    });

    await this.audit.record({
      action: 'credential.create',
      actorUserId: input.actorUserId,
      entityType: 'credential',
      entityId: created.id,
      metadata: {
        key: created.key,
        provider: created.provider,
      },
    });

    return toPublic(created);
  }

  async rotate(input: RotateCredentialInput): Promise<CredentialPublicDto> {
    const existing = await this.db.credential.findUnique({ where: { id: input.id } });
    if (!existing) throw new CredentialNotFoundError(input.id);

    const enc = encrypt(input.newPlaintext);
    const now = new Date();

    const updated = await this.db.credential.update({
      where: { id: input.id },
      data: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyVersion: enc.keyVersion,
        lastRotatedAt: now,
      },
    });

    await this.audit.record({
      action: 'credential.rotate',
      actorUserId: input.actorUserId,
      entityType: 'credential',
      entityId: updated.id,
      metadata: {
        key: updated.key,
        provider: updated.provider,
        keyVersion: updated.keyVersion,
      },
    });

    return toPublic(updated);
  }

  async setActive(
    id: string,
    isActive: boolean,
    actorUserId: string,
  ): Promise<CredentialPublicDto> {
    const existing = await this.db.credential.findUnique({ where: { id } });
    if (!existing) throw new CredentialNotFoundError(id);

    const updated = await this.db.credential.update({
      where: { id },
      data: { isActive },
    });

    await this.audit.record({
      action: isActive ? 'credential.activate' : 'credential.deactivate',
      actorUserId,
      entityType: 'credential',
      entityId: updated.id,
      metadata: { key: updated.key, provider: updated.provider },
    });

    return toPublic(updated);
  }

  async delete(id: string, actorUserId: string): Promise<void> {
    const existing = await this.db.credential.findUnique({ where: { id } });
    if (!existing) throw new CredentialNotFoundError(id);

    await this.db.credential.delete({ where: { id } });

    await this.audit.record({
      action: 'credential.delete',
      actorUserId,
      entityType: 'credential',
      entityId: id,
      metadata: { key: existing.key, provider: existing.provider },
    });
  }

  // ------------------------------------------------------------------
  // Rotación de master key — re-cifra todas las que estén en versiones antiguas.
  // Llamar manualmente (script o endpoint admin) tras rotar la master key.
  // ------------------------------------------------------------------
  async reencryptAllToCurrentKeyVersion(actorUserId: string): Promise<number> {
    const stale = await this.db.credential.findMany({
      where: { keyVersion: { lt: VAULT_CURRENT_KEY_VERSION } },
    });
    let count = 0;

    for (const row of stale) {
      try {
        const reencrypted = reencryptToCurrent(rowToEncrypted(row));
        await this.db.credential.update({
          where: { id: row.id },
          data: {
            ciphertext: reencrypted.ciphertext,
            iv: reencrypted.iv,
            authTag: reencrypted.authTag,
            keyVersion: reencrypted.keyVersion,
          },
        });
        count++;
      } catch (err) {
        if (err instanceof VaultError) {
          await this.audit.record({
            action: 'credential.reencrypt_failed',
            actorUserId,
            entityType: 'credential',
            entityId: row.id,
            metadata: { key: row.key, reason: err.code },
          });
          continue;
        }
        throw err;
      }
    }

    if (count > 0) {
      await this.audit.record({
        action: 'credential.reencrypt_bulk',
        actorUserId,
        metadata: {
          newKeyVersion: VAULT_CURRENT_KEY_VERSION,
          rotatedCount: count,
        } satisfies Prisma.InputJsonValue,
      });
    }

    return count;
  }

  async listWithHealth(): Promise<CredentialWithHealthDto[]> {
    const rows = await this.db.credential.findMany({
      orderBy: { key: 'asc' },
      include: { health: true },
    });
    return rows.map((r) => ({ ...toPublic(r), health: toHealth(r.health) }));
  }

  async getWithHealthById(id: string): Promise<CredentialWithHealthDto | null> {
    const row = await this.db.credential.findUnique({
      where: { id },
      include: { health: true },
    });
    return row ? { ...toPublic(row), health: toHealth(row.health) } : null;
  }
}

export const credentialsService = new CredentialsService();
