import type { Job, PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// IMPORTANTE: el mock debe declararse ANTES de importar el módulo que usa bullmq.
vi.mock('bullmq', () => {
  const add = vi.fn(async (_name: string, _data: unknown, opts: { jobId?: string }) => ({
    id: opts.jobId ?? 'bull_1',
  }));
  const close = vi.fn(async () => {});
  class FakeQueue {
    add = add;
    close = close;
  }
  return { Queue: FakeQueue, Worker: class {} };
});

// Stub de la conexión Redis para evitar conectar de verdad.
vi.mock('./connection.js', () => ({
  redis: {} as unknown,
  QUEUE_PREFIX: 'heyday-test',
  closeRedis: async () => {},
}));

import { enqueue } from './queues.js';
import { InvalidJobPayloadError, QUEUE_NAMES } from './types.js';

// ----- Fake Prisma ---------------------------------------------------------

interface FakeJobsDb {
  jobs: Map<string, Job>;
}

function buildDb(): FakeJobsDb {
  return { jobs: new Map() };
}

function makePrisma(db: FakeJobsDb): PrismaClient {
  let counter = 0;
  const prisma = {
    job: {
      create: vi.fn(async ({ data }: { data: Partial<Job> }) => {
        const id = 'job_' + ++counter;
        const row: Job = {
          id,
          queue: data.queue!,
          status: data.status ?? 'queued',
          payload: (data.payload ?? {}) as Job['payload'],
          result: null,
          error: null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(),
        };
        db.jobs.set(id, row);
        return row;
      }),
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

// ----- Tests ----------------------------------------------------------------

describe('enqueue', () => {
  let db: FakeJobsDb;
  let prisma: PrismaClient;

  beforeEach(() => {
    db = buildDb();
    prisma = makePrisma(db);
  });

  it('encola un job válido y crea el mirror con status=queued', async () => {
    const res = await enqueue(
      QUEUE_NAMES.enrichment,
      { companyId: 'c_1', reason: 'manual' },
      { db: prisma },
    );
    expect(res.jobId).toBeDefined();
    expect(res.bullJobId).toBe(res.jobId);

    const row = db.jobs.get(res.jobId);
    expect(row?.queue).toBe('enrichment');
    expect(row?.status).toBe('queued');
  });

  it('rechaza payload inválido sin crear mirror', async () => {
    await expect(
      enqueue(
        QUEUE_NAMES.enrichment,
        // companyId vacío viola min(1)
        { companyId: '', reason: 'manual' },
        { db: prisma },
      ),
    ).rejects.toBeInstanceOf(InvalidJobPayloadError);

    expect(db.jobs.size).toBe(0);
  });

  it('usa el schema correcto para cada queue (content_generation)', async () => {
    const res = await enqueue(
      QUEUE_NAMES.contentGeneration,
      { contentItemId: 'ci_1', actorUserId: 'u_1' },
      { db: prisma },
    );
    expect(db.jobs.get(res.jobId)?.queue).toBe('content_generation');
  });

  it('integration_test rechaza si falta credentialId', async () => {
    await expect(
      enqueue(
        QUEUE_NAMES.integrationTest,
        // @ts-expect-error — falta credentialId a propósito
        { actorUserId: 'u_1' },
        { db: prisma },
      ),
    ).rejects.toBeInstanceOf(InvalidJobPayloadError);
  });
});
