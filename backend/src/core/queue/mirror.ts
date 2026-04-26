// Helpers de transición de estado del mirror `Job`. Llamados por el worker
// en los hooks `onActive` / `onCompleted` / `onFailed` de BullMQ. La tabla `jobs`
// es la fuente de verdad para la UI — BullMQ sólo coordina la ejecución.

import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '../prisma/client.js';

type Db = PrismaClient;

export async function markRunning(jobId: string, db: Db = defaultPrisma): Promise<void> {
  await db.job
    .update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    })
    .catch(() => {
      /* El mirror puede no existir si el job fue creado sin enqueue() (test/dev). */
    });
}

export async function markSucceeded(
  jobId: string,
  result: unknown,
  db: Db = defaultPrisma,
): Promise<void> {
  await db.job
    .update({
      where: { id: jobId },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        result: (result ?? {}) as object,
      },
    })
    .catch(() => {});
}

export async function markFailed(
  jobId: string,
  error: string,
  db: Db = defaultPrisma,
): Promise<void> {
  await db.job
    .update({
      where: { id: jobId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        // Nunca serializar el error completo — sólo su mensaje. Detalles van al log.
        error: error.slice(0, 2000),
      },
    })
    .catch(() => {});
}
