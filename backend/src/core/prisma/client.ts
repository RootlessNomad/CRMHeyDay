// Singleton del cliente Prisma.
// En desarrollo, HMR re-importa módulos y crearía múltiples conexiones
// si no cacheamos en `globalThis`. En producción el cache no es necesario
// pero es inocuo.

import { PrismaClient, type Prisma } from '@prisma/client';

import { env } from '../config/env.js';

type GlobalWithPrisma = typeof globalThis & {
  __heydayPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

const logLevels: Prisma.LogLevel[] = env.PRISMA_LOG_QUERIES
  ? ['query', 'info', 'warn', 'error']
  : ['warn', 'error'];

export const prisma: PrismaClient =
  globalForPrisma.__heydayPrisma ??
  new PrismaClient({
    log: logLevels.map((level) => ({ level, emit: 'stdout' })),
  });

if (env.APP_ENV !== 'production') {
  globalForPrisma.__heydayPrisma = prisma;
}

// Utilidades para apagado ordenado desde server/worker.
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export type { Prisma } from '@prisma/client';
