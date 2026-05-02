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

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date;
}

function toAuditLogDto(row: {
  id: bigint;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
}): AuditLogDto {
  return {
    id: row.id.toString(),
    actorUserId: row.actorUserId,
    actorName: row.actor?.name ?? null,
    actorEmail: row.actor?.email ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    ip: row.ip,
    createdAt: row.createdAt,
  };
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

  async listPaginated(params: {
    actorUserId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ items: AuditLogDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const where = {
      actorUserId: params.actorUserId,
      action: params.action,
      createdAt:
        params.from || params.to
          ? {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            }
          : undefined,
    } satisfies Prisma.AuditLogWhereInput;

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.db.auditLog.count({ where }),
    ]);

    return {
      items: items.map(toAuditLogDto),
      total,
      page,
      limit,
    };
  }
}

export const auditService = new AuditService();
