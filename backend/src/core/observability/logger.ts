// Logger estructurado compartido entre API y worker.
// Usa pino con pretty-printing sólo en development. NUNCA loggear secretos,
// payloads completos de jobs o tokens — sólo ids + metadatos no sensibles.

import { pino, type Logger } from 'pino';

import { env } from '../config/env.js';

const isDev = env.APP_ENV === 'development';

export const rootLogger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'heyday-backend', env: env.APP_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'passwordHash',
      '*.password',
      '*.passwordHash',
      'accessToken',
      'refreshToken',
      '*.accessToken',
      '*.refreshToken',
      'ciphertext',
      'plaintext',
      'apiKey',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[redacted]',
    remove: false,
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/** Crea un child logger con bindings fijos (p.ej. `{ jobId, queue }`). */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return rootLogger.child(bindings);
}

export type { Logger };
