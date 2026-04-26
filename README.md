# HeyDay CRM + Lead Intelligence + Content Engine

CRM interno de HeyDay Studio con módulos integrados de Lead Intelligence y Content Engine.

## Stack

- **Backend**: Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL 16 + BullMQ + Redis
- **Frontend**: Next.js 15 (App Router) + React 19 + TailwindCSS + shadcn/ui
- **IA**: Anthropic Claude (Sonnet / Haiku / Opus) con prompt caching
- **Deployment**: Docker Compose + EasyPanel

## Estructura del monorepo

```
.
├── backend/          # API Fastify + worker BullMQ
├── frontend/         # Next.js 15
├── shared/           # Tipos + schemas Zod compartidos
├── design/           # Data model, API contracts, wireframes, architecture
├── planning/         # Requirements, scope, risks, questions
├── implementation/   # Task tracker, user journeys
├── docs/             # Project memory, work log, decisions, NFR
├── deployment/       # Docker, EasyPanel, scripts
├── skills/           # Skills registry
├── mcps/             # MCPs & external APIs registry
└── tests/            # E2E smoke tests
```

## Desarrollo

### Requisitos

- Node.js 20+ (ver `.nvmrc`)
- pnpm 9+
- Docker + Docker Compose (para DB/Redis)

### Primer arranque

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar env y completar claves (ver .env.example)
cp .env.example .env

# 3. Levantar DB y Redis
docker compose up -d db redis

# 4. Aplicar migraciones
pnpm db:migrate

# 5. Sembrar datos demo (Alex, Alba, empresas, contenido)
pnpm seed

# 6. Arrancar API, worker y frontend
pnpm dev
```

### Scripts principales

| Script            | Qué hace                              |
| ----------------- | ------------------------------------- |
| `pnpm dev`        | API + worker + frontend en watch      |
| `pnpm build`      | Build de todo el monorepo             |
| `pnpm lint`       | ESLint en todos los paquetes          |
| `pnpm typecheck`  | TypeScript check                      |
| `pnpm test`       | Tests en todos los paquetes           |
| `pnpm db:migrate` | Prisma migrate dev                    |
| `pnpm db:studio`  | Prisma Studio                         |
| `pnpm seed`       | Carga usuarios iniciales + datos demo |

## Governance

- `CLAUDE.md` — reglas de trabajo para el asistente IA
- `docs/project_memory.md` — estado actual del proyecto
- `implementation/task_tracker.md` — progreso por tarea/journey

## Credenciales

Ver `design/architecture.md` > _Credential Level Mapping_ para la clasificación Level 1 / 2 / 3. Los secretos del Level 3 se gestionan desde el Admin Panel (`/admin/credentials`) y se cifran en DB con AES-256-GCM.
