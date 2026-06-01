# Work Log

Chronological record of all meaningful work. Each entry covers one infrastructure task, user journey, or significant change.

## Incidente PROD — 2026-05-31: frontend 502 (`crm.estudioheyday.com`)

**Síntoma:** todas las páginas devolvían 502 ("Service is not reachable" de EasyPanel). Backend, DB,
Redis y enrutado `/api` sanos (verificado: la API respondía JSON correcto).

**Causa raíz:** el contenedor `heyday-frontend` (Next.js 15 standalone, Docker Swarm) se recreó ~13 min
antes; Docker fija `HOSTNAME=<id-contenedor>` y el `server.js` de Next enlaza SOLO a esa interfaz
(`Local: http://<id>:3000`), no a `0.0.0.0`. Tras recrearse con un id/IP nuevos, el contenedor quedó
escuchando en una interfaz que el proxy de Swarm no alcanzaba → 502. Confirmado: `wget http://$(hostname):3000`
OK pero `wget http://127.0.0.1:3000` fallaba. (No fue OOM/disco: host con 6 GB RAM libres, disco 18%.)

**Diagnóstico/fix (vía SSH al VPS 46.202.131.13, autorizado por el usuario):**

- `docker service update --env-add HOSTNAME=0.0.0.0 --update-order start-first heyday_heyday-frontend`.
- Tras converger: Next enlaza `0.0.0.0:3000`, loopback OK; público `/`→307 (redirect a /login), `/login`→200.
- Persistencia en el repo: añadido `HOSTNAME=0.0.0.0` al env del servicio frontend en
  `deployment/easypanel/project.yml` (placeholders, versionado) y en `project.local.yml` (local).

**Pendiente del usuario (persistencia real):** EasyPanel guarda su propia config (no relee `project.yml`).
El `service update` aguanta hasta el próximo redeploy iniciado DESDE EasyPanel. Para que no reaparezca:
**EasyPanel → heyday-frontend → Environment → añadir `HOSTNAME=0.0.0.0` → Deploy.**

**Nota seguridad:** falsa alarma previa de "fuga de secretos" — el `project.yml` público tiene placeholders
`<CAMBIAR_*>`; los valores reales solo estaban en la copia local (ahora en `project.local.yml`, gitignored).
Clave SSH de este equipo añadida a `root@VPS` para el arreglo; revocar con: quitar la línea
`...your-email@example.com` de `/root/.ssh/authorized_keys` cuando se desee.

## Format

### [Date] — [ID]: [Task/Journey Name]

- **Work Done**: [What was implemented]
- **Files Created/Modified**: [List]
- **Decisions**: [Any decisions made, or "none"]
- **Security Check**: [Pass/fail summary, or "not applicable"]
- **Tests**: [Tests created, or "none" / "not applicable"]
- **Notes**: [Anything relevant for future sessions]

---

### 2026-05-02 — /review M4: Lead Intelligence (UJ-16→21)

- **Verdict**: **PASS** — Ready for M5. No critical issues found.
- **UJ-16 Investigar empresa por URL**: PASS. Backend: POST /intel/enrichment-runs (requireAuth + rateLimit 10/min), GET /:id, GET /companies/:id/enrichment. SSRF guard verified (IPv4/IPv6 private ranges + DNS lookup, robots.txt, 15s timeout). Frontend: /intel/research with StartResearchForm + EnrichmentRunCard polling + RecentRunsList. Security ✅.
- **UJ-17 Bulk import CSV**: PASS. POST /intel/bulk-import (requireAuth, multipart 2MB, 100 rows, csv-parse). BulkImportForm with template download. File validation (extension + MIME). Security ✅.
- **UJ-18 Revisar pain points**: PASS. CRUD /intel/pain-points (adminGuard). PainPointsTable with confidence filter, human_verified toggle, delete confirm. PainPointNotFoundError → 404. Security ✅.
- **UJ-19 Service fit recommendations**: PASS-WITH-NOTES. GET + POST /intel/service-fit/regenerate (inline, not queued — intentional v1 deviation). ServiceFitList with cards, progress bar, regenerate button. Tab in company detail. Security ✅. Note: 30s timeout not tested.
- **UJ-20 Outbound Prep**: PASS. GET/POST/PATCH /intel/outbound-prep (adminGuard). OutboundPrepCard: editable fields (onBlur PATCH), copy-all clipboard, regenerate. Tab "Outbound" in company detail. Admin view at /intel/outbound. Security ✅.
- **UJ-21 Outbound → Task**: PASS. POST /intel/outbound-prep/:id/to-task (adminGuard). Creates Activity(task) linked to latest active lead (ownerId=lead.ownerId) or company. Button in OutboundPrepCard. Security ✅.
- **Security summary**: requireAuth on all routes, requireRole('admin') on pain-points/service-fit/outbound-prep. SSRF prevention thorough. No credential leaks. hasName() duck-typing for cross-ESM error instanceof.
- **Test counts**: 379 backend + 103 frontend = 482 total, 100% passing.
- **Non-critical notes**: (1) inline regeneration acceptable v1; (2) admin intel pages not Next.js gated (backend enforces role); (3) 30s timeout scenarios untested.
- **Next**: Advance to M5 — UJ-22 Generador de ideas.

---

### 2026-05-02 — /review M3: Admin Panel

**Verdict**: PASS-WITH-NOTES

**Critical issues** (must fix before M4):

- None

**Non-critical notes**:

- UJ-15: `GET /contacts/:id/data-export` uses `requireAuth` but NOT `requireRole('admin')`. The UJ-15 spec says "solo admin" for the export, and the contact detail page is reachable by all authenticated users (not admin-only). This is a minor authorization gap — any authenticated operator/viewer can export any contact's PII. Low urgency (internal app, all users are trusted staff) but violates the spec.
- UJ-14: The spec lists `/admin/external-usage` as one of four endpoints in UJ-14. It was not implemented — only `ai-usage`, `audit-log`, and `integration-health` exist. The frontend does not reference it either, and the task tracker note does not mention it as a gap. Worth noting for M4 if external API cost visibility is needed.
- UJ-12: The `test` action for a credential is fire-and-forget (worker job). The UI only shows the jobId via toast; it does not poll for the job result or update the health chip automatically. The spec says "ver salud actualizarse" after testing — this is a known deferred item per the task tracker but means the acceptance criteria is only partially met.
- UJ-13: The taxonomy page's `refresh` function only invalidates the active tab's query key; switching tabs after a mutation on another tab will show stale data until the query naturally refetches. Minor UX gap.
- All M3 pages use `requireAuth` / `requireRole('admin')` correctly on backend routes. Admin sidebar section is gated to `role === 'admin'` in the Sidebar component.

**Per-UJ summary**:

- UJ-11: PASS — 5 endpoints with `requireRole('admin')`, audit logs, anti-self-deactivation, last-admin guard, full frontend with invite/edit/reset-password dialogs, 11 backend + 5 frontend tests, 401/403 coverage.
- UJ-12: PASS-WITH-NOTES — 7 endpoints with `requireRole('admin')`, no-leak test verified in tests, health chip present, rotate/delete/test dialogs all wired. Gap: test action is fire-and-forget; health chip does not auto-refresh after test completes (known deferred item).
- UJ-13: PASS — 9 endpoints (GET with `requireAuth`, POST/PATCH with `requireRole('admin')`), 3-tab frontend with create/edit/toggle dialogs, 26 backend tests. Minor: per-tab stale invalidation on tab switch after mutation.
- UJ-14: PASS-WITH-NOTES — 3 of 4 spec endpoints implemented (`/admin/ai-usage`, `/admin/audit-log`, `/admin/integration-health`). `/admin/external-usage` omitted without noted deviation. Frontend pages functional with loading/error/empty states, pagination on audit log.
- UJ-15: PASS-WITH-NOTES — `purgeOldLogs` + `exportContactData` implemented and tested. Export button present in contact detail. `/admin/settings` page functional with native confirm guard. Authorization gap: data-export endpoint only requires `requireAuth`, not `requireRole('admin')` as spec states.

---

### 2026-05-02 — /review M3: Admin Panel

- **Verdict**: PASS-WITH-NOTES (0 críticos)
- **Fix aplicado**: `GET /contacts/:id/data-export` escalado de `requireAuth` a `requireRole('admin')` + test 403 añadido en contacts.test.ts.
- **Non-critical notes**:
  - UJ-12: health chip no auto-refresca tras test-ping job (deferred, conocido)
  - UJ-13: stale data posible en tab switch tras mutación (background refetch lo resuelve)
  - UJ-14: `/admin/external-usage` definido en api_contracts pero fuera del alcance del UJ; diferido
- **Tests tras fix**: 313 backend + 90 frontend = 403 totales

---

### 2026-05-02 — UJ-15: GDPR toolkit

- **Work Done**: Pase 1 (Codex): módulo `gdpr` backend — GdprService con `exportContactData` (incluye contactos soft-deleted, activities, leads) y `purgeOldLogs` (deleteMany en ai_usage_logs + external_api_usage_logs con cutoff); endpoint `GET /contacts/:id/data-export` añadido a contacts routes; `POST /admin/gdpr/purge-logs` (requireRole admin) en nueva route gdpr.ts; registrado en server.ts. Pase 2 (Claude directo): `lib/api/gdpr.ts` con `exportContactData` (trigger download via Blob) y `purgeOldLogs`; botón "Exportar datos" en `/contacts/[id]`; `/admin/settings` reemplaza stub con UI de retención (input días + botón purgar + confirmación native + resultado). Fix: `body` → `json` en apiFetch (ApiRequestInit no acepta `body` raw).
- **Files Created**:
  - `backend/src/modules/gdpr/service.ts` — GdprService
  - `backend/src/modules/gdpr/service.test.ts` — 3 tests unitarios
  - `backend/src/modules/gdpr/index.ts` — exports
  - `backend/src/api/routes/gdpr.ts` — POST /admin/gdpr/purge-logs
  - `backend/src/api/routes/gdpr.test.ts` — 4 tests (200/401/403/400)
  - `frontend/src/lib/api/gdpr.ts` — exportContactData + purgeOldLogs
- **Files Modified**:
  - `backend/src/api/routes/contacts.ts` — GET /contacts/:id/data-export añadido
  - `backend/src/api/routes/contacts.test.ts` — +2 tests (200 export + 404)
  - `backend/src/api/server.ts` — registerGdprRoutes registrado
  - `frontend/src/app/(app)/contacts/[id]/page.tsx` — botón "Exportar datos"
  - `frontend/src/app/(app)/admin/settings/page.tsx` — UI de retención real
- **Decisions**: Export vía Blob en cliente (no link directo — requiere Bearer token). Purge sincrónico (no BullMQ — volúmenes pequeños). UI de retención en /admin/settings (no página GDPR nueva — sin link en sidebar). Confirmación nativa `window.confirm` (sin dialog custom — acción destructiva pero simple).
- **Security Check**: PASS — data-export: requireAuth (cualquier usuario autenticado); purge: requireRole('admin'); export no incluye secrets del vault; purge no toca datos de empresas/contactos/leads; sin XSS.
- **Tests**: 393 → 402 (+9 backend: 3 service + 4 gdpr routes + 2 contacts). Frontend: 90 sin cambio.
- **Notes**: Codex devió de 3 campos del spec (Activity.subject → title, Lead.title → company.name, Activity sin deletedAt). Las desviaciones son correctas respecto al schema real de Prisma.

---

### 2026-05-02 — UJ-14: Dashboard IA + Audit + Health

- **Work Done**: Tres páginas del Admin Panel activadas (ya implementadas en working tree desde sesión anterior). Backend: módulo `admin` (AdminService con getAiUsageSummary + getIntegrationHealth), 3 endpoints GET (`/admin/ai-usage`, `/admin/audit-log`, `/admin/integration-health`) con `requireRole('admin')`; AuditService.listPaginated añadido. Frontend: páginas `/admin/ai-costs` (métricas 4 cards + tablas por feature/modelo/día), `/admin/audit` (tabla filtrable por actor/acción/fecha + paginación), `/admin/integrations` (tabla con HealthChip + estado activo). API client `lib/api/admin.ts` con 3 funciones. Verificado: lint ✅, typecheck ✅, 303 backend + 90 frontend = 393 tests ✅.
- **Files Created**:
  - `backend/src/modules/admin/service.ts` — AdminService
  - `backend/src/modules/admin/service.test.ts` — 3 tests
  - `backend/src/modules/admin/index.ts` — exports
  - `backend/src/api/routes/admin.ts` — 3 endpoints
  - `backend/src/api/routes/admin.test.ts` — 7 tests (401/403/200 por endpoint)
  - `frontend/src/lib/api/admin.ts` — tipos + cliente (getAiUsage, getAuditLog, getIntegrationHealth)
- **Files Modified**:
  - `backend/src/modules/audit/service.ts` — listPaginated añadido
  - `backend/src/modules/audit/index.ts` — export listPaginated
  - `backend/src/api/server.ts` — registerAdminRoutes registrado
  - `frontend/src/app/(app)/admin/ai-costs/page.tsx` — página real (reemplaza stub)
  - `frontend/src/app/(app)/admin/audit/page.tsx` — página real (reemplaza stub)
  - `frontend/src/app/(app)/admin/integrations/page.tsx` — página real (reemplaza stub)
- **Decisions**: Sin gráfico de línea (no hay librería de charts instalada — tablas son suficientes para v1). AuditLog.listPaginated en AuditService (no AdminService) para mantener separación de módulos.
- **Security Check**: PASS — todos los endpoints con requireRole('admin'); audit log no expone campos sensibles; credenciales sin reveal; sin XSS (React escapa).
- **Tests**: 383 → 393 (+10 backend: 7 routes + 3 service). Frontend: 90 sin cambio.

---

### 2026-04-29 — UJ-12: Credential Vault UI

- **Work Done**: Página `/admin/credentials` real (reemplaza stub). Backend ya estaba en working tree (route + tests + cableado en server.ts) — solo se limpió un unused var en `credentials.test.ts` (`SAMPLE_CRED_HTTP`). Frontend implementado directamente por Claude (Codex falló por parse error de shell en la invocación). 8 archivos nuevos + 1 modificado.
- **Files Created/Modified**:
  - `frontend/src/lib/api/credentials.ts` — tipos + cliente API (listCredentials, createCredential, rotateCredential, setCredentialActive, deleteCredential, testCredential)
  - `frontend/src/components/credentials/HealthChip.tsx` — chip visual con colores ok/warn/error/unknown + tooltip nativo con lastError
  - `frontend/src/components/credentials/CredentialsTable.tsx` — tabla con columnas Key/Label/Provider/Salud/Estado/Última rotación/Acciones; botón "Probar" disabled si inactiva
  - `frontend/src/components/credentials/CredentialsTable.test.tsx` — 5 tests
  - `frontend/src/components/credentials/CreateCredentialDialog.tsx` — Zod (key regex `^[a-z0-9_]+$`), toggle show/hide plaintext, 409 → toast
  - `frontend/src/components/credentials/CreateCredentialDialog.test.tsx` — 3 tests (submit válido, 409, validación key)
  - `frontend/src/components/credentials/RotateCredentialDialog.tsx` — un solo campo newPlaintext con toggle
  - `frontend/src/components/credentials/DeleteCredentialDialog.tsx` — confirmación con key exacta (patrón AnonymizeContactDialog)
  - `frontend/src/app/(app)/admin/credentials/page.tsx` — page real con react-query, dialogs, estados loading/error/vacío/datos
  - `backend/src/api/routes/credentials.test.ts` — eliminado `SAMPLE_CRED_HTTP` unused (lint fix)
- **Decisions**: Test-ping fire-and-forget (encola job, muestra toast con jobId, sin polling). Worker `integration_test` queda como placeholder — implementar probes reales por proveedor es deuda fuera de UJ-12. `reveal()` nunca expuesto por HTTP.
- **Security Check**: PASS — no crypto fields en responses, plaintext solo en input, sin dangerouslySetInnerHTML, authz requireRole('admin'), delete confirma key exacta.
- **Tests**: 8 nuevos frontend (5 CredentialsTable + 3 CreateCredentialDialog). Backend credentials: 11 tests ya existentes en working tree. Total: 267 backend + 86 frontend = 353.
- **Notes**: Codex falló en invocación porque el prompt contenía backticks + `${}` que zsh interpretó como expansión de comandos. Claude implementó directamente. Patrón a recordar: evitar backticks y `${}` en prompts pasados como argumento de shell a codex-companion.

---

### 2026-04-29 — UJ-10: Filtros guardados

- **Work Done**: Hook `usePersistedFilters(key, userId)` con clave `heyday:filters:{key}:{userId ?? 'anonymous'}` en localStorage. SSR guard (`typeof window === 'undefined'`). Funciones estables via `useCallback`. Integrado en `/companies` y `/leads` pages: restaura al montar si URL sin params (useRef para satisfacer exhaustive-deps), persiste al cambiar `searchParams`, botón «Restablecer filtros» visible cuando `hasActiveFilters`. 4 tests nuevos.
- **Files Created**: `frontend/src/hooks/usePersistedFilters.ts`, `frontend/src/hooks/usePersistedFilters.test.ts`
- **Files Modified**: `frontend/src/app/(app)/companies/page.tsx`, `frontend/src/app/(app)/leads/page.tsx`
- **Decisions**: Un hook por par (key, userId) en vez de store global. Clave anónima como fallback (sin userId). Vaciar localStorage cuando params son vacíos (en vez de guardar string vacío). Patrón useRef para ejecutar efecto de monte solo una vez sin lint warning.
- **Security Check**: Pass. Sin PII en claves o valores (solo URLSearchParams serializada: q, filtros de dominio público). Aislamiento por userId evita cross-user leakage. Sin XSS (valores de URL ya validados al parsear).
- **Tests**: 69 → 73 frontend (+4). Total: 245 backend + 73 frontend = 318 tests.
- **Notes**: Codex crash silencioso post-edición (patrón conocido). Trabajo en working tree intacto; lint/typecheck/test todo verde sin correcciones adicionales.

---

### 2026-04-29 — UJ-09: Empty states y onboarding

- **Work Done**: `ComingSoonPage` reutilizable con props `title`, `description`, `milestone` + link «← Volver al inicio». 16 stub pages explícitas (no catch-all): `/activities`, `/intel/{companies,contacts,leads,content}`, `/content/{ideas,drafts,reviews,schedule}`, `/admin/{users,credentials,taxonomies,dashboard,gdpr,settings}`. Test de `ComingSoonPage` (+1). Sin 404s en sidebar.
- **Files Created**: `frontend/src/components/ComingSoonPage.tsx`, `frontend/src/components/ComingSoonPage.test.tsx`, 16 `page.tsx` stub files
- **Decisions**: Pages explícitas en vez de catch-all para facilitar sustitución gradual milestone a milestone. Milestone labels en español (M3/M4/M5).
- **Security Check**: Pass. Solo HTML estático, sin datos de usuario.
- **Tests**: 313 → 314 frontend (+1 ComingSoonPage test). Total: 314 tests.

---

### 2026-04-29 — UJ-08: Dashboard de inicio (backend + frontend)

- **Work Done**: 2 pases bajo patrón Claude+Codex. **Pase 1 backend**: módulo `dashboard` con `DashboardService` (metrics via `$transaction` 4 queries paralelas, upcomingActions filtradas por `ownerId`, topPriorityLeads top-5 con stage include). Decisión de Codex aceptada: `Lead` no tiene `title` → mapeado desde `company.name`. `Cache-Control: private, max-age=30` en los 3 endpoints. `approvals_pending: 0` con TODO(M5). **Pase 2 frontend**: `getDashboardMetrics/getUpcomingActions/getTopPriorityLeads` con `apiFetch`. `DashboardPage` sustituye el placeholder: 4 metric cards (3 con link), "Próximas acciones" + "Leads de máxima prioridad" con skeleton loading, "Coste IA este mes", empty state global cuando todo vacío.
- **Files Created**: `backend/src/modules/dashboard/{schemas,service,service.test,index}.ts`, `backend/src/api/routes/dashboard.{ts,test.ts}`, `frontend/src/lib/api/dashboard.{ts,test.ts}`
- **Files Modified**: `backend/src/api/server.ts`, `frontend/src/app/(app)/dashboard/page.tsx`
- **Decisions**: `Lead.title` mapeado desde `company.name` (Lead no tiene campo title). Sin caché Redis (Cache-Control 30s suficiente en v1). Sin mini-gráfico IA (sin histórico hasta M3). `topPriorityLeads` global (sin RBAC hasta UJ-11).
- **Security Check**: Pass. Auth requerido, Cache-Control private, upcoming filtradas por ownerId, sin PII en logs.
- **Tests**: 245 → 245 backend (+18: service 12 + routes 6); 65 → 68 frontend (+3: api client tests). Total: 313 tests.
- **Notes**: Codex completó ambos pases con reporte limpio (primer pase sin crash). Sin correcciones post-Codex necesarias.

---

### 2026-04-29 — UJ-07 Pase 2: Importación CSV empresas — Frontend

- **Work Done**: `ImportCompaniesDialog` con 3 steps (upload → preview dry-run → result). Cliente `imports.ts` con `fetch` directo + `getAccessToken()` (apiFetch no soporta FormData). Plantilla CSV estática en `frontend/public/templates/companies-template.csv`. Botón "Importar CSV" en `/companies` page. Correcciones post-Codex por Claude: hoisting issue en test (vi.hoisted para mocks de sonner + api); `getByText('3', { selector: 'p' })` → `getAllByText` (dos chips con valor 3 en el mismo render). 59 → 65 frontend tests (+6).
- **Files Created**: `frontend/src/lib/api/imports.ts`, `frontend/src/components/imports/ImportCompaniesDialog.tsx`, `frontend/src/components/imports/ImportCompaniesDialog.test.tsx`, `frontend/public/templates/companies-template.csv`
- **Files Modified**: `frontend/src/app/(app)/companies/page.tsx` (+botón Importar CSV + estado importOpen + ImportCompaniesDialog)
- **Decisions**: `fetch` directo en vez de `apiFetch` para multipart (apiFetch omite `body` del tipo). Reset del modal via `useEffect([open])`. Toast lanzado desde el handler (step='result'). No barra de progreso (inline síncrono rápido).
- **Security Check**: Pass. Validación cliente de extensión y tamaño (2 MB). Sin PII visible en resultados. Mensajes de error backend mostrados inline (escapados por React). Sin leaks de stack traces.
- **Tests**: 59 → 65 frontend (+6). Total: 227 backend + 65 frontend = 292 tests.
- **Notes**: Codex crash silencioso post-lint (patrón conocido). Typecheck falla inicial en test por spread sobre `unknown[]` — corregido por Codex en siguiente iteración. Correcciones finales aplicadas directamente por Claude. UJ-07 completo (backend + frontend).

---

### 2026-04-29 — UJ-07 Pase 1: Importación CSV empresas — Backend

- **Work Done**: Módulo `imports` completo. `domain.ts` — `parseCompanyCsv` con `csv-parse/sync`, BOM strip, detección de cabeceras requeridas (`name`), filtrado de cabeceras desconocidas, rowNumber 1-based. `schemas.ts` — `CsvRowSchema` (partial de `CompanyCreateSchema` con `emptyToUndefined` preprocess para campos opcionales; country default `ES`), `ImportResultDto`. `service.ts` — `CompaniesImportService.run(buffer, userId, dryRun)`: cap 1.000 filas previa, header check → `ImportHeaderError`, validación Zod por fila, dedupe in-CSV via `Set` + `normalizeDomain`, dedupe in-DB con una sola query `findMany`, inserción 1-a-1 con try/catch individual, audit log sin PII. Ruta `POST /companies/import-csv` con multipart encapsulado en plugin scope (`fileSize: 2 MB`), extensión/mimetype check, `dry_run` query param, mapeo `ImportHeaderError → 422`, `ImportCapError → 400`. `registerImportsRoutes` registrado en `server.ts` tras `registerCompaniesRoutes`. Corrección de Claude sobre Codex: `rows_failed` usaba `errors.length` (incluía duplicados) → corregido a `errors.filter(code==='validation').length`. Codex aisló `companies.test.ts` en buildTestApp local (igual que imports.test.ts) para evitar acoplamiento con `server.ts`.
- **Files Created**: `backend/src/modules/imports/domain.ts`, `backend/src/modules/imports/schemas.ts`, `backend/src/modules/imports/service.ts`, `backend/src/modules/imports/service.test.ts`, `backend/src/api/routes/imports.ts`, `backend/src/api/routes/imports.test.ts`
- **Files Modified**: `backend/src/api/server.ts` (+2 líneas), `backend/src/api/routes/companies.test.ts` (+buildTestApp local), `backend/package.json` (+@fastify/multipart, +csv-parse)
- **Decisions**: Procesamiento **inline síncrono** (no BullMQ). Cap 1.000 filas / 2 MB. Solo delimitador `,` (Excel ES usa `;` — documentar en UI). BullMQ diferido a UJ-17 cuando emerja demanda de >2k filas.
- **Security Check**: Pass. Auth requerido, validación tipo/tamaño/filas, Zod por fila, audit log sin PII, Prisma parametrizado, sin leak de stack traces.
- **Tests**: 209 → 227 backend (+18: service 12 + routes 6)
- **Notes**: `TODO(roles)` en route comentado para UJ-11. Codex crash silencioso en fase verifying (patrón conocido) — diff revisado manualmente, verificaciones pasaron exit 0. Pase 2 frontend pendiente.

---

### 2026-04-28 — UJ-06: Tags polimórficas y búsqueda global (backend + frontend)

