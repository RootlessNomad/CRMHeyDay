import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GdprService } from './service.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn() },
    activity: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    aiUsageLog: { deleteMany: vi.fn() },
    externalApiUsageLog: { deleteMany: vi.fn() },
  },
}));

vi.mock('../../core/prisma/client.js', () => ({ prisma: prismaMock }));
vi.mock('../contacts/service.js', async (importOriginal) => {
  return importOriginal();
});

describe('GdprService', () => {
  let service: GdprService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GdprService(prismaMock as unknown as PrismaClient);
  });

  it('exportContactData lanza ContactNotFoundError si contacto no existe', async () => {
    prismaMock.contact.findFirst.mockResolvedValue(null);

    await expect(service.exportContactData('missing')).rejects.toMatchObject({
      name: 'ContactNotFoundError',
    });
  });

  it('exportContactData retorna DTO con contact, activities y leads', async () => {
    const now = new Date('2026-05-01T10:00:00.000Z');
    prismaMock.contact.findFirst.mockResolvedValue({
      id: 'c1',
      firstName: 'Ana',
      lastName: 'García',
      roleTitle: 'CTO',
      email: 'ana@example.com',
      phone: null,
      whatsapp: null,
      linkedinUrl: null,
      isPrimary: true,
      consentStatus: 'public_business_data_only',
      createdAt: now,
      updatedAt: now,
      anonymizedAt: null,
      deletedAt: null,
    });
    prismaMock.activity.findMany.mockResolvedValue([]);
    prismaMock.lead.findMany.mockResolvedValue([]);

    const result = await service.exportContactData('c1');

    expect(result.contact.id).toBe('c1');
    expect(result.activities).toHaveLength(0);
    expect(result.leads).toHaveLength(0);
    expect(result.exportedAt).toBeDefined();
  });

  it('purgeOldLogs elimina logs más viejos que retentionDays y devuelve conteos', async () => {
    prismaMock.aiUsageLog.deleteMany.mockResolvedValue({ count: 42 });
    prismaMock.externalApiUsageLog.deleteMany.mockResolvedValue({ count: 7 });

    const result = await service.purgeOldLogs(90);

    expect(result).toEqual({ aiLogsDeleted: 42, externalLogsDeleted: 7, retentionDays: 90 });
    expect(prismaMock.aiUsageLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });
});
