// Worker entrypoint.
//
// - Carga env (valida al boot)
// - Abre 4 workers BullMQ (uno por queue)
// - Cada processor: markRunning → delega a un handler específico de feature
//   → markSucceeded / markFailed. Los handlers placeholder de IT-07 sólo hacen
//   echo para validar el plumbing; los reales llegan en UJ-16/UJ-17 (enrichment),
//   UJ-22/UJ-23 (content), UJ-12 (integration test).
// - Graceful shutdown en SIGTERM/SIGINT: drena y cierra conexiones.
//
// NO loggear payloads enteros — sólo `{ jobId, queue }` + duración + error.message.

import { Worker, type Job as BullJob } from 'bullmq';

import { env } from '../core/config/env.js';
import { childLogger, rootLogger } from '../core/observability/logger.js';
import { closeRedis, redis, QUEUE_PREFIX } from '../core/queue/connection.js';
import { markFailed, markRunning, markSucceeded } from '../core/queue/mirror.js';
import { closeQueues } from '../core/queue/queues.js';
import { QUEUE_NAMES, QUEUE_SCHEMAS, type JobResult, type QueueName } from '../core/queue/types.js';
import { runEnrichment } from '../modules/intel/handler.js';
import { runDiscovery } from '../modules/discovery/handler.js';
import { runContentGeneration, runIdeaGeneration } from '../modules/content/handlers.js';

const log = childLogger({ component: 'worker' });

// ------------------------------------------------------------------
// Handlers placeholder — reemplazar por los reales conforme avancen UJ.
// Todos son async puros: reciben payload validado, devuelven JobResult.
// ------------------------------------------------------------------
type Handler<N extends QueueName> = (
  payload: unknown,
  ctx: { jobId: string; queue: N },
) => Promise<JobResult>;

const handlers: { [N in QueueName]: Handler<N> } = {
  [QUEUE_NAMES.enrichment]: async (payload) => runEnrichment(payload as never),
  [QUEUE_NAMES.discovery]: async (payload) => runDiscovery(payload as never),
  [QUEUE_NAMES.contentIdea]: async (payload) => runIdeaGeneration(payload as never),
  [QUEUE_NAMES.contentGeneration]: async (payload) => runContentGeneration(payload as never),
  [QUEUE_NAMES.contentAdapt]: async (payload, ctx) => {
    // TODO UJ-23: re-render ContentVersion para otro canal.
    log.info({ jobId: ctx.jobId, queue: ctx.queue }, 'content_adapt placeholder ejecutado');
    return { ok: true, summary: { placeholder: true } };
  },
  [QUEUE_NAMES.integrationTest]: async (payload, ctx) => {
    // TODO UJ-12: pingear el servicio externo usando la credential.
    log.info({ jobId: ctx.jobId, queue: ctx.queue }, 'integration_test placeholder ejecutado');
    return { ok: true, summary: { placeholder: true } };
  },
};

// ------------------------------------------------------------------
// Factory de worker — cada queue instancia uno con el mismo processor shape.
// ------------------------------------------------------------------
function buildWorker<N extends QueueName>(name: N): Worker {
  return new Worker(
    name,
    async (bullJob: BullJob) => {
      const jobId = bullJob.id ?? 'unknown';
      const jobLog = childLogger({ jobId, queue: name, attempt: bullJob.attemptsMade });
      const started = Date.now();

      // Validación defensiva: aunque `enqueue` ya validó, el job pudo encolarse
      // desde otro path (script manual, migración futura) — protegemos al worker.
      const schema = QUEUE_SCHEMAS[name];
      const parsed = schema.safeParse(bullJob.data);
      if (!parsed.success) {
        const reason = 'Payload inválido en processor';
        jobLog.error({ issues: parsed.error.issues }, reason);
        await markFailed(jobId, reason);
        throw new Error(reason);
      }

      await markRunning(jobId);
      jobLog.info('job started');

      try {
        const result = await handlers[name](parsed.data, { jobId, queue: name });
        await markSucceeded(jobId, result.summary ?? {});
        jobLog.info({ durationMs: Date.now() - started }, 'job succeeded');
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await markFailed(jobId, msg);
        jobLog.error({ err: msg, durationMs: Date.now() - started }, 'job failed');
        throw err; // BullMQ reintenta según policy.
      }
    },
    {
      connection: redis,
      prefix: QUEUE_PREFIX,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );
}

// ------------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------------
async function bootstrap(): Promise<void> {
  log.info({ env: env.APP_ENV, concurrency: env.WORKER_CONCURRENCY }, 'worker booting');

  const workers: Worker[] = Object.values(QUEUE_NAMES).map((q) => buildWorker(q));

  for (const w of workers) {
    w.on('error', (err) => log.error({ queue: w.name, err: err.message }, 'worker error'));
  }

  log.info({ queues: Object.values(QUEUE_NAMES) }, 'worker ready');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutting down workers');
    try {
      await Promise.all(workers.map((w) => w.close()));
      await closeQueues();
      await closeRedis();
      log.info('worker shutdown complete');
      process.exit(0);
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    rootLogger.fatal({ reason: String(reason) }, 'unhandledRejection');
    void shutdown('unhandledRejection');
  });
}

bootstrap().catch((err: unknown) => {
  rootLogger.fatal(
    { err: err instanceof Error ? err.message : String(err) },
    'worker bootstrap failed',
  );
  process.exit(1);
});