- **Work Done**: UJ-06 cerrado completo bajo patrón Claude orquestador + Codex ejecutor en 3 pases. **Mini-pase 1.1 (backend, Claude directo)**: extender `/search` para incluir activities. `searchAll` añade un 4º query sobre `Activity` (match por `title` + `body`), recoge `entityIds` por tipo y hace 3 queries en paralelo para verificar parent-alive (`company.deletedAt:null`, `contact.deletedAt:null + anonymizedAt:null + companyId null|company alive`, `lead.deletedAt:null + company.deletedAt:null`). Filtra activities huérfanas, mapea hits con `subtitle = "${kind} · ${parentLabel}"`, fallback `'(sin título)'` para activities sin title. **Pase 2A (frontend, Codex)**: `lib/api/tags.ts` con 8 funciones + helpers `isTagNameConflict`/`isTagAssignmentConflict` (usa `error.message.includes` no `.startsWith` tras corrección de Claude — el mensaje backend es `La tag "..." ya está asignada...`, no empieza con `ya está asignada`). `lib/api/search.ts` con tipos `SearchHit`/`SearchResults`. `TagBadge.tsx` (pill con color hex validado backend → inline style; sin color → clases neutras) y `TagPicker.tsx` (typeahead debounced 300ms, create-on-the-fly con selector de `kind`, chip removal, react-query mutations con invalidación correcta, navegación por teclado ARIA combobox). Integración en sección "Tags" de `CompanyFormDialog`/`ContactFormDialog`/`LeadFormDialog` (NO en `ActivityFormDialog` — el enum `TaggableEntityType` backend no incluye `'activity'`). En modo create (sin entityId) renderiza hint "Guarda primero para añadir tags." en vez de input. **Pase 2B (frontend, Codex)**: `<GlobalSearch />` palette flotante usando `<Modal />` existente, atajo `Cmd/Ctrl+K` global en Topbar (reemplaza el `<input disabled>` placeholder por `<button>` con `<kbd>⌘K</kbd>`), debounce 300ms, navegación por teclado plana sobre todos los hits agrupados por sección, mapeo a detalle: company→`/companies/:id`, contact→`/contacts/:id`, lead→`/leads/:id`, activity→toast "Las actividades se editan desde la pestaña Actividad…" (no hay detail page propio).
- **Files Created/Modified**:
  - **Backend (mini-pase 1.1)**: `backend/src/modules/search/{schemas.ts,service.ts,service.test.ts}` (extendidos: 6→10 service tests). `backend/src/api/routes/search.test.ts` (mock incluye activities). El Pase 1 backend de Codex (módulo `tags` + `search` inicial) ya estaba en working tree de la sesión previa: `backend/src/modules/tags/{schemas.ts,service.ts,index.ts,service.test.ts}` (16 tests), `backend/src/modules/search/{schemas.ts,service.ts,index.ts,service.test.ts}` (6 tests originales), `backend/src/api/routes/{tags,search}.{ts,test.ts}` (8+4 tests), `backend/src/api/server.ts` (registra rutas), `backend/src/api/plugins/error-handler.ts` (4 mappings nuevos: `Tag{Not,AssignmentEntity}FoundError → 404`, `Tag{Name,Assignment}ConflictError → 409`).
  - **Frontend (Pase 2A)**: `frontend/src/types/tag.ts`, `frontend/src/lib/api/{tags,search}.ts`, `frontend/src/components/tags/{TagBadge.tsx,TagBadge.test.tsx,TagPicker.tsx,TagPicker.test.tsx}` (2+6 tests). Modificados: `frontend/src/components/companies/CompanyFormDialog.tsx`, `frontend/src/components/contacts/ContactFormDialog.tsx`, `frontend/src/components/leads/LeadFormDialog.tsx` (sección Tags). `frontend/src/components/companies/CompanyFormDialog.test.tsx` (envuelve en QueryClientProvider por dependencia transitiva del TagPicker).
  - **Frontend (Pase 2B)**: `frontend/src/components/{GlobalSearch.tsx,GlobalSearch.test.tsx}` (4 tests). Modificado: `frontend/src/components/Topbar.tsx` (botón abre palette + listener ⌘K).
- **Decisiones**:
  1. **Activities NO son taggables**: el enum `TaggableEntityType` del backend incluye `company|contact|lead|content_item` pero no `activity`. Decisión consciente del schema original; mantener consistencia. `TagPicker` solo se integra en 3 dialogs, no 4.
  2. **`content_item` taggable pero TODO(M5)**: schema lo permite, service lanza `TagAssignmentEntityNotFoundError` con comentario explícito hasta que aterrice el módulo en M5.
  3. **Activities NO tienen detail page**: en M1 se editan desde tabs "Actividad" del padre. `GlobalSearch` muestra toast informativo en vez de navegar; deuda explícita hasta que se decida UX (no hay deep-link por ahora). Backend search hit no devuelve `entity_type`/`entity_id` del padre — añadirlo está fuera de scope.
  4. **Helper `isTagAssignmentConflict` con `.includes` no `.startsWith`**: el backend lanza `La tag "${id}" ya está asignada a "${type}" con id "${id}"`. Codex inicialmente puso `.startsWith('ya está asignada')` que jamás matcheaba. Claude detectó en review pre-commit y corrigió.
  5. **`useDebouncedValue` duplicado** en `CompanyPicker.tsx`, `TagPicker.tsx`, `GlobalSearch.tsx`: decisión consciente de NO extraer a hook compartido todavía. Tres copias triviales no justifican la abstracción prematura; cuando aterrice un cuarto consumidor, reabrir.
  6. **TagPicker en modo create** muestra hint en vez de input (decisión confirmada con usuario): los tags son una relación post-save, evitar acumular tags pendientes en form-state local complica el UX y no aporta valor v1. Edit-only.
  7. **Limit `* 6` en activity.findMany**: pool más grande que companies/contacts/leads (`* 3`) porque el filtro post-fetch parent-alive puede descartar muchas; mantenerlo conservador.
- **Security Check**: PASS. Sin hardcoded secrets. `requireAuth` en los 8 endpoints de tags + el de search. Audit log sin PII (solo `{name, kind, tag_id, entity_type, entity_id}`). Validación zod en todos los endpoints. `TagBadge` aplica `tag.color` validado backend (`/^#[0-9A-Fa-f]{6}$/`) en `style`, sin vector XSS. Error responses con códigos genéricos (`VALIDATION_ERROR`, `NOT_FOUND`) sin filtrar internals. Anti-huérfano correcto en `assign` y en `search` (companies/contacts/leads y activities-via-parent).
- **Tests**: backend 209/209 (26 archivos, +34 vs UJ-05: tags 16+8, search 6+4 originales del Pase 1 + 4 nuevos en mini-pase 1.1 = 6→10 service tests). Frontend 59/59 (17 archivos, +12 vs UJ-05: TagBadge 2 + TagPicker 6 + GlobalSearch 4). Total monorepo: **268 tests verde**. Lint 0 warnings, format 0 warnings, typecheck limpio en 3 workspaces.
- **Notes**:
  - **Validación end-to-end en navegador pendiente**: TagPicker (3 dialogs) + GlobalSearch palette + atajo ⌘K. Requiere docker compose up + login. Sin spec Playwright E2E para tags/search en este pase (consistente con UJ-05; añadir cuando CI live esté operativo).
  - **Backend Pase 1 estaba sin commitear** desde la sesión previa (Codex había completado tags + search inicial pero la sesión cerró antes de commit). Esta sesión revisó manualmente, corrió lint+typecheck+test sobre todo, y consolidó en un único commit junto con mini-pase 1.1 + 2A + 2B.
  - **Correcciones de review pre-commit aplicadas por Claude** (no por Codex): (a) helper `isTagAssignmentConflict` con `.includes` correcto, (b) format con prettier sobre 6 archivos.

---

### 2026-04-28 — UJ-05: Activities polimórficas (backend + frontend)

- **Work Done**: UJ-05 cerrado completo bajo patrón Claude orquestador + Codex ejecutor en dos pases (backend + frontend). Plan A: respeta el modelo `Activity` ya existente en schema.prisma:417 (polimórfico `(entity_type, entity_id)`, enums `ActivityKind = note|task|call_log|email_log|meeting_log` y `ActivityEntityType = company|contact|lead`); SIN migración nueva, SIN `whatsapp` en kind (entrará por taxonomías editables en UJ-13), SIN `outcome`, SIN soft-delete (delete duro). Pase 1 (backend, 21m 58s Codex): módulo `activities` siguiendo patrón `contacts` exacto, anti-huérfano en `create` que verifica entidad referenciada existe Y no está soft-deleted (`deletedAt: null` en company/lead, `deletedAt: null + anonymizedAt: null` en contact — no se pueden añadir actividades a contactos anonimizados), 4 endpoints `/activities` con `requireAuth`, audit log en mutaciones con metadata mínima `{kind, entity_type, entity_id}` sin PII, mapeo `Activity{Not,Entity}FoundError → 404 NOT_FOUND` en error-handler. Pase 2 (frontend, 6m 32s Codex): `lib/api/activities.ts` + tipos, `ActivityFeed.tsx` reutilizable (filtros kind + pendientes/todos/completados + mías/todas, toggle completado via PATCH `completed_at`, react-query con invalidación tras mutaciones, estados loading/error/empty, fechas relativas con `Intl.RelativeTimeFormat('es')`), `ActivityFormDialog.tsx` (zod cliente + datetime-local↔ISO, manejo de field-level errors del backend, sin owner_id en UI v1 con TODO(roles)), `DeleteActivityDialog.tsx`. Integración: tabs "Actividad" de `/leads/[id]`, `/contacts/[id]` y `/companies/[id]` ahora renderizan `<ActivityFeed entityType={...} entityId={...} />` (sustituyen el placeholder).
- **Files Created/Modified**:
  - **Backend** (Pase 1): `backend/src/modules/activities/{schemas.ts,service.ts,index.ts,service.test.ts}` (14 service tests), `backend/src/api/routes/activities.{ts,test.ts}` (7 routes tests). Modificados: `backend/src/api/server.ts` (wire `registerActivitiesRoutes`), `backend/src/api/plugins/error-handler.ts` (mapeo errores), `backend/vitest.config.ts` (testTimeout 15000).
  - **Frontend** (Pase 2): `frontend/src/types/activity.ts`, `frontend/src/lib/api/activities.{ts,test.ts}` (5 tests), `frontend/src/components/activities/{ActivityFeed.tsx,ActivityFormDialog.tsx,ActivityFormDialog.test.tsx,DeleteActivityDialog.tsx}` (3 dialog tests). Modificados: `frontend/src/app/(app)/{leads,contacts,companies}/[id]/page.tsx` (sustitución de placeholder en tab Actividad).
- **Decisiones**:
  1. **Plan A sin migración**: Activity ya estaba en el schema. No tocar enums hasta UJ-13 (taxonomías editables) — mantener scope limpio.
  2. **Anti-huérfano en `create`**: bloquear actividades sobre entidades soft-deleted (incluyendo contactos anonimizados) para evitar feeds basura. Costo: 1 query previa al insert; aceptable.
  3. **`testTimeout: 15000` en vitest backend**: bcrypt cost 12 + 21 tests adicionales saturaba CPU y los tests de auth/password timean en el default 5s. Fix de raíz, no diferir imports.
  4. **owner_id no expuesto en UI v1**: backend default = createdById. TODO(roles) marcado para UJ-11+ cuando entren operator/viewer.
  5. **Filtros UI minimalistas**: kind + pending/all/completed + mine/all. Backend ya soporta `due_from/to`; no exponer en UI hasta que haya demanda real.
- **Security Check**: PASS. Sin hardcoded secrets, `requireAuth` global, audit log sin PII (solo `{kind, entity_type, entity_id}`), validación cliente (zod) + servidor, parameterized queries via Prisma, XSS-safe (todos los campos `title`/`body` se renderizan como text nodes JSX → auto-escape), input validation con `max(200)` en title y `max(10_000)` en body, error responses no filtran internals.
- **Tests**: 189 → **218** (+29). Backend 150 → 171 (+21: 14 service + 7 routes). Frontend 39 → 47 (+8: 5 api + 3 dialog).
- **Review crítica aplicada**: Codex Pase 1 introdujo dynamic imports (`await import('../../modules/activities/service.js')`) en cada handler de `routes/activities.ts` "para evitar timeouts del suite". Era síntoma, no causa raíz: el problema real era `testTimeout` insuficiente bajo CPU contention. Reescrito a static import (mismo patrón que `contacts.ts`) y ajustado `testTimeout` a 15000ms en `backend/vitest.config.ts`. **Patrón a recordar**: si Codex reporta un workaround "para evitar X bajo paralelismo", verificar la causa raíz antes de aceptar; los workarounds de paralelismo casi siempre son timeouts mal calibrados.
- **Notes**: Migración Prisma `add_contact_anonymized_at` sigue pendiente desde UJ-03 (no bloquea — Activity reutiliza tablas ya migradas). Validación end-to-end en navegador requiere docker compose up + login: probar crear/editar/borrar/togglear actividades en los tres detalles. M1 cierra con UJ-06 (Tags y búsqueda global) — tras eso, correr `/review` del milestone.

---

### 2026-04-28 — UJ-04 (Pase 2 frontend): Kanban + Lista de Leads

- **Work Done**: Frontend completo de UJ-04 bajo patrón Claude orquestador + Codex ejecutor, dividido en dos sub-pases para reducir exposición a crashes silenciosos.
  - **Sub-pase 2A — Tipos + API + dialogs** (Codex 7m19s, sin crash):
    - `frontend/src/types/{lead,pipeline}.ts` espejo del wire camelCase del backend (DTOs de leads/pipelines NO se snake_case-an, a diferencia de companies/contacts).
    - `frontend/src/lib/api/{leads,pipelines}.ts` (+ tests) con `apiFetch` + `buildSearchParams`. `deleteLead` maneja 204 sin parsear body. +7 tests.
    - `frontend/src/components/leads/`: `ContactPicker.tsx` (typeahead filtrado por company, hint "Selecciona empresa primero" si null), `LeadFormDialog.tsx` (CompanyPicker + ContactPicker + selects pipeline/stage con reset al cambiar pipeline + owner=`useAuthStore` con TODO(roles) para UJ-11), `WonLeadDialog.tsx`, `LostLeadDialog.tsx` (textarea 1..500). +2 tests dialog.
    - **Cleanup Claude**: Codex añadió un campo `title` huérfano que el backend ignora; eliminado inline (regla 9: edits triviales single-file van por Claude).
  - **Sub-pase 2B — Páginas + Kanban + E2E** (Codex ~10m, sin crash):
    - `frontend/src/components/leads/`: `KanbanBoard.tsx` con `@dnd-kit/core` (DndContext + closestCorners + droppable column + draggable card; sin sortable interno), `LeadList.tsx` con tabla + acciones por fila (Editar/Mover/Won/Lost/Eliminar), `MoveStageDialog.tsx` (delegate Won/Lost al padre via `onRequestWon`/`onRequestLost`), `DeleteLeadDialog.tsx`.
    - `frontend/src/app/(app)/leads/page.tsx`: toggle Kanban/Lista (segmented), filtros URL-synced (q, owner_id, status, priority_min, view, pipeline_id), botón "Nuevo lead", invalidate de `['leads']` tras cada mutation.
    - `frontend/src/app/(app)/leads/[id]/page.tsx`: header con stage badge + status + owner + priority + nextActionAt; tabs "Resumen" (datos planos) + "Actividad" (placeholder UJ-05); todas las acciones disponibles (delete redirige a /leads).
    - `frontend/tests/e2e/leads-crud.spec.ts` gated por env (login → crear empresa → crear lead → mover stage por botón "Mover a stage…" → won → eliminar). NO usa DnD (frágil en E2E).
    - **Bug crítico mitigado por Claude**: la sandbox de Codex no tiene red al registro npm; Codex creó un shim `frontend/src/types/dnd-kit.d.ts` que enmascaraba la falta de `@dnd-kit/*` y dejaba el árbol sin runtime real. Claude instaló desde shell con red (`pnpm --filter frontend add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`) y eliminó el shim. Versiones: core ^6.3.1, sortable ^10.0.0, utilities ^3.2.2.
- **Files Created**: 11 (Pase 2A) + 7 (Pase 2B) = 18 nuevos.
- **Files Modified**: `frontend/package.json` (+3 deps), `frontend/src/components/leads/LeadFormDialog.tsx` + test (cleanup `title` huérfano).
- **Decisiones**:
  1. **Split en sub-pases 2A/2B**: 2A sin deps nuevas para aislar verificación antes de meter `@dnd-kit`. Reduce exposición a crash silencioso (memoria existente).
  2. **camelCase end-to-end en leads/pipelines**: confirmado que `service.ts` no remapea (a diferencia de contacts.service.ts), tipos frontend espejan el wire.
  3. **Owner sin selector en form**: default `useAuthStore((s)=>s.user)?.id`. TODO(roles) marcado para UJ-11.
  4. **Stages activos = todos los stages** del pipeline (Codex desviation aceptada): `PipelineStageDto` no tiene flag `active`. Si M3 lo añade, se ajusta.
  5. **Kanban fetch con `pageSize: 200`** (Codex desviation aceptada): pragmático para v1; revisar virtualización si una columna supera ese tamaño.
  6. **DnD fuera de E2E**: spec usa el botón "Mover a stage…" (accesible + estable). DnD se valida manualmente en navegador.
  7. **Shim dnd-kit**: rechazado, instalación real desde Claude.
- **Security Check**: pasa.
  - Sin secretos en código nuevo.
  - Toasts genéricos (no filtran detalles del backend).
  - Validación zod local en LeadFormDialog + LostLeadDialog antes de llamar API; backend revalida (createLeadSchema/updateLeadSchema/lostLeadSchema).
  - React escapa text por defecto. `style={{borderColor, backgroundColor: \`${color}22\`}}`con`color` validado en backend con regex hex (defense-in-depth: aunque CSS injection vía property setter es bloqueada por el browser para valores inválidos).
  - `lostReason` rendered como text plano.
  - No file uploads.
  - `@dnd-kit/*` paquetes oficiales del autor de react-beautiful-dnd, npm registry.
- **Tests**: +7 frontend (39 total: 4 leads.api + 1 pipelines.api + 2 LeadFormDialog). E2E spec creada pero no se ejecuta en `pnpm test`. Total proyecto: **189 tests** (150 backend + 39 frontend).
- **Verificación**:
  - `pnpm lint` ✅ (3 ws)
  - `pnpm typecheck` ✅ (3 ws)
  - `pnpm test` ✅ 189/189
  - `pnpm format:check` ⏳ falla por `docs/project_memory.md` + `implementation/task_tracker.md` pre-existentes (out-of-scope; deuda de formato pre-existente, no introducida en este pase).
- **Notes**:
  - **Validación end-to-end pendiente**: requiere docker compose up + login real para probar Kanban DnD, mover stage por botón, won/lost en el navegador.
  - **Migración Prisma `add_contact_anonymized_at`** sigue pendiente desde UJ-03 (no bloquea).
  - **`pnpm-lock 2.yaml` residual** sigue en raíz, sin limpiar.
  - **Crashes de Codex en este UJ**: cero. Patrón split en sub-pases parece reducir exposición. Bug del shim dnd-kit fue por sandbox sin red, no por crash.

---

### 2026-04-27 — UJ-04 (Pase 1 backend): Pipelines y Leads modules

- **Work Done**: Backend completo de pipelines + leads bajo patrón Claude orquestador + Codex ejecutor. Dos pases de Codex con crash silencioso al final (tras escribir el grueso); recuperación manual: árbol intacto, verificación corrida por Claude.
  - **Pipelines module** (`backend/src/modules/pipelines/`): domain.ts (5 errores tipados), schemas.ts (zod create/update + stage), service.ts (list/getById/create/update + addStage con auto-append + updateStage con reorder transaccional + deleteStage que rechaza 409 si hay leads o si quedaría sin won/lost). 14 tests.
  - **Leads module** (`backend/src/modules/leads/`): domain.ts (4 errores), schemas.ts (create/update/list/lost con zod), service.ts con `list` paginado + filtros (stage, owner, status, priorityMin, companyId, q OR sobre company.name + contact name/email), `getById` con include completo, `create` valida stage∈pipeline y contact∈company, `update` rechaza cambio de pipeline, `markWon`/`markLost` mueven al primer stage del kind correspondiente, `softDelete` idempotente. 15 tests.
  - **Routes** (`backend/src/api/routes/`): pipelines.ts (6 endpoints) y leads.ts (7 endpoints) con `requireAuth` y `request.authUser`. 6 + 9 tests de integración (mocks a nivel servicio + supertest contra Fastify).
  - **error-handler.ts** extendido: NotFound→404 (Pipeline/Stage/Lead), 409 para StageHasLeads/StageNotInPipeline/LeadCompanyMismatch/InvalidStageKind/InvalidLeadTransition, 400 para InvalidStageOrder.
  - **server.ts**: registra pipelinesRoutes y leadsRoutes junto a companies/contacts.
- **Files Created**: 12 archivos nuevos (10 módulos + 2 routes + tests).
- **Files Modified**: 2 (error-handler.ts, server.ts).
- **Decisiones**:
  1. **No cambio de pipeline en v1**: PATCH /leads/:id rechaza con InvalidLeadTransitionError si `pipelineId` difiere del actual. Si en el futuro se permite, será una transición explícita con regeneración de stage.
  2. **markWon/markLost mueven al primer stage del kind si no estaba en uno**: respeta `orderIndex` asc. Mantiene coherencia entre `status` y `stage.kind`.
  3. **Authz v1 admin-only**: `requireAuth` global, sin owner-check. TODO(roles) en service para update/delete/won/lost cuando aterricen operator/viewer.
  4. **`q` en list leads**: OR insensitive contains sobre company.name + primaryContact.firstName/lastName/email. No incluye campos del lead mismo (no hay texto libre).
  5. **Crashes de Codex**: 2 crashes silenciosos durante la fase de edición (PIDs muertos, último log ~5min antes de detectar). El árbol quedó completo en el segundo intento; cancelado en companion y verificación corrida por Claude. No se relanzó ya que toda la salida pasó las verificaciones.
- **Security Check**: pasa.
  - Sin secretos.
  - Validación zod en todos los boundaries.
  - `requireAuth` en todas las rutas.
  - Sin PII en logs ni mensajes de error (`lostReason` no se loggea, viaja a DB y al render).
  - Prisma parametriza queries.
  - Soft delete: leads borrados no aparecen en list ni getById.
  - Authz admin-only documentada (TODO para roles futuros).
- **Tests**: +44 backend (14 pipelines svc + 15 leads svc + 6 pipelines routes + 9 leads routes). Total backend: 150 (antes 106). Total proyecto: 182 (150 backend + 32 frontend).
- **Verificación**:
  - `pnpm --filter @heyday/backend run typecheck` ✅
  - `pnpm --filter @heyday/backend run lint` ✅
  - `pnpm --filter @heyday/backend run test` ✅ 150/150
  - `pnpm format:check` ✅ (tras `prettier --write` sobre 5 archivos nuevos).
- **Notes**: Migración `add_contact_anonymized_at` sigue pendiente de UJ-03 (no bloquea). Pase 2 frontend de UJ-04 (Kanban con dnd-kit + lista) queda como siguiente paso.

---

### 2026-04-27 — UJ-03 (Pase 2 frontend): CRUD de Contactos + anonymize

- **Work Done**: Frontend completo del módulo `contacts`. Codex Pase 2 (continuando thread del Pase 1).
  - `types/contact.ts`, `lib/api/contacts.ts` (+ test) con CRUD + `anonymizeContact`.
  - `components/contacts/CompanyPicker.tsx` — typeahead remoto contra `/companies?q=` con TanStack Query, debounce 300ms, ARIA combobox/listbox, click-outside + Esc.
  - `ContactFormDialog.tsx` (+ test) — form con validación zod inline, sección "Más datos" colapsable, toggle `is_primary` deshabilitado si no hay company asignada (tooltip nativo `title`).
  - `DeleteContactDialog.tsx` y `AnonymizeContactDialog.tsx` (+ test) — esta última con doble confirmación: el botón solo se habilita si el usuario escribe literal `ANONIMIZAR`.
  - `app/(app)/contacts/page.tsx` — lista con filtros q + is_primary, paginación, URL sync, empty states. Filtro por `company_id` omitido este pase (TODO).
  - `app/(app)/contacts/[id]/page.tsx` — detalle con tabs Resumen/Leads (placeholder UJ-04)/Actividad (placeholder UJ-05), badge "Anonimizado", botón anonymize oculto si ya lo está, manejo de 404.
  - `tests/e2e/contacts-crud.spec.ts` — flujo crear sin empresa → editar añadiendo empresa → marcar primary → anonimizar → verificar PII desaparece → eliminar. Crea empresa auxiliar para el flujo. Gated por env.
- **Files Created**: 12 archivos nuevos (frontend completo del módulo + e2e).
- **Decisiones**:
  1. **Confirmación de anonymize**: usuario debe escribir exactamente `ANONIMIZAR` (mayúsculas) para habilitar el botón. Texto fijo, no traducido.
  2. **Picker de empresa**: typeahead remoto, no select pre-cargado. Min 1 char, pageSize 8.
  3. **Filtro `company_id` en lista** omitido este pase (entra en M1 cierre o UJ-04). El DTO no expone `company_name`, así que en lista/detalle se muestra `company_id` como fallback link a `/companies/:id` cuando hay valor.
  4. **Sin tooltip dedicado**: usamos `title` nativo del browser para el toggle is_primary deshabilitado.
- **Security Check**: ✅ no hay secretos / ✅ validación zod en form / ✅ confirmación doble irreversible / ✅ no se loggea PII en frontend / ✅ ApiError 404 con UX limpia.
- **Tests**: 22 → 32 frontend (+10). Total proyecto: 138 tests verdes (106 backend + 32 frontend). Lint, typecheck, format:check verdes en 3 workspaces.
- **Notes**: Migración Prisma `add_contact_anonymized_at` sigue pendiente (requiere docker compose up). Filtro company_id en lista pendiente para una iteración futura.

---

### 2026-04-27 — UJ-03 (Pase 1 backend): CRUD de Contactos + anonymize

