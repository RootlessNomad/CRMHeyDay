# Project Memory

## Current State

- **Project**: HeyDay CRM + Lead Intelligence + Content Engine
- **Phase**: M0 cerrado + M1 en marcha (1/6 UJ).
- **Last Completed**: UJ-01 Login y sesión persistente — delta sobre IT-09+IT-10: `SessionWatcher` global (evento window + BroadcastChannel), logout multi-pestaña, Playwright config + 3 specs E2E gated por env. 87 tests verdes (73 backend + 14 frontend).
- **Next Step**: **UJ-02 CRUD Empresas**. Backend: `/companies` CRUD con dedupe por dominio + soft delete. Frontend: lista con filtros (q, vertical, ciudad, tag), detalle con tabs (overview/contactos/leads/actividad), modales crear/editar.

## Estado verificable

| Check                        | Estado |
| ---------------------------- | :----: |
| `pnpm format:check` (root)   |   ✅   |
| `pnpm lint` (root)           |   ✅   |
| `pnpm typecheck` (3 ws)      |   ✅   |
| `pnpm test` (84 tests)       |   ✅   |
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

## Para M1 — UJ-01 Login y sesión persistente

Gran parte del flujo ya existe gracias a IT-09 + IT-10. UJ-01 cierra:

- **Acceptance** (de `implementation/user_journeys.md`): un usuario puede entrar con email+password, ver el dashboard, refrescar la página sin re-loguearse, hacer logout explícito, y ver mensaje claro cuando la sesión expira o se cierra desde otra pestaña.
- **Pendiente concreto**:
  - UI de "sesión expirada" cuando `AuthExpiredError` ocurre lejos del login (toast + redirect).
  - Test E2E mínimo (login → dashboard → logout) con Playwright contra docker-compose.
  - Verificar el flujo de logout multi-pestaña (revoca sesión → otra pestaña debería detectarlo en su próximo fetch).
  - Empty/error states del dashboard cuando el backend devuelve 5xx.
- **Codex como co-pilot** (ver memoria): preparar acceptance criteria + archivos a tocar y delegar a `/codex:rescue`. Claude verifica el diff + corre tests + checklist de seguridad.

## Decisiones clave

Ver `docs/decision_log.md` (11 decisiones de Planning) y entradas relevantes del work_log para decisiones tomadas durante la ejecución (bcryptjs vs bcrypt, sesión id pre-generado, refresh-coalescing en frontend, cast estructural del SDK Anthropic, Fastify 5 con `loggerInstance`, etc).

## Acción pendiente del usuario antes de arrancar

1. Crear `.env` desde `.env.example` y rellenar `SEED_ALEX_PASSWORD` + `SEED_ALBA_PASSWORD` (≥12 chars).
2. Ejecutar `bash deployment/scripts/generate-secrets.sh` y volcar al `.env` los `JWT_*_SECRET` y `CREDENTIAL_MASTER_KEY`.
3. `docker compose up -d db redis` antes de cualquier `pnpm db:*`.
4. `pnpm install` con Node 20 + pnpm 9.

## Pasos para la siguiente sesión

1. `/session-start`
2. Validar localmente el seed demo (paso "validación end-to-end" de arriba).
3. Conectar el repo a GitHub (`git remote add origin <url>` + `git push -u origin main`) para activar CI.
4. Empezar UJ-01 (preparar prompt para Codex con archivos + acceptance) o, si el flujo ya está completo en su mayoría, marcar UJ-01 como cubierto por IT-09+IT-10 con sólo el delta documentado.
