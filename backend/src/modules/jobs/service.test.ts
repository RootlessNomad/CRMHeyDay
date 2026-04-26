import type { Job, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobNotFoundError, JobsService } from './service.js';

interface FakeDb {
  jobs: Map<string, Job>;
}

function makePrisma(db: FakeDb): PrismaClient {
  const prisma = {
    job: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return db.jobs.get(where.id) ?? null;
      }),
      findMany: vi.fn(async ({ take }: { take?: number } = {}) => {
        const all = [...db.jobs.values()].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return typeof take === 'number' ? all.slice(0, take) : all;
      }),
    },
  };
  return prisma as unknown as PrismaClient;
}

function mkJob(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    queue: 'enrichment',
    status: 'succeeded',
    payload: { companyId: 'c_1' } as Job['payload'],
    result: { placeholder: true } as Job['result'],
    error: null,
    startedAt: new Date('2026-04-20T10:00:00Z'),
    finishedAt: new Date('2026-04-20T10:00:01Z'),
    createdAt: new Date('2026-04-20T09:59:59Z'),
    ...overrides,
  };
}

describe('JobsService', () => {
  let db: FakeDb;
  let service: JobsService;

  beforeEach(() => {
    db = { jobs: new Map() };
    service = new JobsService(makePrisma(db));
  });

  it('getById devuelve el job completo con payload y result', async () => {
    db.jobs.set('job_1', mkJob('job_1'));
    const dto = await service.getById('job_1');
    expect(dto.id).toBe('job_1');
    expect(dto.status).toBe('succeeded');
    expect(dto.payload).toEqual({ companyId: 'c_1' });
    expect(dto.result).toEqual({ placeholder: true });
  });

  it('getById lanza JobNotFoundError para id inexistente', async () => {
    await expect(service.getById('nope')).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it('listRecent ordena por createdAt desc y respeta el limit', async () => {
    db.jobs.set('j_old', mkJob('j_old', { createdAt: new Date('2026-04-19T00:00:00Z') }));
    db.jobs.set('j_new', mkJob('j_new', { createdAt: new Date('2026-04-20T00:00:00Z') }));

    const list = await service.listRecent(50);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe('j_new');
  });

  it('listRecent clamp del limit a 200', async () => {
    const list = await service.listRecent(9999);
    expect(list).toHaveLength(0);
  });
});