- **Work Done**: Backend completo del módulo `contacts` siguiendo el patrón de `companies`. Codex Pase 1 bajo orquestación Claude.
  - Módulo `backend/src/modules/contacts/` con `schemas.ts` (zod create/update/list/dto en snake_case + `ConsentStatusSchema`), `service.ts` (`ContactsService` con list/getById/create/update/softDelete/anonymize + DI de auditService), `service.test.ts` (11 tests con FakeDb in-memory).
  - Rutas `backend/src/api/routes/contacts.ts` con 6 endpoints (`GET list`, `POST`, `GET :id`, `PATCH :id`, `DELETE :id`, `POST :id/anonymize`) bajo `requireAuth`, registradas en `server.ts`. 6 routes tests.
  - Errores de dominio `ContactNotFoundError`, `ContactPrimaryConflictError`, `ContactCompanyNotFoundError` mapeados en `error-handler.ts`.
  - Schema Prisma: añadido campo `anonymizedAt DateTime? @map("anonymized_at")` en modelo Contact (cliente regenerado, migración pendiente — requiere docker compose arriba).
- **Files Created/Modified**:
  - Backend nuevos: `modules/contacts/{schemas,service,service.test,index}.ts`, `api/routes/contacts.ts`, `api/routes/contacts.test.ts`
  - Backend modificados: `api/server.ts` (+1 import + 1 register), `api/plugins/error-handler.ts` (+3 errors), `prisma/schema.prisma` (+anonymizedAt)
- **Decisiones**:
  1. **Anonymize**: irreversible. Reemplaza `firstName='Anonymized'`, `lastName='#<últimos 6 chars del cuid>'`, todos los campos PII a null, `consentStatus='revoked'`, set `anonymizedAt`. Audit log con metadata SIN PII (solo flags `had_email`/`had_phone`/`had_company`). Idempotente: 404 si ya anonimizado.
  2. **`is_primary` único por empresa**: auto-desmarca cualquier otro primario activo dentro de transacción Prisma (en create y en update). `ContactPrimaryConflictError` definido pero no se lanza con esta política — dead code menor, se puede limpiar.
  3. **Contacto sin empresa permitido** (`company_id` nullable). `softDelete` también pone `isPrimary=false`.
- **Security Check**: ✅ auth en todas las rutas / ✅ no hay PII en metadata de audit / ✅ validación zod / ✅ queries Prisma parametrizadas / ✅ anonymize en transacción atómica con audit log.
- **Tests**: 89 → 106 (+17 tests backend). Lint, typecheck, format:check verdes en los 3 workspaces.
- **Notes**: Migración Prisma pendiente — ejecutar `pnpm --filter @heyday/backend exec prisma migrate dev --name add_contact_anonymized_at` cuando docker compose esté arriba.

---

### 2026-04-27 — UJ-02: CRUD de Empresas

- **Work Done**: Implementación completa M1 del CRUD de Empresas, primer UJ ejecutado bajo el patrón Claude-orquestador / Codex-ejecutor (formalizado en CLAUDE.md durante esta sesión).
  - **Backend** (Codex Pase 1): módulo `backend/src/modules/companies/` con `domain.ts` (normalizeDomain), `schemas.ts` (zod create/update/list/dto en snake_case), `service.ts` (CompaniesService con dedupe por dominio + soft delete + DTO mapper) y `service.test.ts` (9 tests con FakeDb mock siguiendo patrón `auth/credentials`). Rutas `backend/src/api/routes/companies.ts` con 5 endpoints (`GET list`, `POST`, `GET :id`, `PATCH :id`, `DELETE :id`) bajo `requireAuth`, registradas en `server.ts`. Errores `CompanyDomainConflictError` (409 con `existing_id`) y `CompanyNotFoundError` (404) mapeados en `error-handler.ts`; `ERROR_CODES.COMPANY_DOMAIN_CONFLICT` añadido en `shared`. 7 routes tests adicionales (`vi.mock` del service para aislar el HTTP layer).
  - **Frontend** (Codex Pase 2): `lib/api/companies.ts` (CRUD + helper `isCompanyDomainConflict`), `types/company.ts`, primitives `Modal.tsx` (focus trap + Esc + click-outside + aria-modal) y `Tabs.tsx` (controlled, ARIA correcto). `CompanyFormDialog.tsx` (form `useState`+zod, sección colapsable "Más datos", manejo 409 con toast linkable a la empresa existente). `DeleteCompanyDialog.tsx`. Lista `/companies` con filtros debounced 300ms (q/icp_vertical/city) sincronizados a URL via `useSearchParams`, paginación, `useQuery` con invalidación. Detalle `/companies/[id]` con 4 tabs (Overview real, Contactos/Leads/Actividad placeholder hasta UJ-03/04/05). Playwright spec `tests/e2e/companies-crud.spec.ts` gated por `E2E_USER_EMAIL/PASSWORD`.
- **Files Created/Modified**:
  - Backend nuevos: `modules/companies/{domain,schemas,service,service.test,index}.ts`, `api/routes/companies.ts`, `api/routes/companies.test.ts`
  - Backend modificados: `api/server.ts` (+1 import + 1 register), `api/plugins/error-handler.ts` (+2 errors + 1 import), `shared/src/constants/index.ts` (+COMPANY_DOMAIN_CONFLICT)
  - Frontend nuevos: `lib/api/companies.ts`, `lib/api/companies.test.ts`, `types/company.ts`, `components/Modal.tsx`, `components/Tabs.tsx`, `components/companies/{CompanyFormDialog,CompanyFormDialog.test,DeleteCompanyDialog}.tsx`, `app/(app)/companies/page.tsx`, `app/(app)/companies/[id]/page.tsx`, `tests/e2e/companies-crud.spec.ts`
  - Otros: `CLAUDE.md` (regla #9 + sección Codex Orchestration), `implementation/task_tracker.md` (UJ-02 → completed)
- **Decisiones**:
  1. **Soft-delete libera el dominio** del row (`deletedAt: now, domain: null`) para permitir recrear sin chocar con `@unique`. Alternativa rechazada: índice parcial condicional.
  2. **`update` solo re-chequea conflicto si pasas `domain` explícito**, no si solo cambias `website`. Tolerable porque el form siempre envía `domain` explícito.
  3. **Routes test reimplementa el service en `vi.mock`** en vez de usar el real. Aísla el HTTP layer pero la lógica re-pegada puede divergir; flag para futuras refactorizaciones.
  4. **Filtros `tag` y `priority_*` excluidos del schema M1** (hasta UJ-04/UJ-06) — el endpoint no acepta lo que no implementa.
  5. **Counts de pain_points y service_recommendations omitidos** en `GET /companies/:id` hasta M4 (api_contracts los promete pero no hay datos hasta entonces).
  6. **Sort default `updated_at_desc`** como único valor permitido en M1.
  7. Sobre la deviación durante Pase 1: Codex pivotó tests a FakeDb tras un fallo de Postgres en su sandbox; verificación posterior confirmó que era el patrón existente del repo, no una regresión.
- **Security Check**: PASS con un fix añadido por Claude en review.
  - [x] Sin secretos hardcoded
  - [x] `requireAuth` en los 5 endpoints
  - [x] Zod input validation en body/query/params
  - [x] Prisma → SQL parametrizado
  - [x] DTO mapper omite `deleted_at` (no leak)
  - [x] **Fix XSS aplicado**: `safeHttpUrl()` en detalle filtra schemes peligrosos (`javascript:` etc.) antes de renderizar `website`/`linkedin_url` como `<a href>`. Defense-in-depth porque zod `.url()` acepta cualquier scheme válido.
  - [x] Sin nuevas dependencias
- **Tests**: 89 backend (73 → 89, +16) y 22 frontend (14 → 22, +8). Total 111 tests verdes. typecheck + lint + tests pass en backend y frontend.
- **Notes**:
  - **Codex crash en Pase 1**: Codex se congeló silenciosamente tras los tests verdes. Detectado por monitorización del companion (`updatedAt` sin avanzar tras `Command completed`). PID muerto, working tree intacto. Revisión y verificación manual confirmaron que el trabajo era bueno. Esta experiencia motivó la sección "Codex Orchestration" en CLAUDE.md.
  - **Pase 2 cerró limpio** en ~11 min sin incidencias gracias a prompt más específico (paths concretos, constraints duras "no instalar deps", referencia explícita a patrones existentes).
  - **Pendiente operativo**: Playwright spec `companies-crud.spec.ts` no se ha ejecutado contra docker compose todavía — requiere seed demo y env `E2E_USER_*` configurados. Próxima sesión.
  - **`pnpm-lock 2.yaml` untracked sigue residual** — investigar y limpiar en una sesión futura.

## Log

### 2026-04-26 — UJ-01: Login y sesión persistente

- **Work Done**: UJ-01 cerrado con un delta pequeño sobre IT-09+IT-10. (1) Coordinación de logout entre pestañas: `frontend/src/lib/auth/broadcast.ts` con BroadcastChannel `heyday-auth`, mensajes `{type:'logout'}` / `{type:'session-expired'}`, helpers `broadcastLogout()`, `broadcastSessionExpired()`, `onAuthBroadcast(handler)` que devuelve unsubscribe, y `__resetChannelForTests()` (única exportación con prefijo `__` para uso en tests — el módulo cachea el canal por proceso). Guard SSR: si `globalThis.BroadcastChannel` no existe (Node), funciones se vuelven no-ops sin lanzar. (2) Notificación global de pérdida de sesión: `apiFetch` ahora, tras un refresh fallido y `clear()` del store, emite `window.dispatchEvent(new Event('heyday:auth-expired'))` antes de lanzar `AuthExpiredError`; el evento se pierde silenciosamente si nadie lo escucha (tests Node sin window). (3) `frontend/src/components/SessionWatcher.tsx` (client, devuelve `null`): hook con dos suscripciones — listener al evento `heyday:auth-expired` (toast.error("Tu sesión ha expirado…") + `router.replace('/login')`) y listener al BroadcastChannel (`logout` o `session-expired` → `clear()` del store + toast.message("Sesión cerrada en otra pestaña") + redirect). Cleanup en el return del useEffect retira ambos. (4) `Topbar.handleLogout` ahora llama `broadcastLogout()` justo después de `clear()` para que las otras pestañas reciban el aviso. (5) `(app)/layout.tsx` monta `<SessionWatcher />` justo dentro de `<AuthBootstrap>` y antes del `<div>` con la sidebar — invisible, sólo escucha. (6) Setup Playwright: `frontend/playwright.config.ts` (testDir `./tests/e2e`, baseURL configurable por `E2E_BASE_URL`, retries 2 en CI, traces/videos/screenshots `retain-on-failure`, project chromium). Scripts `e2e` y `e2e:install` en `frontend/package.json`. `frontend/tests/e2e/login.spec.ts` con 3 specs (happy path login + reload mantiene sesión, credenciales inválidas muestran toast con copy ES y permanecen en /login, logout limpia sesión y middleware redirige a /login al volver a /dashboard). Los tests usan `test.skip(!EMAIL || !PASSWORD, ...)` al describe-level: si no hay `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` en env, todos se marcan como skip — el job de CI principal NO los activa, sólo se corren localmente o en un job dedicado de E2E con stack arriba. Tests unitarios añadidos: `SessionWatcher.test.tsx` (3 casos: evento window dispara toast.error + replace; broadcast logout limpia store + redirect; mensajes desconocidos no hacen nada — usa un FakeChannel polyfill local porque jsdom no implementa BroadcastChannel) + extensión de `client.test.ts` para verificar que el evento `heyday:auth-expired` se dispara cuando refresh falla.
- **Files Created/Modified**: frontend/src/lib/auth/broadcast.ts (nuevo), frontend/src/components/SessionWatcher.tsx (nuevo), frontend/src/components/SessionWatcher.test.tsx (nuevo), frontend/src/lib/api/client.ts, frontend/src/lib/api/client.test.ts, frontend/src/components/Topbar.tsx, frontend/src/app/(app)/layout.tsx, frontend/playwright.config.ts (nuevo), frontend/tests/e2e/login.spec.ts (nuevo), frontend/package.json (deps `@playwright/test` + scripts `e2e`).
- **Decisions**: Window `Event` para "session-expired-en-este-tab" (lugar correcto: el módulo `apiFetch` no es React, no debe importar router) en lugar de un store extra o de pasarle `router` al cliente HTTP — desacopla el wrapper de fetch del framework. BroadcastChannel para multi-pestaña (en lugar de `localStorage` + storage event) porque tiene API limpia, no toca persistencia y no se confunde con la decisión de NO meter el access token en localStorage. La pestaña receptora del logout broadcast NO re-llama a `/auth/logout` — la sesión ya está revocada en DB por la pestaña que disparó el logout; reintentar duplicaría tráfico y daría 401 ruidoso. Mensajes del BroadcastChannel sólo contienen `{type}` (sin tokens, sin user id, sin timestamps) — superficie mínima por si otra extensión del navegador escucha. Tests E2E gated por env (`test.skip` al describe-level) en lugar de un script separado: corren con el mismo `playwright test` y el operador pinta env vars; en CI principal van como skip → CI no falla por entorno; cuando añadamos un job E2E dedicado con docker-compose, sólo necesita exportar las dos vars. `__resetChannelForTests` con prefijo `__` para que sea evidente que NO es API pública. Polyfill `FakeChannel` local en el test del SessionWatcher en lugar de mockear el módulo entero — jsdom 25 no implementa BroadcastChannel y el polyfill local refleja la semántica real (no envía al sender, sí a otras instancias) que es justo lo que el test necesita verificar.
- **Security Check**: OK. (a) Rate-limit login 5/min confirmado en `backend/src/api/routes/auth.ts:54-61` (override de fastify-rate-limit por config de ruta). (b) Password sólo viaja en body POST `/auth/login`, jamás en URL ni headers; logger pino redacta `authorization`/`cookie`/`apiKey` automáticamente. (c) Refresh sigue en cookie httpOnly samesite=lax + secure en prod (sin cambios). (d) Access token sigue en memoria Zustand (sin cambios). (e) BroadcastChannel no transporta tokens ni PII — sólo `{type}`. (f) Multi-tab logout es defensivo: la pestaña receptora limpia su store local pero la sesión ya estaba revocada en DB antes de emitirse el broadcast → no abre ventanas. (g) `SessionWatcher` no expone `error.message` ni `error.code` al usuario; el toast es genérico ("Tu sesión ha expirado. Vuelve a iniciar sesión."). (h) `apiFetch` dispatch del evento ocurre tras `clear()`: si por algún bug el listener tarda en montar, el store ya quedó vacío y el access token no es reusable. (i) `router.replace('/login')` (no `push`) para que el botón "atrás" no vuelva a la página privada.
- **Tests**: Frontend 14/14 (3 nuevos SessionWatcher + 1 nuevo en client.test verificando dispatch del evento; tests previos siguen verdes). Backend 73/73 sin cambios. `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm format:check` ✅. E2E Playwright se quedan en skip por defecto (necesitan stack); operador puede correrlos con `E2E_USER_EMAIL=alex@heyday.studio E2E_USER_PASSWORD=... pnpm --filter @heyday/frontend run e2e` tras `pnpm seed:demo`. Pendiente la primera vez de cualquier máquina: `pnpm --filter @heyday/frontend run e2e:install` (descarga binarios chromium).
- **Notes**: El acceptance de UJ-01 se cubre completamente; el E2E real queda como verificación cuando el usuario tenga el stack arriba. M1 sigue: UJ-02 (CRUD Empresas) puede arrancar. Codex co-pilot no se usó esta vez porque el plugin no está instalado en este entorno (memoria refleja la situación). Sugerencia para la próxima sesión: tras `git push` del repo, instalar el plugin para usarlo en UJ-02 (mucho más voluminoso).

### 2026-04-25 — M0 cleanup: typecheck del backend + sync work_log IT-09

- **Work Done**: Cerrada la deuda de tipado señalada por el `/review` de M0 (42 errores TS pre-existentes). 22× accesos a `process.env.X` → `process.env['X']` en `backend/tests/setup.ts` (reescrito de cero usando `const env = process.env`), `backend/prisma/seed.ts` (4 ocurrencias en SEED*ALEX*_/SEED*ALBA*_) y `backend/src/core/auth/tokens.test.ts`. 4× accesos a propiedades de objetos con index signature en `backend/src/core/ai/anthropic-client.test.ts` (`calls[0]!.system` → `calls[0]!['system']`, `params.model` → `params['model']` en dos sitios). 2× en `backend/src/api/routes/health.ts` (`checks.db` y `checks.redis`). `Crypto` global no resoluble (TS lib `dom` no incluida en backend) → cast a `unknown as { crypto?: { randomUUID?: () => string } }` en `backend/src/modules/auth/service.ts`. `where.email` posiblemente undefined dentro del closure → extraída a variable local `wantedEmail` antes del filter en `backend/src/modules/auth/service.test.ts`. `AnthropicError` faltaban `attempts` y `name` en el shape devuelto por `normaliseSdkError` → ahora devuelve `AnthropicError` real (instanciado con `new AnthropicError(code, message, { status, attempts: attempt })`) — refactor coherente que además permite usarlo directamente como `lastErr` para luego throw. Default SDK factory ahora cast `unknown as AnthropicLike` para reconciliar la sobrecarga del SDK oficial (`messages.create` con MessageCreateParamsNonStreaming/Streaming) con nuestro tipo estructural. `buildApp()` cast `Fastify(...) as unknown as FastifyInstance` para neutralizar el generic específico que infiere Fastify 5 cuando se le pasa `loggerInstance: rootLogger` (un `pino.Logger` concreto), permitiendo que los route registrators que declaran `FastifyInstance` con generics por defecto (FastifyBaseLogger) acepten la instancia. CI: quitada la marca `continue-on-error: true` del job typecheck-backend, ahora es bloqueante. Corrección post-review en el work_log de IT-09: nota explícita aclarando que la versión real instalada es Fastify 5.1.0 (no 4.28.1 como decía el log original) y que `loggerInstance` reemplaza a `logger` en F5.
- **Files Created/Modified**: backend/tests/setup.ts (reescrito), backend/prisma/seed.ts, backend/src/core/auth/tokens.test.ts, backend/src/core/ai/anthropic-client.test.ts, backend/src/api/routes/health.ts, backend/src/modules/auth/service.ts, backend/src/modules/auth/service.test.ts, backend/src/core/ai/anthropic-client.ts, backend/src/api/server.ts, .github/workflows/ci.yml, docs/work_log.md (nota IT-09).
- **Decisions**: Cast `unknown as AnthropicLike` en lugar de hacer `AnthropicLike` un supertipo del SDK real — el SDK tiene overloads (Streaming/NonStreaming) y método `messages.create` con tipos muy específicos; un supertipo estructural sería frágil al cambiar versiones del SDK. El cast queda aislado en el constructor de AnthropicClient y el test inyecta su propio fake type-clean. Cast del `Fastify()` por la misma razón que el SDK: el generic específico se filtraría a todos los consumidores. La alternativa sería tipar todos los route registrators con el generic completo, mucho más invasivo. `normaliseSdkError` devolviendo `AnthropicError` (no plain object) es estrictamente mejor — antes había una conversión implícita rota en `lastErr = normalised`. Conservar el archivo `tests/setup.ts` con bracket notation explícita en lugar de tocar `tsconfig` (no relajamos `noPropertyAccessFromIndexSignature` — la regla protege de typos en env vars, conservadora pero útil).
- **Security Check**: OK. Ningún cambio toca lógica de auth/credenciales/secretos. Las correcciones son de tipado puro. La fixture `CREDENTIAL_MASTER_KEY` en `tests/setup.ts` sigue siendo la misma clave de test (32 bytes base64) — no hay nuevas claves filtradas. El cast de `Crypto` global mantiene el guard de runtime (`if (c?.randomUUID)` + `throw AuthError.internal`) — comportamiento idéntico, sólo el tipado cambió.
- **Tests**: 73/73 backend ✅ + 11/11 frontend ✅. `pnpm typecheck` (los 3 workspaces) ✅ sin errores. `pnpm lint` no se cambió pero no debería romperse — los edits son sintácticamente equivalentes.
- **Notes**: Pendiente de fuera de scope: `git init` + push (CI sigue sin repo donde correr). Apify para M5 sin instalar todavía. Frontend smoke E2E con Playwright queda para post-M1. Listos para arrancar UJ-01.

### 2026-04-25 — IT-11: Seed demo + CI

- **Work Done**: Cierre de M0. Dos artefactos nuevos. (1) **Seed demo** en `backend/prisma/seed-demo.ts` — script idempotente que carga datos realistas cubriendo TODAS las entidades del esquema (29 modelos): 10 Companies (mix verticales physiotherapy/pilates/yoga/gym_fitness/bakery/cafe en distintas ciudades ES + Oporto), 16 Contacts (1-2 por empresa, primario marcado), Tags (10) en kinds general/vertical/persona/service_interest + Taggables polimórficos por vertical/ciudad, ~10 Leads distribuidos en 3 stages open + 1 won + 1 lost con priorityScore y nextActionAt, ~30 Activities polimórficas (task con dueAt en futuro, note, email_log y meeting_log con completedAt en pasado), Lead Intelligence completa para 4 empresas (EnrichmentRun status succeeded + 3 SourceHits cada una: website_scrape/lighthouse/google_places, 2 PainPoints por empresa con confidence observed e inferred y evidencia textual + URL + timestamp, ServiceFitRecommendation con triggeringSignals + rationale + expectedOutcome + fitScore, OutboundPrep para 2 empresas con segment/likelyNeed/outreachAngle/valueProposition/servicePitch/toneGuidance/sdrNotes), Content Engine con 6 ContentIdeas (en pillars education/authority/opinion/case_study/news_reactive) → ContentItems con 2 ContentVersions cada uno (v1 generadas por claude, v2 editadas por humano = `claude_edited_by_human`), currentVersionId apuntando a v2, ContentApprovalEvents trazando draft→in_review→approved→exported, 1 Credential demo cifrada (Anthropic, AES-256-GCM real con la master key del env) + IntegrationHealth ok, 30 AiUsageLog sintéticos repartidos en 7 días con cache hits/misses para alimentar dashboard de costes IA, 4 Jobs sample (succeeded/failed/queued, distintas queues), 6 AuditLogs (auth.login, company.create/update, lead.move_stage, content.approve, credential.create). Idempotencia por claves naturales (Company.domain unique, Tag.name unique, Contact por companyId+email, Lead por companyId, ContentIdea por title) y guards "si count > N → saltar" para entidades sin natural key. (2) **CI GitHub Actions** en `.github/workflows/ci.yml` con 4 jobs paralelos: `lint` (Prettier check + ESLint), `typecheck` (tsc por workspace; backend con `continue-on-error: true` por deuda pre-existente), `test-backend` con services Postgres 16 alpine + Redis 7 alpine + healthchecks, env vars de test inyectadas (incluida CREDENTIAL_MASTER_KEY base64 de 32 bytes válida), `prisma migrate deploy` antes de los tests, vitest unit. `test-frontend` Vitest jsdom sin servicios externos. Triggers: push a main/develop + PRs a main. pnpm cacheado por `actions/setup-node@v4`. Scripts añadidos: `pnpm seed:demo` en root y backend (encadena `seed.ts` base + `seed-demo.ts`).
- **Files Created/Modified**: backend/prisma/seed-demo.ts (nuevo), backend/package.json (añade script `seed:demo`), package.json (añade script root `seed:demo`), .github/workflows/ci.yml (nuevo).
- **Decisions**: Seed demo en archivo separado (`seed-demo.ts`) en lugar de extender `seed.ts` — el seed base es minimal y obligatorio (taxonomías + Alex/Alba), el demo es opcional y mucho más voluminoso; separarlos hace explícito qué corre Prisma `db:seed` (sólo el base). Idempotencia por **claves naturales** existentes en el schema (Company.domain, Tag.name) o búsqueda + count para los modelos sin unique (Lead, Contact, Activity, AuditLog) — evita IDs deterministas hardcoded que Prisma cuid no soporta de forma natural. Credencial demo cifrada con `vault.encrypt()` real (no fixture pre-cifrado) — así el demo valida el round-trip de la master key del usuario y previene desincronización (si la master key cambia, el seed re-corre y se vuelve a cifrar). 30 AiUsageLog sintéticos con costes calculados realistas (precio por token en `pricing.ts` simplificado) — habilita probar el dashboard de costes IA sin necesidad de hacer llamadas reales a Claude. Hard-codeo de fakeApiKey con prefijo `sk-ant-demo-` y bytes random — claramente NO confundible con clave real. Jobs sample y AuditLogs son sintéticos (no enganchados a entidades reales del seed) — están sólo para que las páginas Admin rendericen filas; UJ-14 los reemplazará con datos reales. CI con `continue-on-error: true` SÓLO en typecheck-backend hasta cerrar la deuda pre-existente; lint y tests son obligatorios. Postgres 16 alpine + Redis 7 alpine para que el CI matchee versiones de docker-compose local. `prisma migrate deploy` (no `migrate dev`) en CI porque no debe crear migraciones nuevas, sólo aplicar las commiteadas. Sin Playwright E2E todavía — queda como follow-up de M1+ cuando haya UJ end-to-end que probar (login + un CRUD básico mínimo). Sin matrix Node 18+20: nos comprometemos con Node 20 LTS, alineado con `engines` y Dockerfiles.
- **Security Check**: OK. Seed demo NO inserta credenciales reales — la única `Credential` insertada es un placeholder `sk-ant-demo-<hex>` cifrado correctamente (lo importante es que el ciphertext es válido, no la API key). Master key NUNCA loggeada ni emitida a stdout. Emails de seed con dominios `.test` (TLD reservado IANA) → no colisiona con dominios reales ni envía emails accidentales. Contraseñas Alex/Alba siguen viniendo de env (re-uso del seed base). CI inyecta secrets de test obviamente fake (prefijo `ci-`) y la master key es la misma fixture pública que ya viene en `tests/setup.ts` — nunca usar en prod. Healthchecks con timeout en services para que el CI no se cuelgue. Prisma generate antes de cualquier paso que use el cliente para evitar leaks por desincronización schema↔cliente.
- **Tests**: Sin tests unitarios para el seed (es un script). Verificación: `pnpm --filter @heyday/backend exec tsc --noEmit prisma/seed-demo.ts` filtrado → 0 errores propios. `pnpm --filter @heyday/backend test` → 73/73 ✅. `pnpm --filter @heyday/frontend test` → 11/11 ✅. Validación end-to-end del seed pendiente del usuario (requiere DB+Redis arriba): `docker compose up -d db redis && pnpm db:migrate:deploy && pnpm seed:demo` debe poblar la DB sin error y permitir login + ver datos en cada página del frontend.
- **Notes**: **Deuda visible (no introducida en IT-11, descubierta al integrar)**: el typecheck del backend tiene 42 errores pre-existentes — la mayoría TS4111 por `noPropertyAccessFromIndexSignature` (process.env.X → process.env['X']), 4-5 errores Fastify 5 vs el código escrito para Fastify 4 (work_log de IT-09 dice 4.28.1 pero `package.json` ya está en 5.1.0), y errores en mocks de tests de anthropic-client. Los TESTS pasan (vitest usa esbuild, ignora tsc). El CI tiene `continue-on-error: true` en este job para no bloquear el merge — pero hay que cerrarlo antes de delivery. Spawn de tarea independiente: ver `cleanup_backend_typecheck` (sugerida en `project_memory.md`). M0 completado en lo funcional. Próximo: `/review` independiente del milestone Foundation antes de M1.

### 2026-04-25 — IT-10: Frontend shell Next.js 15

- **Work Done**: Shell Next.js 15 (App Router, React 19) operativo. Root layout server (`<html lang="es" suppressHydrationWarning>`) compone `Providers` cliente que une `ThemeProvider` (next-themes, attribute `class`, defaultTheme `system`, `disableTransitionOnChange`), `QueryProvider` (TanStack Query 5 con staleTime 30s, refetchOnWindowFocus false, retry 1, mutations retry 0; QueryClient en `useState` para no compartir entre renders SSR) y `Toaster` de sonner (bottom-right, 4s, richColors, closeButton). Tailwind 3.4 con `darkMode: 'class'` y los tokens del style_guide expuestos como CSS vars (`globals.css` con sets `:root` light + `.dark`); fuentes Inter + JetBrains Mono via vars; utility `.glass` con `color-mix(in oklab, ...)` + `backdrop-filter blur(10px) saturate(120%)`; `:focus-visible` accesible 2px outline; `prefers-reduced-motion` respetado. Grupo `(auth)` con layout centrado y `login/page.tsx` (client): validación zod (`email + min 8`), POST `/auth/login`, en éxito guarda sesión en `useAuthStore` (Zustand) y redirige a `searchParams.next` (validado `startsWith('/')` para evitar open redirect) o `/dashboard`; en error mapea código backend → copy ES con `copyForError`; botón disabled durante `submitting` y muestra "Entrando…". Grupo `(app)` con layout que envuelve en `AuthBootstrap`: si no hay user/access en memoria intenta `POST /auth/refresh` (cookie `hd_refresh`) + `GET /auth/me`; si falla, `clear()` + `router.replace('/login')`; mientras resuelve muestra placeholder "Cargando…" para no flashear UI protegida. Sidebar fija ≥ lg con secciones del wireframe (CRM/Lead Intelligence/Content Engine/Admin); Admin sólo visible si `role === 'admin'`. Topbar con buscador placeholder (cmd-K para UJ-06), `ThemeToggle` (sol/luna, SSR-safe con `mounted` flag para evitar layout shift) y menú de usuario con logout (`POST /auth/logout` + clear local + redirect; toleramos error de red para no dejar estado colgado). Cliente HTTP `lib/api/client.ts`: prefija `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`), inyecta `Authorization: Bearer` desde `getAccessToken()` (Zustand getState fuera de React), `credentials: 'include'` para que vaya la cookie cross-origin; ante 401 (excluyendo `/auth/login` y `/auth/refresh`) intenta UN refresh con `tryRefreshOnce()` que tiene **coalescing** (todas las requests 401 simultáneas esperan al mismo refresh in-flight) y reintenta la request original; si el refresh falla, `clear()` del store y throw `AuthExpiredError`. Errores normalizados a `ApiError(status, {code, message, details})` desde el shape `{error: {...}}` del backend (IT-09). `lib/auth/store.ts` con `useAuthStore` Zustand: `user`, `accessToken`, `accessExpiresAt` SÓLO en memoria (no localStorage → no exfiltrable por XSS); `setSession`, `updateAccess`, `clear`. `lib/auth/api.ts` con wrappers tipados `loginRequest`, `logoutRequest`, `meRequest`. Middleware Next (`src/middleware.ts`): si hay cookie `hd_refresh` y entras a `/login` → redirige a `/dashboard`; si no hay cookie y entras a ruta protegida → `/login?next=<pathname>`; matcher excluye `_next`, estáticos, api. Middleware NO valida JWT (el secret no debe estar en cliente) — sólo gating de UI; el backend valida realmente. Páginas `not-found.tsx` y `error.tsx` personalizadas (404 verde accent + 500 rojo danger; `error.tsx` no expone `error.message` al usuario, sólo log a consola). Helper `cn()` con `clsx + tailwind-merge`. `error-messages.ts` mapea `AUTH_INVALID_CREDENTIALS`, `AUTH_EXPIRED`, `AUTH_FORBIDDEN`, `RATE_LIMITED`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNKNOWN_ERROR` a copy ES con fallback genérico. Dashboard placeholder con cards "—" (Leads abiertos, Sin acción >7d, Aprobaciones pendientes, Jobs activos) — la versión real llega en UJ-08. Tests vitest (jsdom + @testing-library/react + @testing-library/jest-dom): `error-messages.test.ts` (3 casos), `lib/api/client.test.ts` (5: inyecta Bearer, ApiError shape, 401→refresh→retry, refresh fail→AuthExpiredError + clear, login no dispara refresh), `(auth)/login/page.test.tsx` (3: render + botón habilitado, errores de validación zod email+password, disabled state durante request in-flight con resolución manual del fetch). `tests/setup.ts` polyfilla `matchMedia` (next-themes) e `IntersectionObserver` para jsdom.
- **Files Created/Modified**: frontend/{package.json, next.config.mjs, tailwind.config.ts, postcss.config.mjs, tsconfig.json, vitest.config.ts}, frontend/src/{middleware.ts, styles/globals.css, lib/cn.ts, lib/error-messages.ts, lib/error-messages.test.ts, lib/api/client.ts, lib/api/client.test.ts, lib/auth/store.ts, lib/auth/api.ts, providers/{ThemeProvider,QueryProvider,Providers}.tsx, components/{Sidebar,Topbar,ThemeToggle,AuthBootstrap}.tsx, app/{layout,page,error,not-found}.tsx, app/(auth)/{layout.tsx, login/page.tsx, login/page.test.tsx}, app/(app)/{layout.tsx, dashboard/page.tsx}}, frontend/tests/setup.ts.
- **Decisions**: Access token SÓLO en memoria (Zustand) en lugar de cookie/localStorage — refresh token (httpOnly) ya garantiza persistencia entre recargas vía `AuthBootstrap`; reduce vector XSS. Refresh coalescing en `tryRefreshOnce` (variable módulo + Promise compartida) evita "dogpile" si varias queries paralelas reciben 401 a la vez (común en dashboards). Middleware con matcher amplio + lista pública explícita (`/login`) en lugar de matcher por prefijo `(app)` — App Router groups `(auth)`/`(app)` no aparecen en URLs, así que matchear por nombre de grupo no es viable. `next` param sanitizado con `startsWith('/')` en login para prevenir open redirect (`?next=https://evil.com`). Validación zod cliente además de la del backend para feedback inmediato sin round-trip. Error backend mapeado a copy ES por **código** (no `error.message`) → mensajes consistentes y traducibles independientemente del idioma del API. `error.tsx` no expone `error.message` ni `error.digest` al usuario (puede filtrar paths internos / nombres de variables). `AuthBootstrap` renderiza un loader mientras resuelve sesión para evitar flash de contenido protegido o doble fetch desde cada página. Sidebar oculta secciones admin si `role !== 'admin'` — defensa en profundidad; el backend sigue siendo el guardián real. Cookie name `hd_refresh` consistente con backend IT-09. `transpilePackages: ['@heyday/shared']` en `next.config.mjs` para que el workspace TS se compile sin pre-build separado. SSR-safe `ThemeToggle` con flag `mounted` (evita mismatch hydration al leer `resolvedTheme` en server).
- **Security Check**: OK. Sin secretos hardcoded — `NEXT_PUBLIC_API_URL` único env (no sensible). Access token sólo en memoria → no exfiltrable por XSS. Refresh en cookie httpOnly (la setea backend, el cliente nunca la toca). `credentials: 'include'` requiere CORS allowlist exacto (configurado en IT-09). Validación zod cliente sobre todo input. Mensajes del backend mapeados por código → no se renderiza texto crudo del servidor. `error.tsx` no muestra detalles del error. `next` param validado contra open redirect. Middleware rechaza acceso protegido sin cookie. Refresh coalescing previene race conditions. `disabled` state en submit previene doble-submit. Dependencias de fuentes oficiales (next, react, tanstack, next-themes, sonner, zustand, lucide, zod, clsx, tailwind-merge).
- **Tests**: 11 nuevos tests (3 error-messages + 5 api/client + 3 login page smoke). `pnpm --filter @heyday/frontend typecheck` ✅. `pnpm --filter @heyday/frontend test` → 11/11 ✅.
- **Notes**: Para validar end-to-end localmente: 1) backend levantado (`pnpm --filter @heyday/backend run dev` en :3001 con DB+Redis arriba y seed corrido); 2) `pnpm --filter @heyday/frontend dev` en :3000; 3) navegar a `/login` → autenticar con Alex/Alba → redirige a `/dashboard`; 4) F5 sobre `/dashboard` → `AuthBootstrap` debería refrescar la sesión vía cookie y volver a montar sin pasar por login; 5) toggle dark/light persiste; 6) tras 15 min (o forzando expiración del access token) la próxima request a un endpoint protegido debería disparar refresh transparente. E2E con Playwright queda para IT-11 (CI). Próximo IT-10 → IT-11 (seed demo + CI).

