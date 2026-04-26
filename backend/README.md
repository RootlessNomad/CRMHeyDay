# @heyday/backend

API Fastify + worker BullMQ. Comparten el mismo paquete con dos entrypoints:

- `src/api/server.ts` — API REST `/api/v1`
- `src/worker/main.ts` — consumidor de BullMQ para enrichment y content generation

## Estructura prevista

```
src/
  api/           # Fastify app, routes, plugins
  worker/        # BullMQ consumers
  modules/       # auth, users, companies, contacts, leads, intel, content, admin, ...
  core/
    ai/          # AnthropicClient wrapper
    crypto/      # AES-256-GCM vault
    scraping/    # Playwright pool
    sources/     # adapters por fuente (google_places, lighthouse, ...)
    queue/       # BullMQ queues + jobs
    audit/       # AuditLog middleware
    prisma/      # client singleton
    http/        # Fastify setup
    auth/        # JWT + guards
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  integration/
```

Ver `../design/architecture.md` para el mapa completo.

## Scripts

- `pnpm dev` — API en watch
- `pnpm worker:dev` — worker en watch
- `pnpm db:migrate` — Prisma migrate dev
- `pnpm seed` — carga usuarios y datos demo
