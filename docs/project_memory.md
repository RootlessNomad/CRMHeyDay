# Project Memory

## Current State

- **Project**: HeyDay CRM + Lead Intelligence + Content Engine
- **Phase**: M0 cerrado + M1 en marcha (5/6 UJ — UJ-05 ✅ completed).
- **Last Completed**: **UJ-05 completo (backend + frontend)** — Plan A sin migración (Activity ya estaba en schema con polimorfismo `(entity_type, entity_id)`). Pase 1 backend (Codex 21m 58s): módulo `activities` siguiendo patrón `contacts`, anti-huérfano valida `deletedAt: null` en company/lead y `+ anonymizedAt: null` en contact, audit log sin PII, 4 endpoints con `requireAuth`. Pase 2 frontend (Codex 6m 32s): ActivityFeed reutilizable con filtros (kind/completed/mine) + react-query, ActivityFormDialog con zod + datetime-local↔ISO, DeleteActivityDialog; integrados en tabs "Actividad" de /leads/[id], /contacts/[id] y /companies/[id]. **Review crítica**: Codex Pase 1 introdujo dynamic imports en routes/activities.ts como workaround a timeouts del suite — Claude corrigió a static import (patrón de contacts) y atacó la causa raíz: `testTimeout: 15000ms` en backend/vitest.config.ts (bcrypt cost 12 + 21 tests adicionales saturaba CPU bajo paralelismo). 189 → 218 tests (+29). Cero crashes de Codex en este UJ.
- **Next Step**: **UJ-06 Tags y búsqueda global** — sistema de tags polimórfico (model `Tag` con `entity_type` taxonomy, ya existe en schema) + búsqueda global (CMD+K palette o similar) sobre Companies/Contacts/Leads/Activities. Backend `/tags` CRUD + `/search?q=` con scoring. Frontend: `TagPicker` reutilizable, integración en formularios existentes (Company/Contact/Lead/Activity). Tras cerrar UJ-06, correr `/review` del milestone M1.

## Estado verificable

| Check                        | Estado |
| ---------------------------- | :----: |
| `pnpm format:check` (root)   |   ✅   |
| `pnpm lint` (root)           |   ✅   |
| `pnpm typecheck` (3 ws)      |   ✅   |
| `pnpm test` (218 tests)      |   ✅   |
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
| UJ-05 Activities polimórficas     | ✅ completed |
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

## Deuda específica UJ-05

- **Validación end-to-end en navegador pendiente**: crear/editar/borrar/togglear actividades en `/leads/[id]`, `/contacts/[id]` y `/companies/[id]` requiere docker compose up + login. Tests con prisma mocked (Pase 1) y vitest sobre dialog (Pase 2) pasan, pero no hay round-trip real contra Postgres + UI.
- **`whatsapp` no existe en `ActivityKind`**: decisión consciente del Plan A (los enums son no-editables hasta UJ-13 Taxonomías editables en M3). Si el usuario lo necesita antes, requiere migración nueva en su propio task.
- **Sin endpoint dedicado `/complete`**: completar/descompletar via PATCH con `completed_at`. Si más adelante se quiere telemetría de "tarea hecha" como evento separado, considerar endpoint dedicado.
- **Sin filtros UI por rango de fechas**: backend ya soporta `due_from/to`; UI v1 expone solo kind + pending/all/completed + mine/all. Añadir si emerge demanda real.
- **Sin spec Playwright E2E para activities**: a diferencia de UJ-02/03/04 no se añadió spec gated por env. Considerar para `/review` de M1.
- **Lección aprendida (review crítica)**: Codex puede introducir workarounds que parecen razonables pero ocultan causas raíz. En este UJ fue dynamic import en `routes/activities.ts` "para evitar timeouts del suite" — la causa real era `testTimeout: 5000ms` insuficiente bajo CPU contention con bcrypt cost 12. Patrón a recordar: **si Codex menciona "lazy load", "diferido", "para evitar X bajo paralelismo" o similar, verificar la causa raíz antes de aceptar**.

## Pasos para la siguiente sesión

1. `/session-start`
2. **Arrancar UJ-06 Tags y búsqueda global** bajo patrón Claude+Codex. Alcance esperado:
   - Backend module `tags` (model `Tag` ya existe en schema con `TaggableEntityType` enum). Endpoints CRUD `/tags` + asignación polimórfica + `GET /search?q=` con scoring sobre Companies/Contacts/Leads/Activities (titles + bodies).
   - Frontend: `TagPicker` reutilizable (typeahead + create-on-the-fly), integración en formularios existentes (Company/Contact/Lead/Activity) en su sección "Más datos". CMD+K palette o `<GlobalSearch />` en Topbar.
   - Tras cerrar UJ-06: `/review` del milestone M1.
3. **Aún pendiente operativo** (no bloquea UJ-06):
   - Validar UJ-04 + UJ-05 en navegador: docker compose up + login + probar Kanban DnD + ActivityFeed CRUD en los tres detalles + filtros URL-synced.
   - Migración Prisma `add_contact_anonymized_at` (deuda UJ-03).
   - Validar seed demo + Playwright specs existentes (login + companies-crud + contacts-crud + leads-crud) con env `E2E_USER_*`.
   - Conectar el repo a GitHub (`git remote add origin <url>` + `git push -u origin main`) para activar CI.
   - Limpiar `pnpm-lock 2.yaml` residual en raíz.