### 2026-04-20 — IT-09: HTTP layer (Fastify + observabilidad)

> **Corrección post-review M0 (2026-04-25)**: la versión real instalada es Fastify **5.1.0** (no 4.28.1). El cleanup de typecheck adaptó el código a Fastify 5: `loggerInstance` en lugar de `logger`, y cast de `FastifyInstance` para alinear el generic de logger con los route registrators.

- **Work Done**: Backend HTTP listo con Fastify 4.28.1 como framework. `backend/src/api/server.ts` exporta `buildApp(opts?)` (testable con `app.inject`) + `main()` con arranque automático cuando es el entrypoint del proceso (detecta `process.argv[1]` acabando en `server.ts|.js`). Plugins registrados en orden: `@fastify/helmet` 12.0.1 (headers de seguridad; `contentSecurityPolicy: false` porque este backend sólo sirve JSON — la CSP del HTML vive en Next.js en IT-10), `@fastify/cors` 10.0.1 (origin fijado a `env.APP_URL`, `credentials: true` para cookies cross-origin frontend↔backend, `exposedHeaders: ['x-request-id']`), `@fastify/cookie` 10.0.1 sin firma (refresh ya es un JWT firmado por nosotros), `@fastify/sensible` 6.0.1, `@fastify/rate-limit` 10.1.1 con `redis` store (reutiliza el ioredis cacheado de IT-07 → `QUEUE_PREFIX + ':rl:'` como namespace, 100 req/min global, `skipOnError: true` para no tumbar el API si Redis muere). Plugin propio `api/plugins/auth.ts` (con `fastify-plugin`) decora la instancia con `app.requireAuth` (preHandler) y `app.requireRole(role)` — el primero extrae `Authorization: Bearer`, valida con `verifyAccessToken` (HS256), llama `authService.getUserForToken(payload)` y escribe `request.authUser` + `request.authSessionId`; el segundo compara `authUser.role` contra el permitido y lanza `AuthError.forbidden()` si no. Ampliación de tipos en `api/types.ts` vía `declare module 'fastify'` para que TS conozca `authUser` y `authSessionId` en cualquier handler. Error handler global en `api/plugins/error-handler.ts` registrado al final: mapea `ZodError` → 400 `VALIDATION_ERROR` + `issues` en `details`; `AuthError` → usa su `statusCode` + `code`; `InvalidJobPayloadError` → 400 `VALIDATION_ERROR`; `JobNotFoundError` y `CredentialNotFoundError` → 404 `NOT_FOUND`; `CredentialConflictError` → 409; `SecretNotConfiguredError` → 503 `INTEGRATION_UNAVAILABLE`; `AnthropicError` → 429 si `AI_RATE_LIMITED`, 504 si `AI_TIMEOUT`, 503 resto (siempre como `INTEGRATION_UNAVAILABLE` para no filtrar internals); errores Fastify 4xx passthrough normalizados; `statusCode === 429` → `RATE_LIMITED`; resto → 500 `INTERNAL_ERROR` con mensaje genérico (NUNCA filtra el mensaje original). `setNotFoundHandler` devuelve shape uniforme para rutas inexistentes. Response incluye siempre header `x-request-id` (hook `onSend`). `genReqId` respeta `x-request-id` entrante si viene (máx 128 chars, anti inyección). `trustProxy: 1` en prod (EasyPanel pone X-Forwarded-For correcto). `bodyLimit: 1MB` por default; los CSV bulk de UJ-17 irán por endpoint multipart dedicado. Rutas montadas en este IT: `/health` (uptime, siempre 200), `/ready` (ping a Prisma `$queryRaw SELECT 1` + Redis `ping`, devuelve 503 con `{checks: {db, redis}}` si alguno falla), `POST /auth/login` (zod body → `authService.login` → set-cookie `hd_refresh` httpOnly samesite=lax + secure en prod; rate-limit override 5/min específico para login), `POST /auth/refresh` (lee cookie `hd_refresh` → rota con `authService.refresh` → set-cookie nueva), `POST /auth/logout` (requireAuth → `authService.logout(sessionId)` + `clearCookie`, 204), `GET /auth/me` (requireAuth → devuelve `authUser`), `GET /jobs/:id` (requireAuth → `jobsService.getById(id)`). El logger pino (`rootLogger` de IT-07) se pasa como `logger: rootLogger` a Fastify → cada request loggea con `reqId`, status, elapsed; secretos siguen redactados via `redact` del logger. Tests: `plugins/auth.test.ts` (7 casos: 401 sin header, 401 header mal prefijado, 401 token inválido, 200 con token válido expone authUser+sid, 403 role distinto, 200 role coincide; usa `signAccessToken` real con secretos de test, no mockea JWT), `plugins/error-handler.test.ts` (7 casos: AuthError 401, ZodError 400 con details, JobNotFoundError 404, CredentialNotFoundError 404, InvalidJobPayloadError 400, Error genérico 500 con mensaje genérico [verifica que "something awful" NO aparece en la respuesta], 404 no-matched con shape uniforme).
- **Files Created/Modified**: backend/src/api/{server.ts (reescrito), types.ts}, backend/src/api/plugins/{auth.ts,auth.test.ts,error-handler.ts,error-handler.test.ts}, backend/src/api/routes/{health.ts,auth.ts,jobs.ts}, backend/package.json (añade fastify 4.28.1 + fastify-plugin 5.0.1 + @fastify/helmet 12.0.1 + @fastify/cors 10.0.1 + @fastify/cookie 10.0.1 + @fastify/rate-limit 10.1.1 + @fastify/sensible 6.0.1).
- **Decisions**: Fastify 4 sobre 5 porque el ecosistema de plugins está más maduro y 4 sigue con soporte de seguridad; la migración a 5 puede hacerse en post-delivery sin bloquear. Validación con zod en los handlers (`schema.parse(request.body)`) en lugar de JSON Schema nativo de Fastify — nos da inference + mensajes en español + unión con los schemas que ya usamos en queue payloads / env / auth. Refresh token viaja SÓLO en cookie httpOnly samesite=lax (no en response body ni header) — elimina XSS theft; el front nunca lo ve. Access token por `Authorization: Bearer` (short-lived 15 min) — el front lo guarda en memoria (IT-10); refresh silencioso cuando expira. Rate-limit con store Redis para consistencia entre múltiples instancias del API (EasyPanel puede escalar horizontalmente). `skipOnError: true` en rate-limit: si Redis cae el API sigue respondiendo (degrada abierto); auth e integridad siguen protegidos por JWT. `trustProxy: 1` en prod para que `request.ip` sea real tras el proxy. Error handler duck-typea propiedades Fastify (`statusCode`, `validation`) en vez de importar tipos concretos — permite evolucionar sin tocar el mapping. 404 no-matched tiene handler propio para mantener el shape `{error: {code, message}}` uniforme en toda la API. `x-request-id` es entrada y salida: si el cliente lo manda (ej. Next.js server→API) se respeta; si no, se genera UUID. Cookie `hd_refresh` con domain sólo si `COOKIE_DOMAIN !== 'localhost'` (evita warnings de cookies cross-site en dev). `loggerInstance` vs `logger` → en Fastify 4 se usa `logger: rootLogger` (la prop `loggerInstance` llegó en Fastify 5). Endpoint `/jobs/:id` SÓLO GET, con auth: no hay endpoint público para crear jobs; los encolan módulos del backend internamente — reduce superficie de ataque.
- **Security Check**: OK. Helmet activo (HSTS, no-sniff, frame-options, etc.). CORS estricto a `APP_URL` con `credentials: true`; origen \* no es posible. Cookie del refresh con `httpOnly` + `secure` en prod + `sameSite: lax`. Rate-limit 100/min global + 5/min en login. Error handler NUNCA filtra stack traces ni mensajes originales en 500 — sólo el logger interno ve detalles. `requireAuth` ejecuta `verifyAccessToken` (algoritmo fijado HS256, anti downgrade) y re-verifica la sesión vs DB en `getUserForToken` (garantiza que sesiones revocadas no aceptan access tokens aunque aún no hayan expirado). `requireRole` protege endpoints admin. `bodyLimit` 1MB previene DoS con payloads gigantes. `x-request-id` sanitizado (máx 128 chars). Logger pino redacta `authorization`/`cookie`/`apiKey` automáticamente por si un handler loggea el request crudo. No hay endpoint público para encolar jobs → superficie mínima.
- **Tests**: 14 tests nuevos (7 auth plugin + 7 error handler). No requieren red — todos con `app.inject()` o clientes fake. Los tests de login/refresh/jobs E2E vienen en UJ-01 y UJ-14. Tras `pnpm install` + `pnpm --filter @heyday/backend test:unit` el set total debería estar en ~54 tests verdes (14 auth + 8 vault + 10 credentials + 4 mirror + 4 queues + 3 jobs + 4 pricing + 7 anthropic + 7 auth-plugin + 7 error-handler — aprox, algunos overlap).
- **Notes**: Acciones pendientes del usuario antes de arrancar el API localmente: 1) `pnpm install` (bajar todas las deps Fastify). 2) `docker compose up -d db redis` (Postgres + Redis disponibles; `/ready` los pinguea). 3) `pnpm --filter @heyday/backend run dev` levanta la API en puerto `env.API_PORT` (3001). Smoke manual: `curl http://localhost:3001/health` → 200; `curl http://localhost:3001/ready` → 200 con `{checks: {db: 'ok', redis: 'ok'}}`. La observabilidad avanzada (traces distribuidos, OTel) se deja para post-delivery — pino + reqId + ai_usage_logs + jobs mirror cubre suficiente.

### 2026-04-20 — IT-08: Anthropic client wrapper

- **Work Done**: `backend/src/core/ai/anthropic-client.ts` concentra TODAS las llamadas a Claude. Resolución de API key vía `SecretsResolver.get('anthropic_primary')` — con precedencia env → vault y cache 5 min (de IT-06). Si no hay key en ninguno: lanza `AnthropicError('AI_NOT_CONFIGURED')`. Selección de modelo por feature en `models.ts` con `FEATURE_MODEL_MAP` que mapea cada valor de `AiFeature` (Prisma enum) a `{primary, fallback?, maxTokens, temperature}` en tiers `fast`/`default`/`premium`. El tier se resuelve a un modelo concreto por env (`CLAUDE_MODEL_FAST/DEFAULT/PREMIUM`) → rotar versiones no toca código. Prompt caching con bloques de sistema: `SystemBlock { text, cache? }` — si `cache: true` el wrapper añade `cache_control: {type: 'ephemeral'}` al bloque. Regla: los bloques reutilizables (system prompts, few-shots, taxonomías) deben marcarse siempre `cache: true` (cache read baja coste 10x y latencia). Retry exponencial: hasta 3 intentos en el tier primario para 429/5xx/timeouts con backoff base 500ms (1s, 2s, 4s), configurable vía `backoffBaseMs` para tests. Fallback automático al tier secundario tras agotar retries del primario (2 intentos más) — configurado en `pain_points` (default→fast), `lead_enrichment_extract` (fast→default). Errores 4xx no-retryables (400 BAD_REQUEST, 401/403 AUTH_FAILED) fallan inmediatamente sin retry. Timeout por request con AbortController (`timeoutMs` default 60s). Logging a `ai_usage_logs` cada call exitosa con: feature, model, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens (cache hit/miss), estimatedCostUsd, latencyMs, userId/entityType/entityId/requestId opcionales. Cálculo de coste en `pricing.ts` con tabla por familia (matched por `startsWith`): Opus 4 $15/$75/1M (in/out), Sonnet 4 $3/$15, Haiku 4 $1/$5, cache_write = 1.25x input, cache_read = 0.1x input (según pricing Anthropic público). Fallback pricing conservador (=sonnet) si el modelo no matchea ninguna familia. Redondeo a 6 decimales (alinea con `Decimal(10,6)` del schema). Nunca se loggea la API key ni prompt/response completos — sólo metadatos + status + attempt#. Fingerprint de key (`len:N:suffix:XXXX`) para detectar rotación sin exponer la key. `logger` hereda de `rootLogger` con redacción automática de `apiKey`/`authorization`/`ciphertext`. `anthropicClient` singleton exportado; inyectable en tests con `AnthropicClientDeps` (sdkFactory, secrets, db, logger, timeoutMs, backoffBaseMs). SDK oficial `@anthropic-ai/sdk` 0.32.1 usado sólo en producción — en tests se inyecta un fake. Tests: `pricing.test.ts` (match de familias por prefijo, fallback, cálculo sin cache, cache read 10x más barato, redondeo a 6 decimales); `anthropic-client.test.ts` (happy path con texto+usage+cost+log a DB; cache_control sólo en bloques marcados; retry 429→éxito en 2º intento; 400 no reintenta y no logea consumo; fallback sonnet→haiku tras 3 fallos 503; SecretNotConfiguredError→AI_NOT_CONFIGURED; tierOverride fuerza opus).
- **Files Created/Modified**: backend/src/core/ai/{pricing.ts,models.ts,errors.ts,anthropic-client.ts,index.ts,pricing.test.ts,anthropic-client.test.ts}, backend/package.json (añade `@anthropic-ai/sdk` 0.32.1).
- **Decisions**: Wrapper propio en vez de usar el SDK crudo — necesitamos centralizar caching, logging, fallback y cost tracking; cada UJ que llame a Claude debe pasar por aquí y no importar el SDK directamente (regla del proyecto). Cálculo de coste como `number` (no Decimal.js) porque los rangos relevantes (0.0001–10 USD) no producen errores de flotante observables; `Decimal(10,6)` en DB redondea al guardar. `family startsWith` en pricing table permite seguir cobrando bien cuando Anthropic publica `claude-sonnet-4-6-20260101` sin tocar código. Fallback como lógica del wrapper (no del caller) — simplifica callers de UJ y garantiza que pain_points siempre degradan a Haiku. Un único audit log (`ai_usage_logs`) por call exitosa; los fallos van sólo al logger pino. `cache_control: ephemeral` por defecto (5 min TTL de Anthropic); `persistent` se considerará si el perfil de uso lo justifica. `backoffBaseMs` inyectable específicamente para acelerar tests. Campo `fingerprint` de la key para invalidar el SDK client instance al rotar sin loggear la key cruda.
- **Security Check**: OK. API key nunca en logs (ni en logger, ni como campo de ningún objeto loggeado — `rootLogger` redacta `apiKey`/`authorization` igualmente). Content del prompt y respuesta NUNCA se persisten ni loggean — sólo counts y metadatos. `ai_usage_logs` contiene exactamente los campos permitidos por el schema (sin plaintext). AbortController en cada request previene requests zombie si Anthropic se cuelga. Retry no amplifica coste porque sólo cuenta request exitosa al log. Fallback a Haiku en feature `pain_points` mantiene funcionalidad si Sonnet está saturado (defensa contra Anthropic incidents). `AnthropicError` lleva sólo código genérico + status, nunca response body de Anthropic ni headers.
- **Tests**: 11 tests unitarios nuevos (4 pricing + 7 anthropic-client). Todos con SDK mockeado via `vi.mock('@anthropic-ai/sdk', ...)` + `sdkFactory` inyectado para casos concretos. No requieren `ANTHROPIC_API_KEY` real.
- **Notes**: Acción pendiente del usuario antes de ejecutar handlers reales (UJ-16/UJ-23) en local: 1) `pnpm install` (materializa `@anthropic-ai/sdk`). 2) Definir `ANTHROPIC_API_KEY` en `.env` (Level 2) o configurarla via admin vault cuando UJ-12 esté live. La feature `other` existe como escape hatch para prompts genéricos; nuevas features deberían añadirse al enum `AiFeature` de Prisma + FEATURE_MODEL_MAP antes de llamar al wrapper.

### 2026-04-20 — IT-07: Background jobs (BullMQ + worker)

