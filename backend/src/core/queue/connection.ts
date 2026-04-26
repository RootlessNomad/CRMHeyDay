// Conexión a Redis compartida por TODAS las queues y workers de BullMQ.
// Un único cliente IORedis reutilizado para minimizar handshakes y respetar
// límites de conexión del Redis gestionado. BullMQ exige `maxRetriesPerRequest: null`
// y `enableReadyCheck: false` para los clientes que se pasan a Queue/Worker —
// ver https://docs.bullmq.io/guide/going-to-production#maxretriesperrequest
//
// HMR-safe: cacheado en `globalThis` para no abrir sockets nuevos en dev con tsx watch.

import { Redis, type RedisOptions } from 'ioredis';

import { env } from '../config/env.js';

const redisOpts: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Failover agresivo en dev, razonable en prod.
  retryStrategy: (times) => Math.min(times * 200, 2000),
  // Evita que ioredis loguee en stdout por su cuenta; usamos nuestro logger.
  lazyConnect: false,
};

type GlobalWithRedis = typeof globalThis & { __heydayRedis?: Redis };
const globalForRedis = globalThis as GlobalWithRedis;

export const redis: Redis = globalForRedis.__heydayRedis ?? new Redis(env.REDIS_URL, redisOpts);

if (env.APP_ENV !== 'production') globalForRedis.__heydayRedis = redis;

/** Prefijo común para todas las keys de BullMQ. */
export const QUEUE_PREFIX = env.QUEUE_PREFIX;

/** Cierra la conexión limpiamente (usado en graceful shutdown). */
export async function closeRedis(): Promise<void> {
  if (redis.status === 'end') return;
  await redis.quit();
}
