// Setup global para vitest del backend.
// Inyecta env vars mínimas ANTES de que cualquier módulo de la app se importe,
// de modo que `core/config/env.ts` no falle en tests unitarios.

const env = process.env;

env['APP_ENV'] = env['APP_ENV'] ?? 'test';
env['LOG_LEVEL'] = env['LOG_LEVEL'] ?? 'error';
env['DATABASE_URL'] =
  env['DATABASE_URL'] ?? 'postgresql://test:test@localhost:5432/heyday_test?schema=public';
env['REDIS_URL'] = env['REDIS_URL'] ?? 'redis://localhost:6379';
env['JWT_ACCESS_SECRET'] =
  env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-test-access-secret-test-01234567';
env['JWT_REFRESH_SECRET'] =
  env['JWT_REFRESH_SECRET'] ?? 'test-refresh-secret-test-refresh-secret-test-7654321';
env['JWT_ACCESS_TTL'] = env['JWT_ACCESS_TTL'] ?? '15m';
env['JWT_REFRESH_TTL'] = env['JWT_REFRESH_TTL'] ?? '14d';
// 32 bytes base64 (generado con crypto.randomBytes). NO usar en producción.
env['CREDENTIAL_MASTER_KEY'] =
  env['CREDENTIAL_MASTER_KEY'] ?? '/3aYnXlHnJ+/6GNH3MWnDmyfXIYeYy09by3/l8vcNKE=';
env['APP_URL'] = env['APP_URL'] ?? 'http://localhost:3000';
env['COOKIE_DOMAIN'] = env['COOKIE_DOMAIN'] ?? 'localhost';