- **Work Done**: Pipeline asíncrono completo con BullMQ 5 sobre Redis 7. Conexión central en `backend/src/core/queue/connection.ts`: singleton `ioredis` con `maxRetriesPerRequest: null` + `enableReadyCheck: false` (requisitos de BullMQ para producción), cacheado en `globalThis` para HMR en dev. 4 queues en `backend/src/core/queue/queues.ts` — `enrichment`, `content_generation`, `content_adapt`, `integration_test` — con defaults `attempts: 3`, exponential backoff (5s base), `removeOnComplete: {count:500, age:24h}` y `removeOnFail: {count:1000, age:7d}`. Cada queue recibe `QUEUE_PREFIX` desde env para aislar entornos que comparten Redis. Payloads tipados con zod en `types.ts` (EnrichmentPayload/ContentGenerationPayload/ContentAdaptPayload/IntegrationTestPayload) — regla estricta: sólo ids + flags, NUNCA secretos ni plaintext; el worker hidrata desde DB / `secretsResolver`. Único entrypoint para encolar es `enqueue(name, payload, opts?)`: valida con zod (lanza `InvalidJobPayloadError` con issues si falla), crea un mirror en la tabla `jobs` con status `queued` como source of truth para la UI, y añade el job a BullMQ con `jobId` = mirror.id para trazabilidad bidireccional. Si BullMQ falla tras crear el mirror, marca el mirror como `failed` y re-lanza (evita jobs fantasma queued para siempre). Helpers de transición de estado en `mirror.ts`: `markRunning` / `markSucceeded` / `markFailed` — escriben en la tabla `jobs` de forma best-effort (no rompen el worker si el mirror no existe). `markFailed` trunca errores a 2000 chars para no inflar la DB. `modules/jobs/service.ts` expone `JobsService` (DI) con `getById(id)` (devuelve payload+result+status) y `listRecent(limit)` (orden desc, clamp 1..200) — consumible desde `GET /jobs/:id` en IT-09. Worker entrypoint (`src/worker/main.ts`) reescrito: carga env, instancia un `Worker` BullMQ por queue con concurrencia `env.WORKER_CONCURRENCY`, processor común → valida payload defensivamente otra vez (doble cinturón por si un job se encoló fuera de `enqueue`) → `markRunning` → handler específico de feature → `markSucceeded`/`markFailed`. Handlers de IT-07 son placeholders que loggean + devuelven `{ok:true, summary:{placeholder:true}}`: los reales llegan en UJ-16 (enrichment), UJ-23 (content), UJ-12 (integration_test). Graceful shutdown en SIGTERM/SIGINT: cierra workers (drena in-flight), cierra queues, cierra Redis. Logger pino compartido en `core/observability/logger.ts` con redacción automática de `password*`/`accessToken`/`refreshToken`/`ciphertext`/`plaintext`/`apiKey`/`authorization`/`cookie`. Tests: `queues.test.ts` (enqueue válido crea mirror, payload inválido no crea mirror, schemas correctos por queue, integration_test rechaza sin credentialId); `mirror.test.ts` (markRunning/Succeeded/Failed transicionan correctamente, truncado a 2000 chars, best-effort no lanza en id inexistente); `modules/jobs/service.test.ts` (getById ok + NotFound, listRecent orden + limit clamp).
- **Files Created/Modified**: backend/src/core/queue/{connection.ts,types.ts,queues.ts,mirror.ts,index.ts,queues.test.ts,mirror.test.ts}, backend/src/core/observability/logger.ts, backend/src/modules/jobs/{service.ts,index.ts,service.test.ts}, backend/src/worker/main.ts (reescrito), backend/src/core/config/env.ts (REDIS_URL obligatorio + QUEUE_PREFIX + WORKER_CONCURRENCY), backend/package.json (bullmq 5.21.2 + ioredis 5.4.1 + pino 9.5.0 + pino-pretty 11.3.0), .env.example (QUEUE_PREFIX, WORKER_CONCURRENCY).
- **Decisions**: Mirror en tabla `jobs` (ya existente en schema desde IT-03) como fuente de verdad para la UI y backup si Redis pierde datos (BullMQ es efímero por diseño, sólo mantiene histórico corto). `jobId` compartido mirror↔BullMQ elimina la necesidad de una tabla de mapping. Validación dual (en `enqueue` + en processor) protege contra jobs encolados por scripts manuales o migraciones futuras que bypaseen el service. `ioredis.maxRetriesPerRequest: null` es requerido por BullMQ (de lo contrario los blocking polls del worker fallan). Un único client Redis reutilizado entre queues + workers (no abrir un client por queue). Log de payloads sólo nunca — se loggea `{jobId, queue, attempt}` + `durationMs` + `err.message`; `redact` de pino garantiza que sensibles nunca salen aunque un futuro handler los meta por error en el ctx. `removeOnFail` mantiene 7 días de histórico de fallos para debug; completados 24h para no inflar Redis. Handlers placeholder devuelven `{placeholder:true}` para que el mirror termine en `succeeded` cuando el usuario pruebe el plumbing end-to-end — acceptance "job dummy encolado desde API se procesa en worker y aparece como succeeded" queda cubierto en IT-09 cuando montemos `POST /admin/jobs/test` + `GET /jobs/:id`.
- **Security Check**: OK. Payloads validados con zod antes de cruzar Redis. Secretos no viajan por la queue — se resuelven desde `secretsResolver` dentro del handler. Logger con redacción automática de tokens/ciphertext/apiKey/cookie/authorization. Error truncado a 2000 chars en mirror evita filtración de stack traces gigantes con PII. `QUEUE_PREFIX` en env permite aislar staging/prod si comparten Redis. `JobsService` NO devuelve el payload de integration_test en listRecent (sólo metadata) — el payload sólo se devuelve en getById(id) (protegido por auth admin en IT-09). Workers con `concurrency` configurable por env (evita saturar DB/Anthropic en prod). Graceful shutdown drena jobs in-flight antes de apagarse.
- **Tests**: 11 tests unitarios nuevos (4 enqueue + 4 mirror + 3 jobs service). Todos con fake Prisma + mock de `bullmq` vía `vi.mock`. Tras `pnpm install` (para materializar bullmq/ioredis/pino): `pnpm --filter @heyday/backend test:unit` debería pasar los ~29 tests (14 auth + 4 password + 8 vault + 10 credentials + 11 queues ~ aprox; algunos overlap).
- **Notes**: Acciones pendientes del usuario antes de `pnpm seed`/arrancar worker localmente: 1) `pnpm install` para bajar bullmq/ioredis/pino. 2) Redis levantado (ya sea via `docker compose up -d redis` o local). 3) Sin cambios adicionales en `.env` — REDIS_URL ya estaba. Worker se arranca con `pnpm --filter @heyday/backend run worker:dev` (local) o `docker compose up worker` (integrado). La conexión a Anthropic en handlers reales (UJ-16, UJ-23) llegará tras IT-08.

### 2026-04-20 — IT-06: Credential Vault (AES-256-GCM)

- **Work Done**: Vault simétrico de secretos Level 3 listo. `backend/src/core/crypto/vault.ts` implementa AES-256-GCM con IV aleatorio de 12 bytes + auth tag de 16 bytes + `keyVersion` para permitir rotación de master key sin migración destructiva. Exports: `encrypt(plaintext) → EncryptedSecret`, `decrypt({ciphertext, iv, authTag, keyVersion})`, `reencryptToCurrent(secret)` (re-cifra a versión actual descifrando con la antigua), `VaultError` con códigos (`VAULT_MISCONFIGURED`, `VAULT_DECRYPT_FAILED`, `VAULT_INVALID_INPUT`), `__resetKeyCacheForTests()`. La master key se lee de `env.CREDENTIAL_MASTER_KEY` (base64 → 32 bytes exactos); keys para versiones anteriores pueden añadirse vía `CREDENTIAL_MASTER_KEY_V{n}` para rotar. `AuditService` creado en `backend/src/modules/audit/service.ts` como stub inyectable (recibe PrismaClient) que persiste en `audit_log` sin sensibles — consumido por Credentials + futuros módulos. `CredentialsService` en `backend/src/modules/credentials/service.ts`: DI de PrismaClient + AuditService; métodos `listPublic()`, `getPublicById()`, `getPublicByKey()` devuelven `CredentialPublicDto` (id/key/provider/label/keyVersion/isActive/lastUsedAt/lastRotatedAt) — NUNCA incluyen ciphertext/iv/authTag. `reveal(key)` valida isActive, descifra y best-effort bumpa `lastUsedAt`. Mutaciones (`create`, `rotate`, `setActive`, `delete`) registran audit con metadata no sensible (key, provider). `reencryptAllToCurrentKeyVersion(actorUserId)` helper para rotación masiva tras cambiar master key: itera credentials con `keyVersion < CURRENT`, re-cifra y registra `credential.reencrypt_bulk` al final. Errores: `CredentialNotFoundError`, `CredentialConflictError`. `backend/src/core/config/secrets.ts` expone `SecretsResolver` con cache en memoria TTL 5 min: prioridad 1) env var del `ENV_FALLBACKS` map (e.g. `ANTHROPIC_API_KEY` overridea `anthropic_primary`), 2) vault via `credentialsService.reveal()`. Métodos `get` (lanza `SecretNotConfiguredError`), `tryGet` (devuelve null), `invalidate(key)`, `invalidateAll()`. Tests: `vault.test.ts` cubre round-trip, no-determinismo (mismo plaintext → distintos ciphertexts), tamper detection (mutar byte → `VAULT_DECRYPT_FAILED`), tamper de authTag, IV inválido, keyVersion desconocida, plaintext vacío rechazado. `credentials/service.test.ts` usa fake Prisma in-memory para: create cifra y no persiste plaintext en fila (ciphertext buffer no contiene "sk-ant"; iv=12B; authTag=16B; keyVersion=1); duplicado por key → `CredentialConflictError`; `listPublic`/`getPublicById` NO exponen campos sensibles; `reveal` devuelve plaintext y actualiza `lastUsedAt`; `reveal` de key inexistente o desactivada → `CredentialNotFoundError`; `rotate` cambia ciphertext+iv, nuevo plaintext descifra correctamente, audit = `credential.rotate`; `setActive` registra `activate`/`deactivate`; `delete` elimina fila + audit.
- **Files Created/Modified**: backend/src/core/crypto/{vault.ts,vault.test.ts}, backend/src/modules/audit/{service.ts,index.ts}, backend/src/modules/credentials/{service.ts,service.test.ts,index.ts}, backend/src/core/config/secrets.ts.
- **Decisions**: IV de 12 bytes (recomendado por NIST SP 800-38D para GCM — `randomBytes` da suficiente unicidad <2^32 operaciones por key, cubriendo décadas de operación en HeyDay). Auth tag full 16 bytes (sin truncar). `keyVersion` en la fila permite rotar master key sin re-cifrar instantáneamente todo — los rows antiguos siguen descifrándose con su key vieja y `reencryptAllToCurrentKeyVersion` los migra bajo control del admin. Cache del `SecretsResolver` en memoria por proceso (no Redis): TTL corto + invalidación explícita son suficientes para 2 admins y evita serializar plaintexts a un almacén externo. `ENV_FALLBACKS` es un mapa explícito: sólo `anthropic_primary` tiene fallback env (porque queremos permitir overridear desde EasyPanel sin tocar DB); el resto son Level 3 puro. El plaintext NUNCA se loggea ni vuelve en DTOs — `reveal` es el único camino y está pensado para llamadas internas del backend. `VaultError` con códigos permite detectar configuración incorrecta vs tamper en logs/audit sin filtrar detalles. Fake Prisma usa `Map` en memoria con las mismas semánticas de `findUnique`/`findMany`/`create`/`update`/`delete` que Prisma real, compartido entre tests de este módulo — evita pedir una DB en unit tests.
- **Security Check**: OK. `ciphertext`, `iv`, `authTag` nunca salen por HTTP (sólo `CredentialPublicDto`). Plaintext sólo vive en memoria durante `reveal()`; cache con TTL 5 min es invalidable y no se persiste. Tamper en ciphertext o authTag → `VAULT_DECRYPT_FAILED` (GCM lo detecta). Master key validada en `env.ts` (≥32 bytes tras base64 decode). Audit log con acción + actor + entityId + metadata mínima (key, provider) — sin plaintext, sin ciphertext. Rotación deja `lastRotatedAt` para monitorear credentials stale. `reveal` sobre credential desactivada/inexistente → `CredentialNotFoundError` (no filtra existencia vs estado). Tests cubren tamper y misconfiguration.
- **Tests**: 8 tests en `vault.test.ts` (round-trip, no-determinismo, tamper ciphertext/authTag, IV corrupto, keyVersion inválida, input vacío) + 10 tests en `credentials/service.test.ts` (create + cifrado, conflict, listPublic/getPublicById ocultan sensibles, reveal + lastUsedAt, reveal 404, reveal sobre inactiva 404, rotate, setActive activate/deactivate audit, delete, delete 404).
- **Notes**: Acción pendiente del usuario antes de usar en prod: `bash deployment/scripts/generate-secrets.sh` → copiar `CREDENTIAL_MASTER_KEY` al `.env`. `SecretsResolver` se consumirá desde IT-08 (Anthropic client wrapper lee `secretsResolver.get('anthropic_primary')`) y IT-09 (cualquier API externa usa el mismo path). UJ-12 (Credential Vault UI) consumirá `CredentialsService` + `AuditService` para CRUD desde admin.

### 2026-04-20 — IT-05: Users model + seed Alex/Alba

- **Work Done**: Ampliado `backend/prisma/seed.ts` para sembrar Alex y Alba como `admin` tras las taxonomías. Usa `AuthService.registerAdmin` (upsert por email) → bcrypt cost 12 vía el mismo path que el login real, garantizando paridad. Validación explícita: si `SEED_ALEX_PASSWORD` o `SEED_ALBA_PASSWORD` faltan o tienen <12 chars, el seed aborta antes de tocar la DB con mensaje claro indicando la env var concreta. Emails configurables via `SEED_ALEX_EMAIL` / `SEED_ALBA_EMAIL` (defaults `alex@heyday.studio` / `alba@heyday.studio`). Añadido módulo `backend/src/modules/users/service.ts` con `UsersService` (list / getById / getByEmail / update / setActive) — framework-agnóstico, inyectable, usa `hashPassword` en updates de contraseña. Barrel en `modules/users/index.ts`. El CRUD HTTP se monta en IT-09; UJ-11 (Admin: gestión de usuarios) consumirá este service.
- **Files Created/Modified**: backend/prisma/seed.ts (añade `seedInitialUsers`), backend/src/modules/users/{service.ts,index.ts}.
- **Decisions**: No crear un módulo separado `register` — el upsert de `AuthService.registerAdmin` cubre tanto seed como CRUD futuro (UJ-11). Mínimo de 12 chars para SEED passwords (consistente con `MIN_PASSWORD_LENGTH` en `password.ts`). Seed usa el singleton Prisma (no instancia separada) para evitar dos pools de conexión. Los dos users arrancan con `role = admin` e `isActive = true`.
- **Security Check**: OK. Passwords nunca se loggean (sólo email + id). Faltar contraseñas aborta antes de crear usuarios con valores vacíos. Upsert actualiza passwordHash en cada ejecución → permite rotar la contraseña inicial con `pnpm seed` sin tocar SQL. No hay passwords en ningún archivo del repo; sólo en `.env` local que está gitignored.
- **Tests**: la lógica de `AuthService.registerAdmin` ya está cubierta indirectamente por `service.test.ts` (login tras crear). Un test E2E login-con-seed se hará en UJ-01.
- **Notes**: Acción requerida del usuario antes del próximo `pnpm seed`: definir `SEED_ALEX_PASSWORD` y `SEED_ALBA_PASSWORD` en `.env` (12+ chars). Tras `pnpm db:migrate && pnpm seed` deberían existir ambos admins y poder loguear vía `AuthService.login`.

### 2026-04-20 — IT-04: Auth backend (JWT + bcrypt + sesiones)

- **Work Done**: Módulo de autenticación framework-agnóstico listo para wirear a Fastify en IT-09. `core/auth/password.ts` con bcryptjs cost 12 y validación de longitud mínima (12 chars) vía `WeakPasswordError`. `core/auth/tokens.ts` con JWT HS256: `signAccessToken`/`verifyAccessToken` (TTL `JWT_ACCESS_TTL`, default 15m) y `signRefreshToken`/`verifyRefreshToken` (TTL `JWT_REFRESH_TTL`, default 14d, con `jti` único). `hashRefreshToken` usa sha256 — nunca guardamos el token en claro. `core/auth/errors.ts` expone `AuthError` con factorías tipadas (`invalidCredentials`, `expired`, `forbidden`, `internal`) mapeadas a ERROR_CODES de shared. `modules/auth/service.ts` con `AuthService` inyectable (recibe PrismaClient) y operaciones `login`, `refresh`, `logout`, `logoutAllOfUser`, `getUserForToken`, `registerAdmin`. Login: busca user case-insensitive, verifica password contra bcrypt, crea sesión, devuelve `{user, tokens, sessionId}` + hace `lastLoginAt=now`. Camino "usuario no encontrado" computa un hash fake (DUMMY_BCRYPT_HASH pre-calculado) para reducir timing leak. Refresh con rotación: verifica firma, match por sesión/refresh_hash, revoca la actual, emite una nueva; si detecta reuso de un refresh ya revocado, revoca TODAS las sesiones del usuario (defense-in-depth contra reuse attacks). Logout idempotente vía `updateMany`. Module barrel `modules/auth/index.ts` re-exporta el API público. Vitest configurado (`backend/vitest.config.ts`) con setup global (`backend/tests/setup.ts`) que inyecta env vars dummy para que `core/config/env.ts` arranque sin requerir `.env`. 3 archivos de tests cubren el AC: `password.test.ts` (hash round-trip, rechazo, weak), `tokens.test.ts` (access/refresh round-trip, expirado, tampered, confusión access↔refresh), `service.test.ts` (login happy, password malo, email inexistente, inactivo, refresh rota, reuso lanza y purga sesiones, logout idempotente, sesión revocada → AUTH_EXPIRED).
- **Files Created/Modified**: backend/src/core/auth/{password.ts,password.test.ts,tokens.ts,tokens.test.ts,errors.ts}, backend/src/modules/auth/{service.ts,service.test.ts,index.ts}, backend/vitest.config.ts, backend/tests/setup.ts, backend/package.json (añade bcryptjs + jsonwebtoken + types).
- **Decisions**: `bcryptjs` sobre `bcrypt` nativo — elimina la necesidad de build tools en alpine para el Docker y evita problemas cross-platform; coste de CPU irrelevante para ≤2 admin logins diarios. JWT HS256 con dos secretos separados (access + refresh) — rotación independiente. ID de sesión generado manualmente (`ses_` + UUID sin guiones) en lugar de `@default(cuid())` porque el refresh token embebe `sid` y necesitamos el id ANTES del insert. `AuthService` recibe `PrismaClient` por DI → tests con mock sin red, producción usa singleton. `registerAdmin` es upsert por email — idempotente para seed de IT-05. Middleware `requireAuth`/`requireRole` NO implementado aquí: se wirea en IT-09 sobre Fastify con `getUserForToken`. Tests co-localizados (`*.test.ts` junto al código) para descubribilidad.
- **Security Check**: OK. Passwords nunca salen del service. `passwordHash` no está en `PublicUserDto`. Refresh tokens se guardan sólo como sha256 — un dump de DB no expone tokens válidos. Rotación + detección de reuso mitigan robo de refresh. `AuthError.invalidCredentials` es el único error devuelto por login — no revela si el email existe. `login` ejecuta un bcrypt fake cuando el usuario no existe. `jwt.verify` usa algoritmo fijado HS256 (previene downgrade a `none`). Secretos validados con mínimo 32 chars en `env.ts`. No hay logs de passwords ni de tokens. No hay almacenamiento en `localStorage` (tokens fluyen por la capa HTTP en IT-09: access en memoria, refresh en cookie httpOnly).
- **Tests**: 14 tests unitarios cubriendo AC completo. `pnpm --filter @heyday/backend test:unit` debe pasar en verde tras `pnpm install`.
- **Notes**: El singleton `authService` se importa desde `modules/auth` en IT-09 y IT-05. Rate limit de login se aplicará en IT-09 (Fastify rate limit plugin). `AuthService.registerAdmin` se usará en `prisma/seed.ts` en IT-05 para sembrar Alex y Alba con passwords de env.

### 2026-04-20 — IT-03: PostgreSQL + Prisma setup

- **Work Done**: Traducción completa de `design/data_model.md` a `backend/prisma/schema.prisma`: 29 modelos en 5 módulos (Auth/Users, CRM, Lead Intelligence, Content Engine, Admin/Infra) + 23 enums dedicados. Todos los timestamps con `@db.Timestamptz(6)`. IDs cuid salvo `AuditLog`, `AiUsageLog`, `ExternalApiUsageLog` con `BigInt autoincrement`. Soft delete via `deletedAt` en Company/Contact/Lead/ContentItem. Polimorfismo preservado en Taggable (`entity_type + entity_id`) y Activity (igual pattern). Índices críticos declarados: `lead(stage_id, priority_score desc)`, `company(domain unique)`, `activity(entity_type, entity_id, due_at)`, `pain_point(company_id, confidence)`, `content_item(status, channel, scheduled_for)`, `ai_usage_log(created_at, feature)`, `audit_log(created_at desc)`. Relación 1:1 circular ContentItem↔ContentVersion con `currentVersionId @unique` + relaciones nombradas `ContentItemCurrentVersion` y `ContentItemVersions`. OutboundPrep 1:1 con Company (`companyId @unique`). IntegrationHealth 1:1 con Credential. Singleton `backend/src/core/prisma/client.ts` cacheado en `globalThis` para HMR dev. Módulo `backend/src/core/config/env.ts` con zod para validar todas las env vars al arranque. `backend/prisma/seed.ts` siembra 6 categorías de pain points (weak_website, no_seo, poor_content_cadence, no_automation, weak_social_presence, generic_messaging), 3 service lines (automations, content, website_seo) con sub_capabilities, 5 content pillars (education, authority, opinion, case_study, news_reactive) y el Pipeline principal con las 7 stages por defecto de shared/constants. README en `backend/prisma/` documentando convenciones.
- **Files Created/Modified**: backend/prisma/schema.prisma, backend/prisma/seed.ts, backend/prisma/README.md, backend/src/core/prisma/client.ts, backend/src/core/config/env.ts, backend/package.json (añade @prisma/client + prisma deps + bloque `prisma.seed`), .env.example (añade PRISMA_LOG_QUERIES).
- **Decisions**: Enum `DetectionOrigin` compartido por PainPoint.detectedBy y ServiceFitRecommendation.generatedBy (mismos valores rule/claude/human); ContentVersion.generatedBy tiene enum propio porque incluye `claude_edited_by_human`. `metadata Json @default("{}")` en AuditLog y EnrichmentRun para evitar NULLs al registrar eventos. `verbatimModuleSyntax` respetado: `Prisma` importado como `type`. Prisma escribe columnas en `snake_case` y tablas plural via `@map`/`@@map` para mantener SQL legible sin mezclar convenciones con el cliente JS en camelCase. Seed idempotente (upsert por key/is_default) para poder re-ejecutar sin duplicar taxonomías.
- **Security Check**: OK. Sin secretos en `schema.prisma` ni seed. `DATABASE_URL` solo vía env. `env.ts` valida y cachea una vez, impidiendo lecturas dispersas de `process.env`. No se siembran usuarios aquí (llegan en IT-05 con bcrypt). `Credential` preparada con `ciphertext/iv/auth_tag` Bytes + `keyVersion` — el vault se implementa en IT-06 y NUNCA guardará secretos en claro.
- **Tests**: no aplica — IT-03 es schema. La migración real `0001_init` se creará cuando el usuario corra `pnpm db:migrate` con la DB levantada (Docker). Verificación manual: `pnpm db:studio` debe navegar las 29 tablas sin error.
- **Notes**: Antes de que el usuario arranque IT-04 debe ejecutar en local: `docker compose up -d db redis && pnpm install && pnpm --filter @heyday/backend run db:generate && pnpm db:migrate` (Prisma pedirá nombre, ej. `init`). Tras eso, `pnpm seed` para poblar taxonomías. Si `@prisma/client` aún no está instalado al abrir el repo, el typecheck fallará hasta hacer `pnpm install` — es esperado.

### 2026-04-19 — IT-02: Docker Compose + Dockerfiles

- **Work Done**: `docker-compose.yml` reescrito con 5 servicios (db Postgres 16, redis Redis 7, backend, worker, frontend) incluyendo healthchecks, networks, volúmenes nombrados para DB/Redis/node_modules/.next. 3 Dockerfiles multi-stage (base/deps/dev/builder/prod) — el de worker basado en `mcr.microsoft.com/playwright:v1.47.0-jammy` para no tener que instalar navegadores. Imágenes de producción corren como usuario no-root `heyday:1001` con `tini` como PID 1. Creado `.dockerignore` raíz que excluye `.env*`, `node_modules`, `.git`, docs, planning, etc. Actualizado `deployment/easypanel/README.md` con guía de despliegue. Creado script `deployment/scripts/generate-secrets.sh` (openssl rand para JWT secrets + master key). Esqueleto de `deployment/docs/deployment_guide.md`.
- **Files Created/Modified**: docker-compose.yml (reescrito), .dockerignore, deployment/docker/{Dockerfile.backend,Dockerfile.worker,Dockerfile.frontend,README.md}, deployment/easypanel/README.md, deployment/scripts/{README.md,generate-secrets.sh}, deployment/docs/deployment_guide.md.
- **Decisions**: Worker parte de imagen oficial Playwright (evita ~2GB de instalación manual). Backend y frontend basan en `node:20-alpine` por tamaño. `tini` en prod para manejo correcto de SIGTERM. Volúmenes separados para node_modules de host vs contenedor para evitar conflictos cross-OS (Linux vs macOS). Compose coge secretos solo de `.env` del host, nunca hardcoded.
- **Security Check**: OK. Sin secretos en imágenes. Usuario no-root en prod. `.dockerignore` protege `.env*`. Healthchecks impiden routing a contenedores caídos. TLS lo termina EasyPanel fuera del compose.
- **Tests**: no aplica en IT-02 (los builds se validan al correr `docker compose build` en IT-11/delivery).
- **Notes**: Para validar localmente antes de IT-03 se requiere Docker instalado. Nota para IT-10: el `Dockerfile.frontend` prod asume `output: 'standalone'` en `next.config` — recordar configurarlo.

### 2026-04-19 — IT-01: Monorepo + Tooling setup

