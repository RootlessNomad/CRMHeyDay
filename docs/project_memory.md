# Project Memory

## Current State

- **Project**: HeyDay CRM + Lead Intelligence + Content Engine
- **Phase**: **M2 (CRM Supporting) cerrado y revisado — UJ-07→10 ✅ (4/4)**. M1 cerrado ✅ (6/6 UJ). /review M1 PASS-WITH-NOTES (0 críticas). **/review M2 PASS-WITH-NOTES (0 críticas)**. Listo para arrancar M3.
- **Last Completed**: **`/review` M3 — PASS-WITH-NOTES** (0 críticos). Fix aplicado: `GET /contacts/:id/data-export` escalado a `requireRole('admin')` + test 403. 403 tests totales (313 backend + 90 frontend).
- **Next Step**: **M4 — Lead Intelligence** — UJ-16 Investigar empresa por URL (Anthropic + scraping). Leer design_summary + api_contracts sección Intel antes de planificar.

## Estado verificable

| Check                        | Estado |
| ---------------------------- | :----: |
| `pnpm format:check` (root)   |   ✅   |
| `pnpm lint` (root)           |   ✅   |
| `pnpm typecheck` (3 ws)      |   ✅   |
| `pnpm test` (403 tests)      |   ✅   |
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
- ~~`pnpm-lock 2.yaml` residual~~ ✅ cerrado 2026-04-29.
- ~~UJ-07 envelope error mismatch frontend/backend~~ ✅ cerrado 2026-04-29.
- **Apify** (M5): instalar `apify-client` y registrar credencial Level 3 cuando arranque Content Engine. No bloqueante hasta entonces.
- **CI live**: el workflow está definido pero no se ha ejecutado contra GitHub. Pendiente: añadir `origin` remoto y `git push -u origin main`.
- **CSV formula injection** (UJ-07): celdas que empiezan con `=+-@` se almacenan verbatim. Inocuo hoy (React escapa en UI). **Disparador**: sanear antes de **UJ-27 (export CSV)** o el "Excel supercell" se filtra. Estrategia: prefijar `'` o strip al exportar.
- **localStorage no se limpia en logout** (UJ-10): `Topbar.logout` no borra `heyday:filters:*` ni la clave residual `anonymous` de pre-hidratación. Riesgo bajo (datos no sensibles: q/city/vertical/status) pero en dispositivo compartido las búsquedas previas persisten. **Disparador**: cuando **UJ-11** toque sesión/usuarios, añadir wipe de prefijo `heyday:` en logout.
- **Test 401 missing** (UJ-08): `/dashboard/top-priority-leads` está protegido pero no tiene test 401. Gap de cobertura. Añadir junto al primer cambio de UJ-08.
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

## Progreso M2

| UJ                              | Estado       |
| ------------------------------- | ------------ |
| UJ-07 Importación CSV empresas  | ✅ completed |
| UJ-08 Dashboard de inicio       | ✅ completed |
| UJ-09 Empty states y onboarding | ✅ completed |
| UJ-10 Filtros guardados         | ✅ completed |

## Progreso M1

| UJ                                | Estado       |
| --------------------------------- | ------------ |
| UJ-01 Login y sesión persistente  | ✅ completed |
| UJ-02 CRUD Empresas               | ✅ completed |
| UJ-03 CRUD Contactos + anonymize  | ✅ completed |
| UJ-04 Pipelines y Kanban de Leads | ✅ completed |
| UJ-05 Activities polimórficas     | ✅ completed |
| UJ-06 Tags y búsqueda global      | ✅ completed |

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

## Deuda específica UJ-06

- **Validación end-to-end en navegador pendiente**: TagPicker en Company/Contact/Lead form dialogs + chip removal, `<GlobalSearch />` palette + atajo ⌘K/Ctrl+K + navegación teclado, fallback de activity hits (toast). Requiere docker compose up + login.
- **Sin spec Playwright E2E para tags ni para search/palette** (consistente con UJ-05). Considerar batch único cuando CI live esté operativo.
- **Activities NO son taggables**: enum `TaggableEntityType` backend = `company|contact|lead|content_item`. `TagPicker` solo en 3 dialogs, no 4. Si emerge demanda de tagging en activities, requiere migration con `'activity'` añadido al enum (no trivial).
- **Activities sin detail page propio**: `<GlobalSearch />` muestra toast informativo en hits de activity en vez de navegar. Para deep-link real, backend `/search` debe devolver `entity_type/entity_id` del padre. Decidir UX antes de M3.
- **`useDebouncedValue` triplicado** en `CompanyPicker.tsx`, `TagPicker.tsx`, `GlobalSearch.tsx`: decisión consciente de no extraer. Reabrir si aterriza un cuarto consumidor.
- **`act()` warnings en `LeadFormDialog.test.tsx`**: tests pasan pero React emite warnings por mutations async no envueltas. Polish trivial pendiente.

## Progreso M3

| UJ                         | Estado       |
| -------------------------- | ------------ |
| UJ-11 Gestión de usuarios  | ✅ completed |
| UJ-12 Credential Vault UI  | ✅ completed |
| UJ-13 Taxonomías editables | ✅ completed |
| UJ-14 Dashboard IA + Audit | ✅ completed |
| UJ-15 GDPR toolkit         | ✅ completed |

## Pasos para la siguiente sesión

1. `/session-start`
2. **UJ-13 Taxonomías editables** — pipelines, stages, verticals, service types editables desde el Admin Panel. Ver design docs para spec completa.
3. **Deuda operativa (no bloquea M3)**:
   - ~~Logout localStorage cleanup~~ ✅ cerrado en UJ-11 (Topbar limpia `heyday:*`).
   - Migración Prisma `add_contact_anonymized_at` (deuda UJ-03, requiere docker).
   - Conectar repo a GitHub (`git remote add origin <url>` + `git push -u origin main`) para activar CI.
   - Refactor `act()` warnings en `LeadFormDialog.test.tsx`.
   - Specs Playwright E2E para activities, tags/search, imports, dashboard empty-DB state.
   - Test 401 para `/dashboard/top-priority-leads`.
   - Sanear CSV formula injection antes de UJ-27.
