import type { Job, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { markFailed, markRunning, markSucceeded } from './mirror.js';

interface FakeDb {
  jobs: Map<string, Job>;
}

function seed(db: FakeDb, id: string): void {
  db.jobs.set(id, {
    id,
    queue: 'enrichment',
    status: 'queued',
    payload: {} as Job['payload'],
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
  });
}

function makePrisma(db: FakeDb): PrismaClient {
  const prisma = {
    job: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Job> }) => {
        const prev = db.jobs.get(where.id);
        if (!prev) throw new Error('not found');
        const next = { ...prev, ...data } as Job;
        db.jobs.set(where.id, next);
        return next;
      }),
    },
  };
  return prisma as unknown as PrismaClient;
}

describe('mirror helpers', () => {
  let db: FakeDb;
  let prisma: PrismaClient;

  beforeEach(() => {
    db = { jobs: new Map() };
    prisma = makePrisma(db);
  });

  it('markRunning actualiza status + startedAt', async () => {
    seed(db, 'job_1');
    await markRunning('job_1', prisma);
    const row = db.jobs.get('job_1')!;
    expect(row.status).toBe('running');
    expect(row.startedAt).toBeInstanceOf(Date);
  });

  it('markSucceeded escribe result + finishedAt', async () => {
    seed(db, 'job_1');
    await markSucceeded('job_1', { placeholder: true }, prisma);
    const row = db.jobs.get('job_1')!;
    expect(row.status).toBe('succeeded');
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(row.result).toEqual({ placeholder: true });
  });

  it('markFailed escribe error truncado a 2000 chars', async () => {
    seed(db, 'job_1');
    const huge = 'x'.repeat(5000);
    await markFailed('job_1', huge, prisma);
    const row = db.jobs.get('job_1')!;
    expect(row.status).toBe('failed');
    expect(row.error?.length).toBe(2000);
  });

  it('transiciones sobre id inexistente no lanzan (best-effort)', async () => {
    await expect(markSucceeded('no_existe', {}, prisma)).resolves.toBeUndefined();
    await expect(markFailed('no_existe', 'x', prisma)).resolves.toBeUndefined();
    await expect(markRunning('no_existe', prisma)).resolves.toBeUndefined();
  });
});