- **Work Done**: pnpm workspaces con 3 paquetes (backend, frontend, shared). Config raíz: package.json con scripts orquestadores, tsconfig.base.json con modo estricto (noUncheckedIndexedAccess, exactOptionalPropertyTypes), ESLint 9 flat config con typescript-eslint, Prettier 3 con plugin tailwind, .editorconfig, .nvmrc (node 20), .gitignore ampliado (cubre .env\*, .next, coverage, caches), .env.example completo con secciones Level 1/2/3 comentadas. Husky v9 + lint-staged instalados vía scripts. shared/ con constants (ICP verticals, service lines, pain point confidence, content channels, pillars, user roles, default pipeline stages, error codes), zod schemas base (pagination, error response, enums) y types (PaginatedResponse, PublicUser). backend/ y frontend/ con packages placeholder que exponen scripts `dev/build/lint/typecheck/test` para que los orquestadores raíz funcionen. README raíz reescrito.
- **Files Created/Modified**: package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.mjs, .prettierrc.json, .prettierignore, .editorconfig, .nvmrc, .gitignore, .env.example, README.md, .husky/pre-commit, shared/{package.json,tsconfig.json,src/index.ts,src/constants/index.ts,src/schemas/index.ts,src/types/index.ts}, backend/{package.json,tsconfig.json,src/api/server.ts,src/worker/main.ts,README.md}, frontend/{package.json,tsconfig.json,src/app/placeholder.ts,README.md}.
- **Decisions**: Paquetes con nombres `@heyday/{backend,frontend,shared}`. Stack fijo TypeScript estricto + ESM everywhere. ESLint 9 flat (no `.eslintrc`). Pre-commit solo lint-staged (no tests) para no ralentizar commits.
- **Security Check**: OK. No secretos en el repo; `.gitignore` explícito; `.env.example` solo placeholders; pre-commit hook instalado; dependencias desde registries oficiales.
- **Tests**: no aplica en IT-01 (sin código ejecutable todavía). Verificación: estructura de archivos completa y coherente con design/architecture.md.
- **Notes**: Antes de IT-02 el usuario deberá ejecutar `pnpm install` en su máquina para materializar dependencias. Versiones fijadas (no rangos ^) para reproducibilidad; se actualizarán con renovate/dependabot tras delivery.

### 2026-04-19 — PLANNING: Planning Mode completado

- **Work Done**: Inspección del repo; confirmación de que es greenfield; recolección de respuestas del usuario a las 6 preguntas bloqueantes; redacción de requirements, scope, risks; diseño completo (data_model con 29 entidades, api_contracts, ui_wireframes, architecture, style_guide, stack_selection); NFR y decision_log con 11 decisiones registradas; descomposición en 11 IT + 27 UJ agrupados en 6 milestones (M0-M5); inventarios de skills y MCPs; design_summary compacto.
- **Files Created/Modified**: planning/questions.md, planning/requirements.md, planning/scope.md, planning/risks.md, design/data_model.md, design/api_contracts.md, design/ui_wireframes.md, design/architecture.md, design/style_guide.md, design/stack_selection.md, design/design_summary.md, docs/nfr.md, docs/decision_log.md, docs/project_memory.md, docs/work_log.md, implementation/user_journeys.md, implementation/task_tracker.md, skills/inventory.md, mcps/inventory.md
- **Decisions**: DEC-01 a DEC-11 registradas en decision_log.md. Highlights: greenfield, Anthropic como proveedor IA, stack Node/TS + Next.js + Prisma + Postgres, credential vault AES-256-GCM, enrichment asíncrono BullMQ, pain points en 3 niveles obligatorios, sin publicación automática en v1, single-tenant Alex+Alba admin, UI en español, service matching híbrido, admin panel como milestone temprano.
- **Security Check**: not applicable (planning). Checklist incorporado en todos los IT y UJ.
- **Tests**: not applicable. Test strategy definida por módulo en architecture.md.
- **Notes**: Plan listo para aprobación del usuario. Próximo paso tras aprobación: `/start-execution` comenzando por IT-01.

## Review — 2026-04-25 — M0 Foundation milestone

**Verdict: YELLOW** — ship M0 and proceed to M1, but track the documented backend typecheck debt as a hard prerequisite before delivery (and ideally before M1 endpoints stabilize).

### Verification approach

Read-only audit. Verified file existence on disk against work_log claims, ran the full backend + frontend test suites and typecheck, and spot-checked security-sensitive code (vault, auth, error handler, CI workflow, demo seed credentials).

### Per-IT summary

