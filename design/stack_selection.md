# Stack Selection

## Backend

- **Language**: TypeScript (Node.js 20 LTS)
- **Framework**: Fastify 4 (rendimiento, ecosistema de plugins maduro, integración natural con zod/pino)
- **ORM**: Prisma 5 (type safety, migraciones limpias, buena DX)
- **Validation**: Zod (schemas compartidos con frontend vía paquete `shared`)
- **Background jobs**: BullMQ + Redis 7
- **AI**: `@anthropic-ai/sdk` oficial; wrapper interno `AnthropicClient` que impone prompt caching, logging de tokens y selección de modelo
- **Web scraping**: Playwright 1.x (chromium headless, pool de contextos)
- **Logging**: pino + pino-pretty en dev
- **Testing**: Vitest (unit + integration), Playwright Test (E2E)
- **Rationale**: stack TS homogéneo front+back; Fastify ofrece mejor perf y plugins que Express; Prisma reduce fricción en esquemas evolutivos; BullMQ es el estándar para jobs asíncronos en Node; Playwright ya incluye driver para scraping y E2E.

## Frontend

- **Framework**: Next.js 15 (App Router, RSC, mixed SSR/CSR)
- **Language**: TypeScript
- **UI**: React 19 + shadcn/ui (Radix primitives + Tailwind)
- **CSS**: Tailwind CSS 3.4 con tokens del style guide
- **State**: TanStack Query 5 (server state) + Zustand mínimo para UI state global (tema, sidebar collapsed)
- **Forms**: React Hook Form + Zod resolver
- **Rich editor**: `@tiptap/react` para ContentItem (markdown-friendly, versionable)
- **Calendar**: `react-big-calendar` o implementación custom con `date-fns`
- **Drag&drop**: `@dnd-kit/core` (Kanban, calendario)
- **Icons**: `lucide-react`
- **Testing**: Vitest + React Testing Library para componentes; Playwright para E2E
- **Rationale**: shadcn/ui da componentes accesibles sin dependencia pesada; TanStack Query cubre polling de jobs y cache; Tiptap encaja con el flujo de versions.

## Database

- **Engine**: PostgreSQL 16
- **Rationale**: robustez, jsonb para payloads flexibles (enrichment summary, ai_usage_log metadata), soporte full-text search nativo para la búsqueda global, índices parciales para soft delete.

## Cache / queue

- **Redis 7** — BullMQ + rate limiting + caching puntual (no sesiones).

## Monorepo

- **Manager**: pnpm workspaces
- Estructura:
  - `backend/` (API + worker comparten el mismo paquete, entrypoints distintos)
  - `frontend/`
  - `shared/` (tipos, zod schemas, constantes — publicado internamente)
  - `deployment/`

## Tooling

- **Linter**: ESLint (config monorepo) + Prettier (formato)
- **Git hooks**: Husky + lint-staged
- **Commit**: Conventional Commits sugerido, no enforced
- **CI**: GitHub Actions (lint + test + build) — configurado en IT de infra
- **Versioning**: semver aplicado al tag de release; no publicamos paquetes.

## Deployment

- **Containerización**: Docker multi-stage builds
- **Orquestación**: Docker Compose dev; EasyPanel prod
- **Reverse proxy / TLS**: provisto por EasyPanel
- **Migraciones**: `prisma migrate deploy` en contenedor de release
- **Backups**: cron diario `pg_dump` a volumen persistente, retención 14 días
