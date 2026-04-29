import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/service.js';
import { CompaniesImportService, ImportCapError, ImportHeaderError } from './service.js';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    company: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../core/prisma/client.js', () => ({
  prisma: prismaMock,
}));

function csv(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf-8');
}

describe('CompaniesImportService', () => {
  let service: CompaniesImportService;

  beforeEach(() => {
    prismaMock.company.create.mockReset();
    prismaMock.company.findMany.mockReset();
    prismaMock.auditLog.create.mockReset();
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.company.create.mockImplementation(async ({ data }) => ({
      id: `company_${prismaMock.company.create.mock.calls.length}`,
      ...data,
    }));
    service = new CompaniesImportService(
      prismaMock as unknown as PrismaClient,
      new AuditService(prismaMock as unknown as PrismaClient),
    );
  });

  it('CSV válido sin dominios crea todas las filas', async () => {
    const result = await service.run(
      csv(['name,email', 'Alpha,alpha@test.com', 'Beta,beta@test.com']),
      'user_1',
      false,
    );

    expect(result.rows_created).toBe(2);
    expect(result.rows_failed).toBe(0);
    expect(prismaMock.company.create).toHaveBeenCalledTimes(2);
  });

  it('dry_run=true no inserta pero cuenta filas creables', async () => {
    const result = await service.run(csv(['name', 'Alpha', 'Beta']), 'user_1', true);

    expect(result.rows_created).toBe(2);
    expect(prismaMock.company.create).not.toHaveBeenCalled();
  });

  it('cabecera name faltante lanza ImportHeaderError', async () => {
    await expect(
      service.run(csv(['domain', 'alpha.test']), 'user_1', false),
    ).rejects.toBeInstanceOf(ImportHeaderError);
  });

  it('fila con name vacío suma error', async () => {
    const result = await service.run(csv(['name,email', ',alpha@test.com']), 'user_1', false);

    expect(result.rows_failed).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 1, code: 'validation', field: 'name' });
  });

  it('fila con email inválido suma error', async () => {
    const result = await service.run(csv(['name,email', 'Alpha,no-es-email']), 'user_1', false);

    expect(result.rows_failed).toBe(1);
    expect(result.errors[0]).toMatchObject({ row: 1, code: 'validation', field: 'email' });
  });

  it('fila con icp_vertical fuera de enum suma error', async () => {
    const result = await service.run(
      csv(['name,icp_vertical', 'Alpha,not_an_enum']),
      'user_1',
      false,
    );

    expect(result.rows_failed).toBe(1);
    expect(result.errors[0]).toMatchObject({
      row: 1,
      code: 'validation',
      field: 'icp_vertical',
    });
  });

  it('dominio repetido dentro del CSV marca duplicate_in_csv', async () => {
    const result = await service.run(
      csv(['name,domain', 'Alpha,dup.test', 'Beta,https://www.dup.test/']),
      'user_1',
      false,
    );

    expect(result.rows_created).toBe(1);
    expect(result.rows_skipped_duplicate).toBe(1);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ row: 2, code: 'duplicate_in_csv', field: 'domain' }),
    );
  });

  it('dominio ya existente en DB suma skipped_duplicate', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'company_existing', domain: 'dup.test' }]);

    const result = await service.run(csv(['name,domain', 'Alpha,dup.test']), 'user_1', false);

    expect(result.rows_created).toBe(0);
    expect(result.rows_skipped_duplicate).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: 'duplicate_in_db',
      existing_id: 'company_existing',
    });
  });

  it('dominio soft-deleted en DB se permite crear si no vuelve en findMany', async () => {
    prismaMock.company.findMany.mockResolvedValue([]);

    const result = await service.run(csv(['name,domain', 'Alpha,soft.test']), 'user_1', false);

    expect(result.rows_created).toBe(1);
    expect(prismaMock.company.create).toHaveBeenCalledTimes(1);
  });

  it('cabecera desconocida se ignora y la fila se procesa', async () => {
    const result = await service.run(csv(['name,foo_bar', 'Alpha,ignored']), 'user_1', false);

    expect(result.rows_created).toBe(1);
    expect(result.rows_failed).toBe(0);
  });

  it('BOM UTF-8 se parsea correctamente', async () => {
    const result = await service.run(Buffer.from('\uFEFFname\nAlpha', 'utf-8'), 'user_1', false);

    expect(result.rows_created).toBe(1);
  });

  it('más de 1000 filas lanza ImportCapError antes de parsear', async () => {
    const lines = ['name', ...Array.from({ length: 1001 }, (_, index) => `Company ${index + 1}`)];

    await expect(service.run(csv(lines), 'user_1', false)).rejects.toBeInstanceOf(ImportCapError);
    expect(prismaMock.company.findMany).not.toHaveBeenCalled();
    expect(prismaMock.company.create).not.toHaveBeenCalled();
  });
});