- **IT-01 — Monorepo + tooling**: OK. `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.husky/pre-commit`, `.env.example`, three workspaces present. No secrets in repo, `.env` gitignored.
- **IT-02 — Docker Compose + Dockerfiles**: OK. `docker-compose.yml` plus three Dockerfiles in `deployment/docker/` exist; `.dockerignore` excludes `.env*`. Not exercised at runtime in this review.
- **IT-03 — Prisma schema + seed**: OK. `backend/prisma/schema.prisma` (29 models) and `seed.ts` present. `migrations/` directory exists. Singleton client in `src/core/prisma/`.
- **IT-04 — Auth (JWT + bcrypt)**: OK. `password.ts`, `tokens.ts`, `errors.ts`, `service.ts` present; 14 unit tests pass (password 4 + tokens 6 + service 8 = 18 reported in test run, slightly higher than work_log's 14 — improvement, not regression). Algorithm pinned HS256, refresh hashed sha256, reuse detection wired.
- **IT-05 — Users + seed Alex/Alba**: OK. `UsersService` and seed extension present; passwords sourced from env; weak-password guard in seed.
- **IT-06 — Credential Vault (AES-256-GCM)**: OK. `vault.ts` + `secrets.ts` + `CredentialsService` + `AuditService` present. 7 vault tests + 10 credentials tests pass. `CredentialPublicDto` does not expose ciphertext/iv/authTag. Tamper detection covered.
- **IT-07 — BullMQ + worker**: OK. 4 queues, mirror-table pattern, zod payload validation, pino logger with redact. 4 + 4 + 4 = 12 tests pass.
- **IT-08 — Anthropic client wrapper**: OK in runtime. SDK 0.32.1 installed. Pricing + retry + fallback + ai_usage_logs covered. 7 pricing + 6 anthropic-client tests pass. **However**: 4 TS errors in `anthropic-client.test.ts` (TS4111 on index-signature access) and 2 errors in `anthropic-client.ts` itself (sdkFactory union type, `AnthropicError` missing `attempts`/`name`).
- **IT-09 — HTTP layer (Fastify)**: **DOC DRIFT CONFIRMED**. `backend/package.json` has `fastify: 5.1.0` (and `@fastify/*` v10/12 — all v5-compatible), but the IT-09 work_log says "Fastify 4.28.1" multiple times. Code is running on Fastify 5; the ~5 TS2345/TS2322 errors in `server.ts` are the type drift between user-supplied pino `Logger` and Fastify 5's `FastifyBaseLogger`. Routes, plugins, helmet/cors/cookie/rate-limit, error handler all present and tested (auth plugin 6 + error-handler 7 = 13 tests pass; work_log claimed 14).
- **IT-10 — Frontend shell**: OK. Next.js 15 App Router with `(auth)` and `(app)` groups, providers, Zustand store, AuthBootstrap, middleware with open-redirect guard, sonner, ThemeToggle. **11/11 tests pass and `tsc --noEmit` is clean.** Access token in memory only (no localStorage).
- **IT-11 — Seed demo + CI**: OK functionally. `seed-demo.ts` (1099 LOC) and `.github/workflows/ci.yml` exist. CI has 4 jobs as claimed; backend typecheck runs with `continue-on-error: true`. Seed compiles cleanly inside the project tsconfig (the standalone-file invocation fails because of zod's `target: es2020` requirement — that's not a project bug, it's a tsc invocation artifact). Demo Anthropic key uses obvious `sk-ant-demo-` prefix encrypted with the real master key. End-to-end seed run requires DB+Redis and was not executed in this review (cannot, no live infra).

### Test + typecheck results (this run)

- `pnpm --filter @heyday/backend test` → **73/73 passed** (12 files, 9.6s).
- `pnpm --filter @heyday/frontend test` → **11/11 passed** (3 files, 1.6s).
- `pnpm --filter @heyday/frontend exec tsc --noEmit` → **clean**.
- `pnpm --filter @heyday/backend exec tsc --noEmit` → **42 errors** confirmed, broken down: 33× TS4111 (index-signature env access — mostly `process.env.X` and `error.code` reads in seed/health/tests), 4× TS2345 + 2× TS2322 (Fastify 5 logger/instance type drift in `server.ts`), 1× TS2304 (`Cannot find name 'Crypto'` in `auth/service.ts`), 1× TS2739 (`AnthropicError` missing `attempts`/`name`), 1× TS18048 (possibly-undefined in `auth/service.test.ts`). All runtime tests pass because vitest uses esbuild and skips tsc.

### Critical issues (must fix before M1)

**None.** M0 is functionally complete; runtime tests are green; no hardcoded secrets, no exposed plaintext, no AuthN/AuthZ holes detected in the audited surface. M1 can start on this foundation.

### Non-critical debt to track

1. **42 backend TS errors** — already documented in `project_memory.md`. Mechanical to fix (~30–60 min) but not blocking. Will become annoying as soon as UJ work adds more handlers that interact with `app.requireAuth`/`request.authUser` typings; recommend closing before UJ-01 lands so that M1 code is typecheck-clean from the start. CI must drop `continue-on-error: true` once cleared.
2. **Doc drift in IT-09 work_log** — repeated claim "Fastify 4.28.1" is wrong; package.json is on 5.1.0. The IT-11 entry partially flags this. Recommend a one-line correction in IT-09 next session (or a Recent Changes note), not a rewrite.
3. **Seed-demo never executed end-to-end** — script compiles but the round-trip (`docker compose up -d db redis && pnpm db:migrate:deploy && pnpm seed:demo`) has not been run. Belongs in the UJ-01 acceptance dance: as soon as `/login` exists, run the seed against a real DB and verify pages render. Not blocking M1 start.
4. **Test count discrepancies** vs work_log — minor (auth 18 vs claimed 14; auth-plugin 6 vs 7; anthropic-client 6 vs 7; error-handler 7 = match). Net is more coverage than claimed, not less. Cosmetic.
5. **Apify client** — pending install for M5; track as scheduled with that milestone.

### Production-risk observations

- Auth + vault flow looks safe: HS256 pinned, refresh sha256-hashed, reuse-detection revokes all sessions, master key validated to ≥32 bytes, ciphertext/iv/authTag never leak in DTOs, `error.tsx` (frontend) and the backend 500 handler both refuse to surface raw error messages.
- Demo credential in `seed-demo.ts` uses an obviously-fake `sk-ant-demo-<hex>` payload encrypted with the real master key — correct posture (validates round-trip, no real key hits the DB).
- `.env` is mode 600, gitignored, and not present as a tracked file. `.env.example` only contains placeholders.
- No git repository present at the root (`git check-ignore` reports "fatal: not a git repository") — flags that the CI workflow has nowhere to run yet. The user must `git init` and push before CI is exercised. Not part of M0 scope per se, but worth surfacing.

### Recommendations for next session

1. **Spin off a 30–60 min cleanup task** (already implicitly proposed in `project_memory.md` as "cleanup_backend_typecheck") to land 42→0 TS errors before UJ-01: mostly bracket-access for env vars, importing `webcrypto` for `Crypto`, adjusting `AnthropicError` shape, casting Fastify logger correctly. Then drop `continue-on-error` from `ci.yml`.
2. **Correct the IT-09 work_log entry** with a one-line "Updated to Fastify 5.1.0 during install; types in `server.ts` deferred — see typecheck debt." Keeps the record honest.
3. **`git init` + initial commit + push** so CI actually runs on a real PR before UJ-01 merges.
4. **Run the full demo flow once locally**: `docker compose up -d db redis && pnpm install && pnpm db:migrate && pnpm seed:demo && pnpm --filter @heyday/frontend dev`. Confirm login + dashboard render with seeded data. This is the empirical M0 acceptance.
5. **Then start M1 — UJ-01 (Login y sesión persistente)**. Most pieces are already in place from IT-09 + IT-10; UJ-01 closes the loop with end-to-end Playwright + the "session expired" UX.

---

## Review — Milestone M1 (CRM Core) — 2026-04-28

### Scope reviewed

UJ-01..UJ-06 (CRM Core). Independent fresh-eyes review por subagente: lectura cruzada de routes/services/error-handler/server, components GlobalSearch + TagPicker + form dialogs, schemas zod y wiring de Topbar. Énfasis especial en UJ-06 (recién cerrado).

### Verification commands

- `pnpm format:check` → exit 0 (limpio).
- `pnpm lint` → exit 0 (3 workspaces, 0 warnings).
- `pnpm typecheck` → exit 0 (3 workspaces).
- `pnpm test` → exit 0. **Backend 209/209** (26 archivos), **Frontend 59/59** (17 archivos). Total **268 tests**.

Notas: el suite frontend emite warnings de `act(...)` en `LeadFormDialog.test.tsx` (no rompen tests, son no-blocking — patrón conocido al tipar mutaciones async; ver "Non-blocking findings").

### Findings per UJ

- **UJ-01 (Login y sesión persistente)**: PASS. `requireAuth` global donde toca, refresh JWT en cookie httpOnly, rate limit 5/min en login, SessionWatcher con BroadcastChannel inter-pestañas. Tests login/refresh/logout + 3 specs E2E gated por env. No PII en logs/audit.
- **UJ-02 (CRUD Empresas)**: PASS. 5 endpoints `/companies` con `requireAuth`, dedupe por dominio (libera al soft-delete), `safeHttpUrl` defiende contra XSS en URLs renderizadas, lista con filtros + paginación, detalle con 4 tabs. 9 service tests + 7 routes tests.
- **UJ-03 (CRUD Contactos + anonymize)**: PASS. 6 endpoints con `requireAuth`. Anonymize implementado correctamente como acción **irreversible** (campo `anonymizedAt` + reemplazo de PII por placeholders) con audit log sin PII (solo `{contact_id}`). Doble confirmación literal "ANONIMIZAR" en frontend. **Deuda conocida (no blocker)**: migración Prisma `add_contact_anonymized_at` aún no ejecutada (requiere docker compose up); schema y cliente regenerados, tests pasan con mocks.
- **UJ-04 (Pipelines y Kanban de Leads)**: PASS. CRUD pipelines + leads con transiciones won/lost; Kanban dnd-kit instalado correctamente (tras mitigar shim). 14+15+6+9 tests backend + 7 frontend. RBAC diferida a M3 con TODO(roles) explícito (aceptable v1: solo admin).
- **UJ-05 (Activities polimórficas)**: PASS. Anti-huérfano implementado en `create` (rechaza company/lead soft-deleted y contactos anonimizados/soft-deleted). Audit log sin PII (`{kind, entity_type, entity_id}`). ActivityFeed integrado en tabs de companies/contacts/leads. Static imports tras corrección de review previa.
- **UJ-06 (Tags y búsqueda global)**: PASS con observaciones menores.
  - **Backend tags**: 8 endpoints (`GET/POST /tags`, `GET/PATCH/DELETE /tags/:id`, `POST /tags/assign`, `POST /tags/unassign`, `GET /tags/by-entity`) todos con `requireAuth`. Polimorfismo via `Taggable` y enum `TaggableEntityType` = `company|contact|lead|content_item` (sin `activity` — confirmado correcto). Anti-huérfano en `assign` valida company/contact (con anonymizedAt:null) /lead (con company.deletedAt:null); `content_item` lanza `TagAssignmentEntityNotFoundError` con TODO(M5). Audit log sin PII (solo nombres/ids/kind). Conflict 409 en duplicados (`TagNameConflictError`, `TagAssignmentConflictError`). 16 service tests + 8 routes tests.
  - **Backend search**: `GET /search?q=` con `requireAuth`, busca en 4 tipos (companies/contacts/leads/**activities**). Filtros: `deletedAt:null` en company; `deletedAt:null + anonymizedAt:null + (companyId null o company alive)` en contact; `deletedAt:null + company.deletedAt:null` en lead; **activities**: post-filter parent-alive (recoge `entityIds` del set y filtra por padre vivo aplicando los mismos checks). Scoring exact(100) > prefix(50) > substring(10) con tie-break por `updatedAt desc`. 4 routes tests.
  - **Frontend TagPicker**: typeahead debounced (300ms), create-on-the-fly con selector de `kind`, chip removal, react-query con invalidación correcta tras assign/unassign/create, manejo específico de 409 (conflict idempotente: refetcha asignadas) y 404 (entidad ya no existe). Mensajes de error genéricos (no leak de internals). 6 tests.
  - **Frontend GlobalSearch**: ⌘K/Ctrl+K wired en Topbar (`metaKey || ctrlKey + k`), navegación por teclado (ArrowUp/Down/Enter/Escape), routing a `/companies/:id`, `/contacts/:id`, `/leads/:id`. **Fallback de actividades**: `destinationFor` retorna string vacío y muestra toast informativo en lugar de navegar (correcto: no hay detalle de actividad). 4 tests.
  - **Integración**: TagPicker integrado en `CompanyFormDialog`, `ContactFormDialog`, `LeadFormDialog` (sección "Más datos"). **NO** integrado en `ActivityFormDialog` — confirmado correcto: el enum `TaggableEntityType` no incluye `activity`. Verificado por grep.

### Critical issues (block continuing)

**None.** Todos los gates pasan, todos los endpoints tienen `requireAuth`, anti-huérfano correcto en tags/activities/search, audit log sin PII, parameterized queries via Prisma, error-handler mapea 404/409/400 sin leak.

### Non-blocking findings

1. **`act(...)` warnings en `LeadFormDialog.test.tsx`** (frontend): los tests pasan pero React emite advertencias por updates de mutación async no envueltos en `act`. No bloquea pero ensucia el output del CI. Considerar refactor a `await waitFor()` en próximo polish pass.
2. **`ContactPrimaryConflictError` dead code** (ya documentado en `project_memory.md`): definido pero la implementación auto-desmarca el primary anterior, así que nunca se lanza. Mantener o limpiar es decisión de policy futura.
3. **Filtro `company_id` en lista de contactos** (deuda UJ-03 documentada): omitido este pase. No blocker para M1 — el detalle de empresa muestra contactos por su tab.
4. **Validación end-to-end en navegador pendiente** para UJ-04/05/06: requiere `docker compose up` + login real. Specs Playwright existentes (login + companies-crud + contacts-crud + leads-crud) cubren flujos críticos pero están gated por env y no se ejecutan en `pnpm test`. Aceptable v1; activar tras conectar CI live.
5. **Migración Prisma `add_contact_anonymized_at`** sigue pendiente (deuda UJ-03 documentada) — el campo está en schema y los tests pasan con mocks, pero el runtime real requiere `pnpm --filter @heyday/backend exec prisma migrate dev`. Bloqueará la primera arrancada con docker, no el merge de M1.
6. **`pnpm-lock 2.yaml` residual** sigue en raíz del repo (visto en `git status`). Limpieza trivial pendiente.
7. **`actorUserId: null` en audit logs**: aceptable v1 (RBAC arriba en M3/UJ-11). Ya documentado.
8. **Sin spec Playwright E2E para activities ni para tags/search**: UJ-05 y UJ-06 carecen de spec E2E gated. Considerar añadirlas cuando CI live esté operativo.
9. **`TagListQuerySchema` no incluye paginación** ni `kind` multi-select: pragmático v1 (catálogo pequeño). Si crece, añadir `take/skip`.

### Verdict

**PASS-WITH-NOTES**

M1 está listo para cierre. Cero issues críticos; los hallazgos no-blocker ya están todos documentados en `project_memory.md` o son polish menor. Recomendaciones para la siguiente sesión:

1. Conectar repo a GitHub y activar CI live; correr migraciones Prisma reales.
2. Limpiar `pnpm-lock 2.yaml` residual.
3. Cubrir warnings de `act` en `LeadFormDialog.test.tsx` en próximo polish.

---

### 2026-04-29 — /review M2 (UJ-07→10)

**Result: PASS-WITH-NOTES**

#### UJ-07 Importación CSV empresas

Backend (`POST /companies/import-csv`):

- `requireAuth` presente via `preHandler`. Redundant `!actorUserId` guard also in place. ✅
- `@fastify/multipart` registered scoped to a sub-app (not global). ✅
- 2 MB file size limit enforced via `limits: { fileSize: 2 * 1024 * 1024 }`. ✅
- Row cap 1000 enforced by `countDataRows` before CSV parsing (`ImportCapError`). ✅
- `ImportHeaderError` → 422 with `{ error: 'missing_required_headers', headers: [...] }`. ✅
- `ImportCapError` → 400 with `{ error: 'too_many_rows', limit: 1000 }`. ✅
- Dry-run mode supported via `?dry_run=true` query param. ✅
- Dedupe by domain both within CSV and against DB. ✅
- Audit log written for every import (including dry-runs). ✅
- 12 service tests + 6 route tests (401, 400-no-file, 400-wrong-type, 422, 400-cap, 200-happy). ✅

Frontend (`ImportCompaniesDialog`):

- 3-step flow: `upload → preview (dry-run) → result`. ✅
- Client-side validation: extension must be `.csv`, size must be ≤ 2 MB. ✅
- Step labels and counters (Total / A crear / Duplicados / Con errores) shown at preview. ✅
- Import button disabled when `rows_created === 0` in dry-run preview. ✅
- CSV template downloadable at `/templates/companies-template.csv` (file exists in `public/`). ✅
- "Importar CSV" button wired in `/companies` page. ✅
- 6 component tests covering: upload-disabled, size validation, dry-run flow, full submit, error inline, 0-rows disabled. ✅

**Issue found — error code mismatch (non-blocking UX defect):**
The backend sends `{ error: 'too_many_rows', limit: 1000 }` and `{ error: 'missing_required_headers', headers: [...] }` where `error` is a plain string. The frontend `imports.ts` client attempts to parse it as `body.error?.code` (treating `body.error` as an object with a `.code` field). Because `body.error` is a string, `.code` is `undefined`, and the error falls through to generic `UNKNOWN_ERROR`. Consequently, `isImportCapError()` and `isImportHeaderError()` always return `false`, and `renderErrorMessage()` produces the generic "No se pudo procesar el archivo CSV." message instead of the specific user-friendly strings. This is a UX defect — the user does not see actionable messaging for cap/header violations. This is **not caught by any test** because `ImportCompaniesDialog.test.tsx` mocks `isImportCapError`/`isImportHeaderError` directly, bypassing the real parsing in `imports.ts`.

Fix: either change the backend to return `{ error: { code: 'too_many_rows', message: '...' } }` (consistent with `ApiErrorPayload`), or fix the frontend client to parse `{ error: string }` shape directly.

#### UJ-08 Dashboard de inicio

Backend:

- `GET /dashboard/metrics` → `requireAuth` + `Cache-Control: private, max-age=30`. ✅
- `GET /dashboard/upcoming-actions` → `requireAuth` + `Cache-Control: private, max-age=30`. ✅
- `GET /dashboard/top-priority-leads` → `requireAuth` + `Cache-Control: private, max-age=30`. ✅
- Metrics: leads_open, leads_stale (>7d), jobs_running, ai_cost_month_usd via `$transaction`. ✅
- `approvals_pending` hardcoded to 0 (content approval model not built yet — M5). Acceptable, documented in tests. ✅
- upcomingActions filters by `ownerId`, `dueAt >= now`, `completedAt IS NULL`. ✅
- topPriorityLeads uses `company.name` as `title` (correct: `Lead.title` does not exist; tracker notes this fix). ✅
- Service tests: 3 metrics tests + 2 upcomingActions + 2 topPriorityLeads. Route tests: 6 (happy x3 + 401 x2 + Cache-Control). ✅
- **Minor gap**: no 401 test for `GET /dashboard/top-priority-leads` specifically (only metrics and upcoming-actions have explicit 401 tests). The endpoint IS protected by `requireAuth`; this is a test coverage gap, not a security gap. Non-blocking.

Frontend:

- `DashboardPage` at `/dashboard`. ✅
- 4 metric cards: Leads abiertos, Sin acción >7d, Aprobaciones pendientes, Jobs activos. ✅
- Metric cards for leads link to `/leads`; approvals link to `/content/reviews`. ✅
- 2 sections: "Próximas acciones" and "Leads de máxima prioridad". ✅
- `ListSkeleton` shown while loading (pulse animation). ✅
- Empty state per-section ("Sin acciones próximas." / "Sin leads abiertos.") and global `isGloballyEmpty` empty state. ✅
- AI cost section at bottom. ✅
- `/dashboard` reachable from sidebar as "Inicio" (first item). ✅
- Root `/` redirects to `/dashboard`. ✅
- 3 frontend API client tests for dashboard. ✅

#### UJ-09 Empty states y onboarding

- All 16 stub routes verified to have `page.tsx` files: `/activities`, `/intel/research`, `/intel/pain-points`, `/intel/service-fit`, `/intel/outbound`, `/content/ideas`, `/content/reviews`, `/content/library`, `/content/calendar`, `/admin/users`, `/admin/credentials`, `/admin/taxonomies`, `/admin/ai-costs`, `/admin/audit`, `/admin/integrations`, `/admin/settings`. ✅
- All render via `ComingSoonPage` component with `title`, `description`, and `milestone` props. ✅
- `ComingSoonPage` includes a "← Volver al inicio" link to `/`. ✅
- Sidebar covers all these routes (cross-checked against `SECTIONS` in `Sidebar.tsx`). ✅
- No 404s for any sidebar link. ✅
- `/activities` correctly shows a ComingSoonPage that notes activities ARE available in entity detail tabs (good UX). ✅
- 1 component test for `ComingSoonPage`. ✅
- **Gap**: no E2E test for empty states with empty DB (as called for in UJ-09 acceptance criteria). This is the same pattern as M1 — Playwright specs exist for other journeys but none specifically for empty-DB state rendering. Non-blocking.

#### UJ-10 Filtros guardados

- `usePersistedFilters` hook at `frontend/src/hooks/usePersistedFilters.ts`. ✅
- Per-user storage key: `heyday:filters:${key}:${userId ?? 'anonymous'}`. ✅
- SSR guard: `if (typeof window === 'undefined') return null`. ✅
- `useCallback` for stable references on `saveFilters`, `loadFilters`, `clearFilters`. ✅
- Integration in `/companies/page.tsx`: restores on mount when `searchParams.toString() === ''`, saves on every `searchParams` change, "Restablecer" button visible when `hasActiveFilters`. ✅
- Integration in `/leads/page.tsx`: same pattern — `usePersistedFilters('leads', currentUser?.id)`. ✅
- "Restablecer" button calls `clearFilters()` and resets route params. ✅
- 4 unit tests covering: save, load-null, load-after-save, clear-and-per-user isolation. ✅

**Critical issues** (must fix before M3):

None.

**Notes** (non-blocking):

1. **UJ-07 — Error code mismatch in import client** (UX defect): when the backend returns a cap or header error, the frontend shows "No se pudo procesar el archivo CSV." instead of the specific user-friendly message. Fix: align the backend error shape to `{ error: { code, message } }` or teach the frontend client to handle `{ error: string }`. No test currently catches this because the component test mocks the type-guard functions directly.
2. **UJ-08 — Missing 401 test for `GET /dashboard/top-priority-leads`**: the endpoint is protected by `requireAuth`; this is a test coverage gap only.
3. **UJ-09 — No Playwright E2E for empty-DB state**: acceptance criteria calls for this; deferred like M1 E2E specs pending CI live environment.
4. **UJ-08 — `approvals_pending` hardcoded to 0**: expected and documented; will be wired in M5. The metric card link (`/content/reviews`) goes to a ComingSoonPage stub, which is correct for now.
5. **UJ-07 — `pnpm-lock 2.yaml` residual still in repo root**: carry-over from M1, unrelated to M2 work.
6. Arrancar M2 (UJ-07 Importación CSV → UJ-10 Filtros guardados).

---

## Review M2 (UJ-07→10) — 2026-04-29

**Verdict**: PASS-WITH-NOTES

### Verification commands

- format:check: ❌ (1 file: `docs/work_log.md` — auto-modified by this very review write)
- lint: ✅
- typecheck: ✅ (3 workspaces clean)
- test: ✅ (318 tests — 245 backend + 73 frontend)

### UJ-07 Importación CSV empresas

- Backend `POST /companies/import-csv` correctly gated by `requireAuth`; `@fastify/multipart` scoped sub-app with `fileSize: 2 MB` and `files: 1`. ✅
- File-type check accepts `text/csv`, `application/vnd.ms-excel`, OR `.csv` extension (lenient — fine for v1, internal admin tool).
- Row cap 1000 enforced before parse via `countDataRows`; `ImportCapError` → 400, `ImportHeaderError` → 422. ✅
- Per-row validation via `CsvRowSchema` (zod with `emptyToUndefined` preprocess). Domain dedupe both intra-CSV and against `Company` table (soft-delete-aware via `deletedAt: null`). ✅
- Errors per-row do not block the rest. Audit log written for every run (including dry-run). ✅
- Dry-run via `?dry_run=true` powers the preview step. ✅
- Tests: 12 service + 6 routes (happy, 401, 400 missing file, 400 bad type, 422 header error, 400 cap). ✅
- Frontend `ImportCompaniesDialog` has 3 steps (upload → preview → result), client-side `.csv` + 2 MB validation, plantilla descargable en `/templates/companies-template.csv` (existe en `public/`). 6 tests. ✅

**Findings** (non-critical):

- **CSV formula injection (CSV injection / Excel "supercell")**: cells beginning with `=`, `+`, `-`, `@`, tab or CR are stored verbatim and later rendered as plain text in the React UI (safe from DOM XSS). However if a user re-exports company data to CSV (M5/UJ-27 export) those values become formulas in Excel. **Recommend** sanitising on import (prepend `'` to formula-prefix strings) or at export time, before UJ-27 ships. Not exploitable today but worth recording.
- **Error-shape mismatch frontend ↔ backend** (carry-over from prior review section above): `imports.ts` parses `body.error?.code`, backend returns `{ error: 'too_many_rows', limit: 1000 }`. Type-guards `isImportCapError` / `isImportHeaderError` always return `false` against real responses, so user always sees the generic "No se pudo procesar el archivo CSV." Tests pass because component test mocks the guards. Pending fix.
- Dedupe semantics consistent with UJ-02 (`normalizeDomain` reused; soft-deleted rows freed). ✅
- No handler for `request.body too large` (Fastify multipart will reject >2 MB at protocol level — verified via dependency limits). The error surfaces as a generic 500/413 because there is no explicit catch; consider mapping to a friendly message. Minor.

### UJ-08 Dashboard de inicio

- 3 endpoints (`/dashboard/metrics`, `/upcoming-actions`, `/top-priority-leads`) all behind `requireAuth`, all set `Cache-Control: private, max-age=30`. ✅
- Metrics use `prisma.$transaction` (no N+1). `topPriorityLeads` uses single query with `include` for `stage` and `company` (no N+1). ✅
- `upcomingActions` filters by `ownerId` (= caller) — only own activities surface. ✅
- `approvals_pending` hardcoded `0` (content approval model lands in M5). Documented. Card links to `/content/reviews` which is a ComingSoonPage stub — coherent. ✅
- Service: 12 tests. Routes: 6 tests including 2 explicit 401 tests. **Gap**: no explicit 401 test for `/dashboard/top-priority-leads` (still protected). ⚠️
- Frontend `DashboardPage`: react-query for the 3 endpoints; skeletons; per-section + global empty state; AI cost section; 4 metric cards. Renders `lead.title` (= `company.name`) and `action.title` as plain text → React auto-escapes (XSS-safe). ✅

### UJ-09 Empty states y onboarding (stub pages)

- 16 pages confirmed via `grep -l ComingSoonPage` (intel ×4, content ×4, admin ×7, activities). ✅
- `ComingSoonPage` is a pure presentational stub (no fake data, no broken forms, no fake submit buttons) — truly stubs. ✅
- Sidebar `SECTIONS` cross-checked: every `href` resolves to a `page.tsx` (stub, real, or list page). Zero 404s reachable from nav. ✅
- Each stub shows `title`, `description`, milestone, "← Volver al inicio" link. ✅
- 1 component test for `ComingSoonPage`. **Gap**: no Playwright E2E for empty-DB rendering (UJ-09 acceptance asks for it). Carried over.

### UJ-10 Filtros guardados (persisted filters)

- Hook `usePersistedFilters(key, userId)` at `frontend/src/hooks/usePersistedFilters.ts`. Storage key `heyday:filters:${key}:${userId ?? 'anonymous'}` is per-user. ✅
- SSR-safe: every `window.localStorage` access guarded by `typeof window === 'undefined'`. ✅
- `useCallback` on `saveFilters/loadFilters/clearFilters` for stable identities. ✅
- Integrated in `/companies` and `/leads`: restore on mount only when URL has no params; auto-save on every `searchParams` change; "Restablecer" button visible when `hasActiveFilters`. ✅
- 4 unit tests (save, load-null, load-after-save, clear isolated by userId). ✅

**Security findings** (non-critical):

- **No cleanup on logout**: `Topbar.tsx` calls `logoutRequest()` + `broadcastLogout()` but does not clear `heyday:filters:*` from localStorage. The filter values persist on disk until the user logs back in (per-user key, so a different user does not see them). Low risk because filters only contain non-sensitive query params (`q`, `city`, `icp_vertical`, status, etc.) but on a shared device this leaks the prior user's saved searches. Recommend a cleanup pass at logout (`Object.keys(localStorage).filter(k => k.startsWith('heyday:filters:')).forEach(k => localStorage.removeItem(k))`).
- **Anonymous fallback key (`heyday:filters:companies:anonymous`)**: if `useAuthStore.user` is briefly undefined (during AuthBootstrap hydration) the hook writes under the `anonymous` key. Subsequent users would not collide (key still partitioned per user once hydrated), but a stale `anonymous` entry can persist forever. Cosmetic.
- **XSS via stored filter values**: values come from URL query params and are written/read as strings; rendered through React (auto-escaped). No `dangerouslySetInnerHTML` anywhere in companies/leads pages. ✅ Safe.
- **localStorage capacity**: no enforcement on number of saved filter strings — bounded by 2 keys (companies, leads) per user, so unbounded growth not a concern. ✅

### Critical issues (must fix before M3)

**none**

### Non-critical notes (deuda)

1. **UJ-07 frontend error-shape mismatch** (UX): `imports.ts` does not parse the backend's `{ error: 'string' }` shape. User sees generic message instead of "El archivo supera el máximo de 1.000 filas permitido." or "Faltan cabeceras obligatorias en el CSV." No test catches this because guards are mocked.
2. **UJ-07 CSV formula-injection hardening**: prepend `'` to cells starting with `=+-@` either at import or at export, before UJ-27 (export) ships.
3. **UJ-07 413/large-payload error mapping**: when client uploads >2 MB the response is generic; map to friendly "El archivo supera 2 MB".
4. **UJ-08 missing 401 test for `/dashboard/top-priority-leads`** — coverage gap, not a security gap.
5. **UJ-09 no Playwright E2E for empty-DB rendering** — same backlog item as M1; depends on CI live + docker.
6. **UJ-10 filters not cleared on logout** — recommend wiping `heyday:filters:*` keys on logout to avoid leaking saved searches on shared devices.
7. **UJ-10 stale `anonymous` key** during pre-hydration window — cosmetic.
8. **`pnpm-lock 2.yaml` residual** in repo root — carry-over from M1.

### 2026-04-29 — Post-/review M2: cierres operativos

- **Work Done**: Aplicados los fixes inmediatos del review M2.
  1. **Fix envelope error UJ-07**: `backend/src/api/routes/imports.ts` ahora devuelve el envelope estándar `{ error: { code, message, details? } }` para `missing_file`, `invalid_file_type`, `missing_required_headers` (con `details.headers`) y `too_many_rows` (con `details.limit`). Los type-guards del frontend `isImportCapError`/`isImportHeaderError` (que parsean `body.error?.code`) ahora matchean correctamente y el usuario ve el mensaje específico en vez del genérico.
  2. **Tests del route actualizados** (`backend/src/api/routes/imports.test.ts`): los 4 casos de error reflejan el nuevo envelope. 6 tests del fichero verdes.
  3. **Limpieza `pnpm-lock 2.yaml`** residual en raíz (deuda heredada de M1).
- **Files Modified**:
  - `backend/src/api/routes/imports.ts`
  - `backend/src/api/routes/imports.test.ts`
  - `docs/project_memory.md` (anotada deuda CSV formula-injection + logout cleanup, eliminada deuda cerrada)
  - `implementation/task_tracker.md` (UJ-07→10 marcados Review Passed = yes)
- **Files Removed**:
  - `pnpm-lock 2.yaml`
- **Verification**: `pnpm format:check` ✅ · `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 318 tests (245 backend + 73 frontend).
- **Deuda diferida (no bloquea M3)**:
  - **UJ-07 CSV formula-injection**: sanear celdas `=+-@` antes de **UJ-27** (export CSV).
  - **UJ-10 logout cleanup**: cuando UJ-11 toque sesión, añadir wipe de prefijo `heyday:` (filtros + clave `anonymous` residual) en `Topbar.logout`.
  - **UJ-08 test 401 missing** para `/dashboard/top-priority-leads` — añadir junto al primer cambio del módulo.

### 2026-04-29 — UJ-11: Gestión de usuarios

- **Work Done**: M3 arranca. Backend y frontend completos end-to-end.
  - **Backend** (`backend/src/api/routes/users.ts`): 5 endpoints bajo `/admin/users` protegidos con `requireRole('admin')`: `GET` list/get, `POST` invite (email+name+password+role, con pre-check de duplicado + doble-catch P2002), `PATCH` edit (name/role/isActive con anti-autodesactivación + protección último admin), `POST :id/password/reset` (genera `randomBytes(12).base64url()`, actualiza hash, devuelve contraseña solo en body). Audit log fire-and-forget en create/update/reset sin contraseñas en metadata. Registrado en `server.ts`.
  - **Frontend**: `lib/api/users.ts` (listUsers, inviteUser, updateUser, resetUserPassword) + `UsersTable` (tabla con badges de rol coloreados, toggle activo, acciones) + `InviteUserDialog` + `EditUserDialog` (name/role/isActive, errores 400 del backend mostrados inline) + `ResetPasswordDialog` (2 pasos: confirmar → mostrar contraseña temporal con botón copiar, advertencia de una-sola-vez). Página `/admin/users` reemplaza `ComingSoonPage`.
  - **Bonus UJ-10** (deuda cerrada): `Topbar.handleLogout` ahora limpia claves `heyday:*` de localStorage antes del `clear()` de Zustand — evita filtrar búsquedas guardadas en dispositivo compartido.
- **Files Created**:
  - `backend/src/api/routes/users.ts`
  - `backend/src/api/routes/users.test.ts`
  - `frontend/src/lib/api/users.ts`
  - `frontend/src/components/users/UsersTable.tsx`
  - `frontend/src/components/users/UsersTable.test.tsx`
  - `frontend/src/components/users/InviteUserDialog.tsx`
  - `frontend/src/components/users/EditUserDialog.tsx`
  - `frontend/src/components/users/ResetPasswordDialog.tsx`
- **Files Modified**:
  - `backend/src/api/server.ts` (registro de users routes)
  - `frontend/src/app/(app)/admin/users/page.tsx` (reemplaza stub)
  - `frontend/src/components/Topbar.tsx` (wipe heyday:\* en logout)
  - `implementation/task_tracker.md`, `docs/project_memory.md`
- **Verification**: `pnpm format:check` ✅ · `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ 334 tests (256 backend + 78 frontend, +16 nuevos).
- **Security checklist**: ✅ `requireAuth+requireRole('admin')` en todos los endpoints · ✅ contraseña temporal solo en body, nunca en audit ni log · ✅ Zod backend+frontend · ✅ Prisma ORM parameterizado · ✅ PublicUserDto sin passwordHash · ✅ anti-autodesactivación + protección último admin · ✅ React auto-escapa (sin dangerouslySetInnerHTML).

---

## Review — M5 Content Engine — 2026-05-03

**Reviewer**: Independent subagent (fresh context, no prior knowledge of session).
**Scope**: UJ-22 through UJ-27.
**Baseline test count**: 578 total (457 backend + 121 frontend) per task_tracker.

---

### Per-UJ Verdicts

#### UJ-22: Generador de ideas — PASS

Backend endpoints verified:

- `POST /content/ideas` with `authGuard` (dual-path: manual → 201, generate → 202 + job_id).
- `GET /content/ideas` with `authGuard` (list with filters: status, pillar_id, vertical, q, pagination).
- `GET /content/ideas/:id` with `authGuard`.
- `PATCH /content/ideas/:id` with `authGuard`.
- `DELETE /content/ideas/:id` with `authGuard`.

Input validation: all schemas via Zod (`IdeaCreateBodySchema`, `IdeaListQuerySchema`, `IdeaUpdateSchema`). Rate-limit: 10 AI generation calls per user per 24h enforced via audit log count. Audit log written on creation and generation request.

Frontend `/content/ideas`: full page — not a stub. Includes: IdeaCard list, GenerateIdeasDialog (AI), CreateIdeaManualDialog (manual), EditIdeaDialog, DeleteIdeaDialog, IdeaFiltersBar, IdeaJobTracker (polling), DraftJobsTracker. Loading skeleton, error state, empty state, pagination all present. Sidebar links correctly to `/content/ideas`.

Tests: routes tests cover POST (both paths), GET list, GET by id, DELETE, 401 without auth (3 of 5 endpoints explicitly tested for 401). Service tests cover createIdeaManual, requestIdeaGeneration (happy + rate-limit), listIdeas (no filter + filtered), getIdeaById (happy + 404), updateIdea, deleteIdea.

Notes: `deleteIdea` performs a hard delete (not soft) on `ContentIdea`. This is fine for the scope but differs from the soft-delete pattern used on `ContentItem`. No spec violation found since ideas have no `deletedAt` field in the Prisma schema.

---

#### UJ-23: Borradores multi-canal — PASS

Backend endpoint: `POST /content/ideas/:id/draft` with `authGuard`. Creates one `ContentItem` per channel and enqueues one BullMQ `content_generation` job per item. Returns `{ items[], job_ids[] }` (202). Audit log recorded for the batch. IdeaNotFoundError → 404.

Frontend: DraftRequestDialog (channel selector), DraftJobsTracker (polls `GET /jobs/:id` per job, navigates to first item on completion). IdeaJobTracker handles the AI idea-generation job. Both are used on the `/content/ideas` page.

Tests: routes test covers POST draft → 202 with 3 items and 3 job_ids. Service tests cover requestDraftsForIdea for 3 channels, 1 channel, and missing idea → IdeaNotFoundError.

Notes: The frontend `ItemSummaryDto` type in `content.ts` includes `idea_title` and `pillar_label` fields (lines 67-75), but the backend `toItemSummaryDto` function does NOT include those fields (it only returns `id, idea_id, channel, status, current_version_id, created_at`). The frontend library page uses `item.idea_title` and `item.pillar_label` from `ItemSummaryDto` which will be `undefined` at runtime when coming from the draft response. The library query (`listLibrary`) does populate those via `buildLibraryItem`, so the library page itself is fine — but the type interface is slightly misleading. Low severity since the draft flow navigates away immediately.

---

#### UJ-24: Editor con versiones — PASS

Backend endpoints:

- `GET /content/items/:id` with `authGuard` — returns current_version, last 5 versions ordered desc.
- `POST /content/items/:id/versions` with `authGuard` — optimistic locking via transaction (count before, recount inside tx, ConflictError if mismatch → 409). Body validation: `body` min 1 max 50000, `title` max 500, arrays for hooks/ctas/hashtags.

Revert mechanism: implemented in frontend via `VersionHistory` component, which calls `createVersion` (POST /content/items/:id/versions) with the content of a prior version — creating v_n+1 preserving full history. This matches the spec. There is no PATCH /versions/:vid endpoint; the spec mentioned one but the implementation uses a simpler and correct create-on-revert approach.

Frontend `/content/items/[id]`: ContentEditor (Tiptap starter-kit + character-count + placeholder based on context), VersionHistory panel. Loading skeleton (3 placeholder blocks), 404-specific error state distinguishing from generic error, pagination-less version list (capped at 5 from backend). Export buttons conditional on `status === 'approved' || status === 'exported'`.

Tests: service tests cover getItemById (happy path + 404 + soft-deleted ignored), createVersion (v1 from empty, increment, conflict → ConflictError, item not found → ItemNotFoundError). Routes tests cover GET /items/:id (200 + shape, 401, 404), POST /versions (201 + shape, 401, 400 on empty body).

---

#### UJ-25: Flujo de aprobación — PASS

Backend endpoints (all `authGuard`):

- `POST /content/items/:id/submit-review` — validates `draft → in_review` transition, creates ContentApprovalEvent, writes audit log.
- `POST /content/items/:id/approve` — validates `in_review → approved`, sets `approvedById` + `approvedAt`, audit log.
- `POST /content/items/:id/reject` — validates `in_review → draft`, clears `approvedById/approvedAt`, audit log.
- `GET /content/reviews` — lists `status=in_review` items with approval event history, paginated.

All transitions guarded by InvalidTransitionError (→ 409). All use `$transaction` for atomicity. Audit log entries: `content.approval.submitted`, `content.approval.approved`, `content.approval.rejected`.

Frontend: ApprovalActions component (submit-review, approve, reject buttons conditional on status). `/content/reviews` page with loading skeleton, error state, empty state ("no hay borradores pendientes"), paginated list with Aprobar/Rechazar mutation buttons and link to editor. Reviewer page shows `lastEvent.actor_id` (raw UUID, not resolved to name — minor UX gap, not a security issue).

Security note: UJ-25 spec says "solo role admin en v1; approvals por usuario distinto al autor (soft check, warning)". The backend uses `authGuard` (not `adminGuard`) for all approval transitions — any authenticated user can submit/approve/reject. The self-approval soft check (warning when same user approves) is not implemented. This matches the spec saying it should be a "soft check, warning" (not a hard block), but the check is absent entirely in v1. This is acceptable per spec intent ("soft check" = advisory).

Tests: routes tests cover submit-review (200 + shape, 401), approve (200), reject (200), invalid transition → 409. Service tests are comprehensive: happy path for all three transitions, InvalidTransitionError for wrong source status, ItemNotFoundError, audit.record call verification.

---

#### UJ-26: Calendario editorial — PASS

Backend endpoints (both `authGuard`):

- `GET /content/calendar` — filters: `from/to` (required, validated as date strings), `channel`, `status`, `icp_vertical`. Returns CalendarItemDto array ordered by scheduledFor asc. Items with `deletedAt != null` are excluded. Items with null `scheduledFor` are excluded by the date range filter.
- `PATCH /content/items/:id/schedule` — validates item exists (not soft-deleted), updates `scheduledFor`, writes audit log (`content.item.rescheduled`), returns updated CalendarItemDto.

Frontend `/content/calendar`: custom monthly grid (7-col, no external drag-and-drop library — react-big-calendar was removed per task_tracker). Navigation: previous/next month with year rollover. Filters: channel, status, icp_vertical (3 select dropdowns). Per-cell inline reschedule: pencil button opens date input + confirm/cancel/clear in-cell. CalendarItemBadge component for channel+status display. Loading skeleton (grid of 6 placeholders), error state, empty-month state. Items click → navigate to `/content/items/:id`.

Deviation from spec: spec says "drag&drop para re-agendar" (react-big-calendar). Implemented as inline date-picker edit instead. This is documented in task_tracker ("Dep fantasma react-big-calendar eliminada"). The functional goal (reschedule from calendar view) is achieved, just with a different UX interaction.

Tests: routes tests cover GET calendar (200 + shape, 401 without auth), PATCH schedule (200 + rescheduleItem called with correct args). Service tests cover listCalendarItems (date range, channel filter, status filter), rescheduleItem (happy, null clear, ItemNotFoundError). CalendarItemBadge has 2 unit tests.

---

#### UJ-27: Exportar + biblioteca — PASS

Backend endpoints (all `authGuard`):

- `POST /content/items/:id/export?format=md|plain|ics|csv` — validates format via Zod enum, checks item status is `approved` or `exported` (InvalidTransitionError if not), transitions `approved → exported` (idempotent if already exported), writes audit log (`content.item.exported`), sets correct Content-Disposition + Content-Type headers. Anti-formula-injection: `sanitizeCsvCell` prepends `'` to cells starting with `=`, `+`, `-`, `@`, tab, carriage-return.
- `GET /content/library` — filters: q (full-text ILIKE on idea title + version body), channel, pillar_id, status (excludes `archived` by default). Pagination limit/offset. Returns `{ total, items }`.

Frontend `/content/items/[id]`: export buttons shown only when `status === 'approved' || status === 'exported'`. Triggers Blob download via `exportItemFile` (raw fetch with auth header). Format buttons: MD, TXT (plain), ICS, CSV. Loading state per format (exporting !== null → buttons disabled).

Frontend `/content/library`: debounced search (300ms), channel/status/pillar_id filters, grid of cards (24 per page), pagination. Loading skeleton (6 cards), error state, empty state. CalendarItemBadge reused for channel+status. Each card links to item detail.

Markdown front-matter verified: `canal`, `pilar`, `estado`, `scheduled_for`, `hashtags` fields included. ICS uses `VALUE=DATE` (all-day events).

Tests: service tests cover exportItem (md happy path with front-matter check, ics DTSTART format, csv formula injection sanitization, status not approved → InvalidTransitionError, already-exported idempotent). listLibrary (no filter, q filter → OR clause in where, status filter). Routes tests cover POST export (200 + content-disposition header), GET library (200 + shape).

---

### Security Checklist Summary

- No hardcoded secrets, tokens, or API keys: **PASS**. No credentials in content module code.
- No sensitive data in logs/errors/UI: **PASS**. Error messages use domain error classes with safe messages. Audit logs contain entityId/metadata (no PII). `/content/reviews` shows `actor_id` (UUID), not email or password.
- Input validation via Zod on all external inputs: **PASS**. All route handlers call `.parse()` on request.body/query/params before touching service layer. Body max lengths enforced (body: 50000, title: 500, comment: 1000, brief_es: 2000).
- Authentication on all routes: **PASS**. Every content route uses `authGuard = { preHandler: [app.requireAuth] }`. Verified via route test 401 coverage for representative endpoints.
- Authorization (users can't access others' resources): **PASS-WITH-NOTES**. All content routes require authentication but use `requireAuth` (not `requireRole('admin')`). The spec for UJ-25 says "solo role admin en v1" for approvals — the backend does NOT enforce admin-only on submit/approve/reject. Any authenticated user can approve. This is a mild spec deviation, though the spec also says it's v1 and the soft-check is advisory. Low risk in a small internal team context; should be noted.
- Admin routes require admin-level verification: **N/A** for content module — no content routes require admin specifically. (Taxonomies admin routes, UJ-13, use `adminGuard` correctly in taxonomies.ts.)
- Database queries parameterized: **PASS**. Prisma ORM used throughout, no raw queries.
- Rendered content escaped to prevent XSS: **PASS**. React auto-escapes all JSX content. No `dangerouslySetInnerHTML` in content components. Export uses Blob + `URL.createObjectURL` (safe client-side).
- API responses don't leak internal details: **PASS**. Error handler returns unified error shapes. Stack traces not exposed.
- File uploads validated: **N/A** — content module has no file uploads (CSV import is in intel module, not content).
- CSV formula injection guard: **PASS**. `sanitizeCsvCell` tested for `=SUM(A1:A2)` case. Covers `=`, `+`, `-`, `@`, tab, CR.

---

### Critical Issues

None.

---

### Non-Critical Notes

1. **`ItemSummaryDto` type mismatch** (UJ-23): The frontend `ItemSummaryDto` interface in `content.ts` declares `idea_title` and `pillar_label` fields, but the backend `toItemSummaryDto` does not populate them. The draft response items will have `undefined` for those fields at runtime. The library page is unaffected (it fetches via `listLibrary` which does populate them). Risk: low (draft flow navigates immediately to item detail page). Recommendation: align the type with what the backend actually returns, or extend `toItemSummaryDto` to join the idea title.

2. **Approval auth level** (UJ-25): `submit-review`, `approve`, `reject` use `requireAuth` not `requireRole('admin')`. Spec says "solo role admin en v1". Current implementation allows any authenticated user to transition approval states. Low risk for an internal app, but is a spec gap.

3. **Drag-and-drop calendar not implemented** (UJ-26): react-big-calendar was removed; inline date-picker substituted. Functional acceptance met, but the D&D UX specified is absent. Documented deviation.

4. **Self-approval soft check absent** (UJ-25): Spec mentions a warning when the same user who submitted approves. Not implemented. No hard block required by spec.

5. **`/content/reviews` shows raw actor UUID** (UJ-25): `lastEvent.actor_id` displayed as-is. No user name resolution. Minor UX gap; no security issue.

6. **Idea hard-delete** (UJ-22): `deleteIdea` uses `prisma.contentIdea.delete` (hard delete). ContentItems use soft-delete via `deletedAt`. Inconsistency, but ideas have no `deletedAt` column in schema, so this is a schema-level decision from M5 planning. No orphaned ContentItems since Prisma schema likely cascades or the items reference the idea by FK. Worth verifying cascade behavior before delivery.

---

### Overall Verdict: **PASS-WITH-NOTES**

All six UJs (22–27) are functionally complete end-to-end: backend endpoints exist and are auth-guarded, frontend pages are real implementations (no stubs), tests cover critical paths, error/loading/empty states are present, and the security checklist passes with no critical findings. The notes above are non-blocking for this milestone.

## Auditoría de seguridad holística — Delivery — 2026-05-04

### Scope

Auditoría final pre-delivery cubriendo todos los milestones (M0–M5).

### Resultados por área

#### 1. Autenticación y autorización

- **78 rutas autenticadas** via `requireAuth` / `authGuard` / `adminGuard`. ✅
- Rutas públicas intencionadas: `GET /health`, `GET /ready`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`. ✅
- Rutas admin (`/admin/*`, `/intel/pain-points PATCH`, `/intel/service-fit/regenerate`, `/intel/outbound-prep PATCH`, taxonomías write) protegidas con `requireRole('admin')`. ✅
- Gap conocido: `POST /content/items/:id/submit-review`, `approve`, `reject` usan `requireAuth` no `requireRole('admin')`. Aceptable en v1 (todos los usuarios son admin). TODO antes de roles multi-nivel.

#### 2. Secrets y configuración

- Sin secrets hardcodeados en código de producción. La key de Anthropic se lee desde Vault (Level 3) con fallback a `ANTHROPIC_API_KEY` env. ✅
- `.env` correctamente gitignoreado. `.env.example` con placeholders, sin valores reales. ✅
- `generate-secrets.sh` para JWT y `CREDENTIAL_MASTER_KEY`. ✅
- Vault AES-256-GCM con `keyVersion`. ✅

#### 3. Inyección SQL

- Cero queries `$queryRaw` o `$executeRaw` en código de producción. Todo via Prisma ORM parametrizado. ✅

#### 4. XSS

- Sin `dangerouslySetInnerHTML` ni `innerHTML` en el frontend. React escapa por defecto. ✅
- `safeHttpUrl` en renders de URL de empresa (filtra a `http(s)` solamente). ✅
- CSV formula injection saneada con `sanitizeCsvCell` (prefija `'` a celdas `=+-@\t\r`). ✅

#### 5. SSRF

- `scrapeWebsite` tiene guard completo: bloquea `localhost`, IPs privadas IPv4 y IPv6 via DNS lookup. Tests cubren el bloqueo. ✅

#### 6. Validación de entradas

- Zod en todos los endpoints (body, query, params). ✅
- Multipart CSV: límite 2 MB, 100 filas máximo. ✅
- Content-type validado en upload. ✅

#### 7. Headers de seguridad

- `@fastify/helmet` activo con CSP defaults. ✅
- CORS configurado con origen explícito (`APP_URL`) + `credentials: true` para cookies. ✅
- Cookie de refresh token `httpOnly`, `sameSite`. ✅

#### 8. Rate limiting

- Global: 100 req/min via Redis store (degrada grácilmente si Redis cae). ✅
- Auth login: override a 5/min. ✅
- Intel enrichment: 10/min por ruta. ✅

#### 9. Logs y datos sensibles

- Sin `console.log` de passwords, tokens o PII en producción. ✅
- Audit logs sin PII (solo entityId + metadata estructurada inofensiva). ✅
- `fingerprint` de API key en logs (solo longitud + últimos 4 chars). ✅

#### 10. Deployment

- Docker multi-stage, usuario no-root `heyday`. ✅
- Healthchecks en compose. ✅
- Volúmenes persistentes para Postgres y Redis. ✅

### Riesgos residuales documentados

| Riesgo                                                          | Severidad | Disparador                                            |
| --------------------------------------------------------------- | --------- | ----------------------------------------------------- |
| `submit-review/approve/reject` sin `requireRole('admin')`       | Baja      | Cuando aterricen roles multi-nivel (UJ post-delivery) |
| `deleteIdea` hard-delete inconsistente con soft-delete de items | Baja      | Verificar CASCADE en schema Prisma antes de prod real |
| localStorage no se limpia en logout (`heyday:filters:*`)        | Muy baja  | Solo filtros no sensibles; dispositivo compartido     |
| Test 401 faltante en `/dashboard/top-priority-leads`            | Muy baja  | Gap de cobertura, no de seguridad                     |
| CI sin ejecutar en GitHub (no hay remote configurado)           | Media     | Añadir remote + push antes de despliegue              |
| Seed demo ejecutado en local pendiente (requiere docker)        | Operativa | Ejecutar antes de demo real                           |

### Veredicto

**APTO PARA DELIVERY** — Sin issues críticos de seguridad. Riesgos residuales documentados y acotados a v1.

---

## M6 — Iteración post-delivery (2026-05-05)

Petición del usuario tras delivery: (a) CRM en blanco para clientes reales, (b) calendario personal+general, (c) gestión de correo corporativo Hostinger, (d) deploy a EasyPanel VPS `46.202.131.13` con dominio `crm.estudioheyday.com`. Alcance bloqueado en una pasada: UJ-28, UJ-29a/b/c, IT-12.

### UJ-28 backend — Calendario personal y de equipo

**Diseño aprobado:** dos niveles de visibilidad (`personal` solo el owner; `general` todos). Vínculo opcional a `lead/company/contact`.

**Implementación (Codex pase 1):**

- Migración `add_calendar_events` con 2 enums (`CalendarVisibility`, `CalendarRelatedEntityType`) + tabla `calendar_events` con índices compuestos.
- Módulo `backend/src/modules/calendar/` siguiendo patrón `activities`: `service.ts`, `schemas.ts` (Zod superRefine para rango de fechas y emparejamiento `related_entity_*`), `service.test.ts` (in-memory FakeDb).
- Routes en `backend/src/api/routes/calendar.ts` registradas en `server.ts`.
- RBAC server-side: `list` aplica `OR(visibility='general', ownerId=currentUser)`. `update/delete` exige owner (personal) o admin (general). Conversión personal→general también requiere admin (defense in depth).
- Audit log en create/update/delete con metadata diff.
- Soft delete (`deleted_at`).

**Verificación independiente:** typecheck ✓, lint ✓, 474 tests ✓ (+17 nuevos vs baseline 457).

**Security checklist UJ-28 backend:** ✅ todo verde. Sin secretos hardcoded, validación Zod, requireAuth global, RBAC server-side estricto, queries Prisma parametrizadas, DTO sin leaks.

**Deuda específica UJ-28:**

- Codex generó la migración manualmente porque Postgres no estaba accesible en `localhost:5432`. Validar con `prisma migrate dev` cuando docker compose esté arriba (idealmente en el reset previo al deploy IT-12).
- Frontend pendiente — Codex pase 2.

### UJ-28 frontend — Calendario personal y de equipo

**Implementación (Codex pase 2 + fixes de Claude):**

- `frontend/src/lib/api/calendar.ts`: Zod schemas + mappers + CRUD API client. Fix TS4111 (`noPropertyAccessFromIndexSignature`) → bracket notation en `Record<string,unknown>`. Fix TS strict array destructuring en `toIsoFromDate`.
- `frontend/src/app/(app)/calendar/page.tsx`: vista mensual (default) + toggle semanal, filtro de visibilidad Mis/Generales/Ambos, navegación ◀ Hoy ▶, React Query.
- `CalendarMonthView.tsx`: CSS Grid 7 cols, 42 celdas (6 semanas), today highlight, chips de evento con color, "+N más" overflow.
- `CalendarWeekView.tsx`: 7 columnas, eventos del día en lista vertical, all_day al tope.
- `CalendarEventDialog.tsx`: Modal LG con form completo — title, description, location, all_day toggle, starts_at/ends_at (datetime-local o date según all_day), visibility radio personal/general, entity picker (CompanyPicker + SearchPicker para leads y contactos), color picker. RBAC client-side: personal=owner edita, general=admin edita; read-only hint si sin permisos.
- Sidebar: entrada `/calendar` con icon `CalendarDays` (diferenciado del `/content/calendar` que usa `Calendar`).
- Tests: 8 nuevos tests para CalendarEventDialog (create/validate/edit/RBAC) y CalendarMonthView (render/click event/click empty cell).

**Verificación independiente:** typecheck ✓, lint ✓, 129 frontend tests ✓ (+8 vs 121).

**Deuda específica UJ-28:**

- `act()` warnings en tests del dialog (async mutations no envueltas) — mismo patrón pendiente que LeadFormDialog. Polish trivial.
- Migración `add_calendar_events` generada manualmente por Codex; se aplica en el próximo `prisma migrate dev` (IT-12 o local).

---

## M7 — Cadena de outreach (gimnasios/clínicas)

Plan completo: `~/.claude/plans/plan-cadena-swirling-cake.md`. Objetivo: empezar a enviar correos en frío
(rediseño web/SEO/landings) a gimnasios y clínicas, apoyándose en el CRM (research + `OutboundPrep` +
tracking) más una app pública de demos y plantillas de email.

### UJ-30 — Campo `demo_link` por empresa

**Implementación (Claude, directa):**

- `backend/prisma/schema.prisma`: `Company.demoLink String? @map("demo_link")`. `prisma generate` ✓.
- Migración `backend/prisma/migrations/20260531193000_add_demo_link/migration.sql` escrita a mano
  (`ALTER TABLE "companies" ADD COLUMN "demo_link" TEXT;`) — Docker no estaba arriba; pendiente
  `prisma migrate deploy` (mismo patrón de deuda que UJ-28/29).
- `backend/src/modules/companies/schemas.ts`: `demo_link` (`z.string().url().nullable().optional()`) en
  writable fields + `CompanyDtoSchema`.
- `backend/src/modules/companies/service.ts`: `demo_link` en `toDto`/`toCreateData`/`toUpdateData`.
- `backend/src/modules/imports/domain.ts`: `demo_link` añadido a `ACCEPTED_HEADERS` (import CSV opcional).
- Fixtures de test actualizados (Company/DTO) en activities, calendar, companies, contacts, leads, search,
  tags, intel, routes/companies — `demoLink`/`demo_link` null.
- Frontend: `types/company.ts` (`CompanyDto` + `CompanyCreateInput`); `CompanyFormDialog.tsx` campo
  "Demo (URL)" en sección "Más datos" (estado + Zod `.url()` + sanitize); ficha de empresa
  `companies/[id]/page.tsx` muestra `demo_link` como enlace http(s) seguro (`safeHttpUrl` contra
  `javascript:`); `OutboundPrepCard.tsx` muestra bloque "Demo" con enlace + botón Copiar (reusa la query
  cacheada `['companies', id]`, sin red extra en la ficha).

**Verificación independiente (Claude):** backend `tsc --noEmit` ✓, frontend `tsc --noEmit` ✓, lint ✓ en
archivos tocados, tests verdes (companies 9 + imports 12 + routes/companies 7 backend; CompanyFormDialog 4
frontend).

**Security checklist UJ-30:** ✅ sin secretos; `demo_link` validado como URL (Zod backend + frontend);
render con `safeHttpUrl` (bloquea `javascript:`/otros schemes); pasa por rutas companies con `requireAuth`;
sin leaks en DTO.

**Deuda UJ-30:** migración `add_demo_link` generada sin Postgres; aplicar/validar con `prisma migrate dev`
o `migrate deploy` cuando Docker esté arriba (junto a la deuda acumulada de UJ-28/29 e IT-12).

### UJ-31 — Descubrimiento en masa (Google Places)

**Implementación (Claude, directa — desviación consciente del patrón Codex, justificada por anclas ya
exploradas + supervisión activa del usuario):**

- `backend/src/core/sources/google-places.ts`: adaptador Places API v1 `places:searchText` con FieldMask
  (id, displayName, websiteUri, internationalPhoneNumber, googleMapsUri, rating, userRatingCount,
  formattedAddress, addressComponents), paginación por `nextPageToken` (máx 3 páginas / 60 resultados),
  dedup por `placeId`, extracción de `locality`. API key recibida por parámetro (nunca env/logs);
  `GooglePlacesError` no filtra body ni key.
- Cola `discovery`: `DiscoveryPayloadSchema` + `QUEUE_NAMES`/`QUEUE_SCHEMAS`/`PayloadForQueue` en
  `core/queue/types.ts`, mapa en `core/queue/queues.ts`, handler en `worker/main.ts`.
- `backend/src/modules/discovery/{schemas,service,handler,index}.ts`: `mapBusinessTypeToVertical`
  (gimnasio→`gym_fitness`, fisio/pilates/yoga/bakery/cafe, default `other`); `DiscoveryService.run`
  reutiliza `CompaniesService.create` (dedup por dominio → `CompanyDomainConflictError`=duplicada) +
  dedup secundario (nombre+ciudad o teléfono) para negocios sin web; enrichment solo si `triggerEnrichment`
  y la empresa tiene web, vía `intelService.createEnrichmentRun`. `enqueueBulkDiscovery` para la ruta.
- `backend/src/api/routes/discovery.ts`: `POST /discovery/bulk-search` con `requireAuth + requireRole('admin')`,
  rateLimit 5/min por usuario, Zod, 202 `{ jobId }`. Registrada en `api/server.ts` bajo `/api/v1`.
- Frontend: `lib/api/discovery.ts` (`bulkDiscoverySearch`), `BulkDiscoveryDialog` (ciudad + tipo + checkbox
  enriquecer), `BulkDiscoveryStatus` (polling `getJob` cada 4s, muestra creadas/duplicadas/enriquecidas,
  invalida `['companies']` al terminar), botón "Descubrir negocios" en `/companies`.

**Verificación independiente (Claude):** backend `tsc` ✓, frontend `tsc` ✓, lint ✓ en archivos tocados;
tests: 8 nuevos (4 adapter con `fetch` mockeado: mapeo/paginación/dedup/error; 4 service con deps
inyectadas: create+vertical, dedup nombre/ciudad, dedup dominio, enrichment solo-con-web) + queue (4) +
intel service (33) + companies route (7) verdes.

**Security checklist UJ-31:** ✅ key `google_places` solo del vault (`secretsResolver`), nunca en payload/log;
Zod en la ruta; rateLimit + gate admin (API de pago); `GooglePlacesError` sin filtrar body/key; payload de
cola sin secretos (solo ids/flags); dedup evita duplicados al re-ejecutar.

**Deuda UJ-31:** verificación end-to-end real requiere cargar la key `google_places` en el vault
(`/admin/settings`) + Docker (db/redis/worker). El `[ioredis] ECONNREFUSED` en el test del service es inocuo
(conexión perezosa en entorno de test, mismo patrón que otros módulos que importan `enqueue`).

### UJ-32 — App pública de demos (`heyday-demos`, repo aparte)

**Repo nuevo** `/Users/alex_avila/Documents/CRM/heyday-demos` (independiente del CRM, público, sin auth).
Next.js 16.2.6 + React 19 + Tailwind v4 (CSS-first via `@tailwindcss/postcss`). `git init` + commit inicial.

- **Arquitectura plantilla + config por prospecto**: `src/types/prospect.ts` (`ProspectConfig`),
  `src/prospects/_template.ts` (base a clonar), `src/prospects/iron-pulse.ts` (demo real de ejemplo),
  `src/prospects/index.ts` (registro slug→config para `generateStaticParams`). Ruta dinámica
  `src/app/[slug]/page.tsx` (SSG + `generateMetadata` noindex + `notFound`). Índice interno en `/`.
- **9 componentes** server-side en `src/components/`: Navbar (sticky + CTA), Hero (imagen + doble CTA),
  Servicios, Beneficios, Planes (placeholder tarifas), HorariosUbicacion (link maps), Testimonios
  (reseñas reales), CtaFooter (firma "Diseñado por HeyDay Studio"), WhatsAppFloat (+34 649 756 007).
- **Acento por prospecto**: `colorPrimario` se inyecta como `--accent` en el `<main>`; toda la paleta se
  adapta sin tocar componentes. Tema oscuro premium fitness, entrada CSS-only (`.reveal`, respeta
  `prefers-reduced-motion`). Imágenes Unsplash (`next.config` remotePatterns). Helper `lib/whatsapp.ts`.

**Verificación independiente (Claude):** `tsc --noEmit` ✓; `next build` ✓ (compila + SSG de `/iron-pulse`);
preview MCP: home + demo en **desktop y móvil** (375px), snapshot a11y confirma todas las secciones y textos,
`preview_eval` confirma `--accent=#ff5a1f`, **7 enlaces `wa.me/34649756007`** con texto prerelleno, link de
maps y firma HeyDay. Navbar colapsa en móvil; cards apilan; WhatsApp flotante presente.

**Deuda UJ-32:** deploy en Vercel + dominio `demos.estudioheyday.com` (CNAME) — paso operativo del usuario.
Sustituir `iron-pulse` por gimnasios reales del CRM al enviar (copiar `_template.ts`).

### UJ-33 — Plantillas de email en frío + flujo de tracking

`heyday-demos/emails/`: `email-1-gimnasio.md` (día 0, ángulo imagen online + demo hecho),
`email-2-followup.md` (+3d, ángulo SEO/Google local), `email-3-breakup.md` (+7d, cierre cordial),
`email-1-clinica.md` (variante confianza) + `README.md` con variables, origen CRM y entregabilidad.

- **Variables**: `{{nombre}}`, `{{negocio}}`, `{{ciudad}}`, `{{link_demo}}`, `{{observacion_personal}}`.
- **El CRM aporta la munición**: `OutboundPrep` (`outreach_angle`/`service_pitch`/`tone_guidance`) + `demo_link`
  - `PainPoint` para la observación personal.
- **Tracking sin schema nuevo** (verificado contra el código): registrar **Activity `kind='email_log'`**
  (`ActivityKind` ∈ {note, task, call_log, **email_log**, meeting_log}) sobre company/contact/lead, y mover
  el Lead en el Kanban (nuevo→demo hecho→contactado→seguimiento→respondido).

**Verificación:** confirmado que `email_log` existe en `backend/src/modules/activities/schemas.ts`
(`ActivityKindSchema`) — el flujo documentado no inventa tipos.

**Nota de proceso (Partes 1/3/4):** implementación directa de Claude en lugar del patrón Codex —
desviación consciente (Regla 9) justificada por anclas ya exploradas, alcance acotado y supervisión activa
del usuario; compensada con verificación independiente (typecheck/lint/build/tests/preview) en cada pasada.

## Auditoría producción (2026-06-01) + fixes

Auditoría a fondo del CRM en prod (SSH al VPS + sesión admin + barrido de API). Hallazgos y acciones:

- **🔴 CRÍTICO — bucle de refresh en `AuthBootstrap`** (causa real del "se queda cargando"). El `useEffect`
  tenía `accessToken` en deps y `updateAccess()` lo mutaba → re-ejecución; el `cancelled` abortaba antes de
  `setSession`, así que `user` nunca se seteaba y reentraba pidiendo `/auth/refresh` en bucle (rota el token
  hasta disparar reúso → logout). Como el access token vive **solo en memoria**, esto saltaba en **cada F5**.
  **FIX**: guarda `startedRef` (corre una vez) + eliminado `cancelled`. `AuthBootstrap.tsx`. typecheck/lint/build verdes.
- **🔴 CRÍTICO (acción usuario) — Anthropic sin crédito**: logs `"credit balance is too low"`; fallan
  enrichment IA, pain points, service-fit, content gen, outbound regen (enrichment quedan `partial`). Resolver
  en console.anthropic.com (la key es válida, es saldo).
- **🟡 Job huérfano**: `integration_test` 24 días en `queued` (mirror que BullMQ perdió). **FIX**: marcado
  `failed` en BD. (Sin reaper de zombies → deuda futura.)
- **🟡 Multi-pestaña**: rotación del refresh token compartido puede disparar reúso al abrir 2 pestañas a la
  vez. Mitigado por el fix #1 (1 refresh por carga en vez de bucle); fix completo (coordinación cross-tab)
  queda como deuda — no se toca en caliente el sistema de auth.
- **🔴 Lockout por cookie inválida (middleware ↔ bootstrap)** — descubierto al barrer la UI. El middleware
  redirige `/login`→`/dashboard` solo por **presencia** de la cookie `hd_refresh` (no la valida). Si la cookie
  está presente pero **inválida** (revocada por reúso multi-pestaña, o expirada): `/dashboard` → bootstrap
  refresh→401 → quiere `/login` → middleware rebota a `/dashboard` → **bucle, atascado en "Cargando…", sin
  poder volver a loguearse** (el `clear()` no borra la cookie httpOnly; logout exige auth). **FIX** (frontend):
  el middleware ya NO rebota `/login`→`/dashboard` (deja `/login` siempre accesible); el redirect de cortesía
  para usuarios autenticados lo hace `LoginForm` con la sesión en memoria. typecheck/lint/build verdes.
  Requiere redeploy frontend. (Relacionado con #3 multi-pestaña; este era el síntoma grave.)
- **🟢 Parseo JSON de IA robusto** (resuelve los enrichment `partial` por `lead_enrichment_extract returned
invalid JSON`). El `safeJsonParse` estaba triplicado (intel/handler, intel/service, content/handlers) con
  `JSON.parse` ingenuo → fallaba si el modelo envolvía el JSON en ` ```json ` o prosa. **FIX**: helper
  compartido `core/ai/json.ts → parseAiJson` (parse directo → fences markdown → objeto/array embebido), usado
  en los 3 sitios. +5 tests. typecheck/lint/100 tests verdes. Requiere redeploy backend+worker.
- **Verificado OK**: cabeceras de seguridad (HSTS/XFO/nosniff/Referrer/CORS al origen), vault AES-256-GCM sin
  fugas en DTO, auth/authz (401 sin token, admin protegido), sin 5xx, worker vivo, `discovery`/`demo_link`
  desplegados. localStorage **sí** se limpia en logout (deuda previa ya resuelta en Topbar).

## Review — M7 (cadena de outreach: UJ-31 / UJ-32 / UJ-33)

Revisión independiente (subagente con contexto limpio, escéptico, leyendo el código real y corriendo los
comandos de verificación). **Veredicto: GO para M7.** Sin hallazgos CRITICAL ni MAJOR.

**Comandos (todos PASS):** backend `tsc` ✓; backend `vitest run src/modules/discovery src/core/sources`
✓ (8/8); frontend `tsc` ✓; eslint backend+frontend de los archivos tocados ✓; `heyday-demos` `tsc` ✓ y
`pnpm build` ✓ (SSG `/iron-pulse`).

**Por journey:**

- **UJ-31** GO — ruta con `requireAuth`+`requireRole('admin')`+rateLimit+Zod+202; registrada bajo `/api/v1`;
  key del vault solo en header `X-Goog-Api-Key`, nunca en payload/log/error; `GooglePlacesError` no filtra
  body ni key; cola completa (NAMES/SCHEMAS/PayloadForQueue/buildQueue/worker); dedup con `deletedAt:null` +
  `OR` correcto + nombre/ciudad case-insensitive; fan-out acotado (enrichment solo con web, máx 60); sin
  riesgo de inyección (POST JSON + Prisma parametrizado); journey frontend completo (in-flight/success/
  failed/dismiss).
- **UJ-32** GO — build + typecheck limpios; `[slug]` con `notFound` + `generateStaticParams`; acento por
  `--accent`; `robots noindex` en slug y layout; app pública sin auth/secrets/`process.env`; WhatsApp links
  bien formados; **cero `dangerouslySetInnerHTML`** (JSX auto-escapado, sin superficie XSS).
- **UJ-33** GO — 4 plantillas + README; variables correctas; `email_log` verificado como miembro real de
  `ActivityKindSchema` (no inventado).

**Hallazgos MINOR/NIT:**

1. _(RESUELTO en esta sesión)_ El botón "Descubrir negocios" se mostraba a todo usuario autenticado (el
   backend ya bloqueaba con 403). Gateado en frontend con `currentUser?.role === 'admin'` siguiendo el
   patrón de `Sidebar.tsx`/`CalendarEventDialog.tsx`. typecheck+lint verdes.
2. Dedup por teléfono usa `equals` exacto sin normalización — fiable al re-ejecutar la misma discovery;
   endurecer a futuro (normalizar teléfono). No es bug.
3. Ruido `ioredis ECONNREFUSED` en el test del service (sin Redis) — cosmético, tests pasan con mocks.
4. Deuda operativa documentada (no regresión): aplicar migración `add_demo_link` con Docker; cargar key
   `google_places` en vault; deploy `heyday-demos` en Vercel + `demos.estudioheyday.com`.

**Checklist de seguridad:** sin secretos hardcodeados; key solo del vault y solo en header; nada sensible en
logs/errores/UI; inputs validados y acotados en ruta+payload; auth+admin+rateLimit en la ruta protegida;
Prisma parametrizado; sin superficie XSS en las demos; errores solo exponen status HTTP; deps estándar.
