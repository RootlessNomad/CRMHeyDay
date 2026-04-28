# Project Memory

## Current State

- **Project**: HeyDay CRM + Lead Intelligence + Content Engine
- **Phase**: M0 cerrado + M1 en marcha (4/6 UJ — UJ-04 ✅ completed).
- **Last Completed**: **UJ-04 completo (backend + frontend)** — Pase 2 frontend dividido en 2A (tipos + API clients + 4 dialogs, +7 tests) y 2B (KanbanBoard `@dnd-kit/core` + LeadList + páginas `/leads` y `/leads/[id]` + spec E2E gated). Bug crítico de sandbox Codex mitigado: Codex creó shim `dnd-kit.d.ts` por falta de red al registro npm; Claude instaló deps reales y eliminó shim. Cleanup inline: campo `title` huérfano del LeadFormDialog quitado por Claude. 189 tests (150 backend + 39 frontend). Cero crashes de Codex en este UJ.
- **Next Step**: **UJ-05 Activities polimórficas** — modelo polimórfico de actividades sobre Lead/Company/Contact (call/note/email/whatsapp/meeting), feed unificado en cada detalle, integración con tab "Actividad" placeholder ya existente en `/leads/[id]` y `/contacts/[id]`. Backend module `activities` + endpoints `/activities` con filtro por entidad → frontend feed component reutilizable.

## Estado verificable

| Check                        | Estado |
| ---------------------------- | :----: |
| `pnpm format:check` (root)   |   ✅   |
| `pnpm lint` (root)           |   ✅   |
| `pnpm typecheck` (3 ws)      |   ✅   |
| `pnpm test` (189 tests)      |   ✅   |
| Repo `.git` inicializado     |   ✅   |
| CI GitHub Actions definido   |   ✅   |
| Seed demo type-clean         |   ✅   |
| Seed demo ejecutado en local |   ⏳   |

## Progreso M0 (11 IT)

| ID                                 | Estado       |
| ---------------------------------- | ------------ |
| IT-01 Monorepo + Tooling           | ✅ completed |
| IT-02 Docker Compose + Dockerfiles | ✅ completed |
| IT-03 PostgreSQL + Prisma          | ✅ completed |
| IT-04 Auth backend (JWT + bcrypt)  | ✅ completed |
| IT-05 Users + seed Alex/Alba       | ✅ completed |
| IT-06 Credential Vault AES-256-GCM | ✅ completed |
| IT-07 BullMQ + worker              | ✅ completed |
| IT-08 Anthropic client wrapper     | ✅ completed |
| IT-09 HTTP layer Fastify 5.1       | ✅ completed |
| IT-10 Frontend shell Next.js 15    | ✅ completed |
| IT-11 Seed demo + CI               | ✅ completed |

M1–M5 (27 UJ) sin empezar.

## Deuda y pendientes

- ~~Backend typecheck~~ ✅ cerrado 2026-04-25 (42 errores TS resueltos).
- **Apify** (M5): instalar `apify-client` y registrar credencial Level 3 cuando arranque Content Engine. No bloqueante hasta entonces.
- **CI live**: el workflow está definido pero no se ha ejecutado contra GitHub. Pendiente: añadir `origin` remoto y `git push -u origin main`.
- **Validación end-to-end del seed demo**: requiere docker compose arriba. Comando completo:
  ```
  cp .env.example .env  # si aún no existe
  bash deployment/scripts/generate-secrets.sh  # genera CREDENTIAL_MASTER_KEY + JWT secrets
  docker compose up -d db redis
  pnpm install
  pnpm --filter @heyday/backend run db:generate
  pnpm db:migrate          # crea migrations/0001_init la primera vez
  pnpm seed:demo           # taxonomías + Alex/Alba + datos demo
  pnpm dev                 # arranca backend + frontend + worker
  ```

## Progreso M1

| UJ                                | Estado       |
| --------------------------------- | ------------ |
| UJ-01 Login y sesión persistente  | ✅ completed |
| UJ-02 CRUD Empresas               | ✅ completed |
| UJ-03 CRUD Contactos + anonymize  | ✅ completed |
| UJ-04 Pipelines y Kanban de Leads | ✅ completed |
| UJ-05 Activities polimórficas     | pending      |
| UJ-06 Tags y búsqueda global      | pending      |

## Deuda específica UJ-03

- **Migración Prisma pendiente**: `pnpm --filter @heyday/backend exec prisma migrate dev --name add_contact_anonymized_at` (requiere docker compose up). Schema y cliente ya regenerados; el campo `anonymizedAt` está en `schema.prisma` y los tests pasan con mocks, pero el runtime real necesita la migración.
- **Filtro `company_id` en lista de contactos**: omitido este pase, dejado como TODO. Considerar entrar con UJ-04 o pulido al cierre de M1.
- **`ContactPrimaryConflictError`**: definida pero nunca lanzada (la implementación auto-desmarca el primary anterior). Dead code menor — limpiar o mantener para política estricta futura.

