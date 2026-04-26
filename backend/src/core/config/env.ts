// Validación central de variables de entorno del backend.
// Se carga una sola vez al arranque; cualquier código que necesite env
// debe importar `env` desde aquí. Nunca leer `process.env` directamente.

import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  // Level 1 — runtime
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(100),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().default('Europe/Madrid'),

  // Level 2 — deployment secrets
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  QUEUE_PREFIX: z.string().default('heyday'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('14d'),

  CREDENTIAL_MASTER_KEY: z.string().optional(),

  APP_URL: z.string().url().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().default('localhost'),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL_DEFAULT: z.string().default('claude-sonnet-4-6'),
  CLAUDE_MODEL_FAST: z.string().default('claude-haiku-4-5-20251001'),
  CLAUDE_MODEL_PREMIUM: z.string().default('claude-opus-4-7'),

  // Seed
  SEED_ALEX_EMAIL: z.string().email().default('alex@heyday.studio'),
  SEED_ALEX_PASSWORD: z.string().optional(),
  SEED_ALBA_EMAIL: z.string().email().default('alba@heyday.studio'),
  SEED_ALBA_PASSWORD: z.string().optional(),

  // Diagnostics
  PRISMA_LOG_QUERIES: bool.default('false'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = loadEnv();
