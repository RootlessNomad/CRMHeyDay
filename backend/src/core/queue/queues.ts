// Creación de las 4 queues de BullMQ + helper `enqueue` con validación zod + mirror
// a la tabla `Job` (modelo espejo que consume la UI vía `GET /jobs/:id`).
//
// Uso:
//   await enqueue(QUEUE_NAMES.enrichment, { companyId: 'c_123', reason: 'manual' });
//
// El mirror se crea ANTES de BullMQ para que, incluso si Redis cae tras el add,
// quede registrado en la DB con status `queued`. Si falla el `add` de BullMQ,
// marcamos el mirror como `failed` y lanzamos.

import { Queue, type JobsOptions } from 'bullmq';

import { prisma as defaultPrisma } from '../prisma/client.js';
import { redis, QUEUE_PREFIX } from './connection.js';
import {
  InvalidJobPayloadError,
  QUEUE_NAMES,
  QUEUE_SCHEMAS,
  type PayloadForQueue,
  type QueueName,
} from './types.js';

// ------------------------------------------------------------------
// Defaults comunes para jobs.
// ------------------------------------------------------------------
const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  // Mantenemos un histórico corto en Redis; la verdad vive en la tabla `jobs`.
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail: { count: 1000, age: 7 * 24 * 3600 },
};

function buildQueue(name: QueueName): Queue {
  return new Queue(name, {
    connection: redis,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
}

// Instanciación perezosa pero cacheada.
type QueuesMap = Record<QueueName, Queue>;
type GlobalWithQueues = typeof globalThis & { __heydayQueues?: QueuesMap };
const globalForQueues = globalThis as GlobalWithQueues;

function getQueues(): QueuesMap {
  if (globalForQueues.__heydayQueues) return globalForQueues.__heydayQueues;
  const map: QueuesMap = {
    [QUEUE_NAMES.enrichment]: buildQueue(QUEUE_NAMES.enrichment),
    [QUEUE_NAMES.discovery]: buildQueue(QUEUE_NAMES.discovery),
    [QUEUE_NAMES.leadDiscovery]: buildQueue(QUEUE_NAMES.leadDiscovery),
    [QUEUE_NAMES.contentIdea]: buildQueue(QUEUE_NAMES.contentIdea),
    [QUEUE_NAMES.contentGeneration]: buildQueue(QUEUE_NAMES.contentGeneration),
    [QUEUE_NAMES.contentAdapt]: buildQueue(QUEUE_NAMES.contentAdapt),
    [QUEUE_NAMES.integrationTest]: buildQueue(QUEUE_NAMES.integrationTest),
  };
  globalForQueues.__heydayQueues = map;
  return map;
}

export function getQueue<N extends QueueName>(name: N): Queue {
  return getQueues()[name];
}

// ------------------------------------------------------------------
// enqueue — único entrypoint para encolar. Valida payload + crea mirror.
// ------------------------------------------------------------------
export interface EnqueueOptions {
  /** Delay en ms antes de ejecutar. */
  delayMs?: number;
  /** Override de attempts si el caller necesita algo distinto. */
  attempts?: number;
  /** Prisma override para tests. */
  db?: typeof defaultPrisma;
}

export interface EnqueueResult {
  /** Id del mirror `Job` en la DB (lo consume la UI). */
  jobId: string;
  /** Id interno de BullMQ (para debug ops). */
  bullJobId: string;
}

export async function enqueue<N extends QueueName>(
  name: N,
  payload: PayloadForQueue[N],
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const schema = QUEUE_SCHEMAS[name];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidJobPayloadError(name, parsed.error.issues);
  }

  const db = opts.db ?? defaultPrisma;

  // 1. Mirror en DB (source of truth para la UI). El id que generamos aquí es
  //    el que devolvemos al caller — el bullJobId es interno.
  const mirror = await db.job.create({
    data: {
      queue: name,
      status: 'queued',
      payload: parsed.data as object,
    },
  });

  // 2. Encolar en BullMQ. Pasamos `jobId` = nuestro mirror.id para trazabilidad
  //    bidireccional (id único garantizado por cuid).
  try {
    const queue = getQueue(name);
    const bullJob = await queue.add(name, parsed.data, {
      jobId: mirror.id,
      ...(opts.delayMs !== undefined ? { delay: opts.delayMs } : {}),
      ...(opts.attempts !== undefined ? { attempts: opts.attempts } : {}),
    });
    return { jobId: mirror.id, bullJobId: bullJob.id ?? mirror.id };
  } catch (err) {
    // Si BullMQ/Redis falla, dejamos el mirror marcado como failed para no dejar
    // jobs fantasma en estado `queued` para siempre.
    await db.job
      .update({
        where: { id: mirror.id },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          finishedAt: new Date(),
        },
      })
      .catch(() => {
        /* best-effort */
      });
    throw err;
  }
}

/** Cierra todas las queues (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  const map = globalForQueues.__heydayQueues;
  if (!map) return;
  await Promise.all(Object.values(map).map((q) => q.close()));
  globalForQueues.__heydayQueues = undefined;
}

export { QUEUE_NAMES };