## Deuda específica UJ-04

- **Validación en navegador pendiente**: Kanban DnD, "Mover a stage…", Won/Lost dialogs y filtros URL-synced no se han probado contra el backend real. Requiere docker compose up + login. La spec E2E `leads-crud.spec.ts` está gated por env y cubre el flujo (sin DnD, usa el botón fallback).
- **Sandbox Codex sin red al registro npm**: durante el Pase 2B Codex no pudo `pnpm add @dnd-kit/*` y creó un shim `frontend/src/types/dnd-kit.d.ts` que enmascaraba la falta de runtime real. Mitigación aplicada: Claude instaló las deps desde su shell (con red) y eliminó el shim. **Patrón a recordar**: si Codex reporta "shim", "fallback type", o "instalación bloqueada", verificar siempre que el `package.json` contenga la dep real antes de aceptar el pase.
- **Validación runtime end-to-end**: tests con prisma mocked + supertest contra Fastify (Pase 1) y vitest sobre dialogs (Pase 2) pasan, pero no hay round-trip real contra Postgres + UI todavía.
- **Sin filtro por tag en GET /leads**: tags llegan en UJ-06.
- **Sin owner-check (RBAC)**: en v1 todos son admin → `requireAuth` global. TODO(roles) marcado en `leads/service.ts` (`update`, `softDelete`, `markWon`, `markLost`) y en `LeadFormDialog.tsx` (UserPicker) para cuando aterricen `operator` y `viewer` (UJ-11+).
- **"Stages activos" interpretado como "todos los stages"**: `PipelineStageDto` no tiene flag `active`. Si M3 (Admin Panel) lo añade, ajustar render en KanbanBoard/LeadList/MoveStageDialog.
- **Kanban con `pageSize: 200`**: pragmático para v1; revisar virtualización si una columna supera ese tamaño. Si llega a ser problema, paginar por columna.

## Decisiones clave

Ver `docs/decision_log.md` (11 decisiones de Planning) y entradas relevantes del work_log para decisiones tomadas durante la ejecución (bcryptjs vs bcrypt, sesión id pre-generado, refresh-coalescing en frontend, cast estructural del SDK Anthropic, Fastify 5 con `loggerInstance`, etc).

## Acción pendiente del usuario antes de arrancar

1. Crear `.env` desde `.env.example` y rellenar `SEED_ALEX_PASSWORD` + `SEED_ALBA_PASSWORD` (≥12 chars).
2. Ejecutar `bash deployment/scripts/generate-secrets.sh` y volcar al `.env` los `JWT_*_SECRET` y `CREDENTIAL_MASTER_KEY`.
3. `docker compose up -d db redis` antes de cualquier `pnpm db:*`.
4. `pnpm install` con Node 20 + pnpm 9.

## Pasos para la siguiente sesión

1. `/session-start`
2. **Arrancar UJ-05 Activities polimórficas** bajo patrón Claude+Codex. Alcance esperado:
   - Backend module `activities` (`backend/src/modules/activities/`) con polimorfismo sobre Lead/Company/Contact, kinds: call/note/email/whatsapp/meeting (taxonomía editable en M3). Endpoints: `GET /activities?entity_type=&entity_id=`, `POST /activities`, `PATCH /activities/:id`, `DELETE /activities/:id` (soft).
   - Schema Prisma: tabla `activities` con `(entity_type enum, entity_id uuid)` polimórfica + `due_at`, `completed_at`, `outcome`, `body`. Migración nueva.
   - Frontend: `lib/api/activities.ts`, `components/activities/ActivityFeed.tsx` reutilizable (props `{ entityType, entityId }`), `ActivityFormDialog.tsx`.
   - Integración: tab "Actividad" en `/leads/[id]`, `/contacts/[id]`, `/companies/[id]` (los dos primeros ya tienen el placeholder).
3. **Aún pendiente operativo** (no bloquea UJ-05):
   - Validar UJ-04 en navegador: docker compose up + login + probar Kanban DnD, "Mover a stage…", Won/Lost, filtros URL-synced.
   - Migración Prisma `add_contact_anonymized_at` (deuda UJ-03).
   - Validar seed demo + Playwright specs existentes (login + companies-crud + contacts-crud + leads-crud) con env `E2E_USER_*`.
   - Conectar el repo a GitHub (`git remote add origin <url>` + `git push -u origin main`) para activar CI.
   - Limpiar `pnpm-lock 2.yaml` residual en raíz.
   - **Tras cerrar M1 (UJ-05 + UJ-06)**: correr `/review` del milestone.
