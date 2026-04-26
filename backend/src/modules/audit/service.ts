// Audit log service.
// Stub mínimo para IT-06 (credential vault lo usa). Se amplía en IT-09 con:
// - helper HTTP para capturar IP/userAgent/correlation id
// - middleware que inyecta `actorUserId` automáticamente desde la sesión
// - consultas paginadas para UJ-14 (admin audit view)
//
// Diseño:
// - metadata debe ser siempre seguro de loggear (sin secretos ni PII crítica).
// - Los valores "antes/después" para cambios sensibles se guardan como diffs
//   de metadata NO sensibles (ej. `{ provider: "google_places", changed: ["label"] }`).
//   NUNCA guardamos ciphertext ni plaintext.

import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../../core/prisma/client.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

export class AuditService {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = defaultPrisma) {
    this.db = db;
  }

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
        ip: entry.ip ?? null,
      },
    });
  }
}

export const auditService = new AuditService();
