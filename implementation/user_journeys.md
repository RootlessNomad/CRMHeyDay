# Infrastructure Tasks & User Journeys

## Resumen

- **Infrastructure Tasks (IT)**: 11 — foundation sin UI
- **User Journeys (UJ)**: 27 — agrupados en 5 milestones
- **Total work units**: 38
- **Orden de ejecución**: IT-01..11 → M1 → M2 → M3 → M4 → M5

---

## INFRASTRUCTURE TASKS — Milestone M0

### IT-01: Monorepo + Tooling setup

- **Purpose**: base del proyecto
- **Components**: pnpm workspaces; carpetas `backend/`, `frontend/`, `shared/`; `tsconfig` base; ESLint + Prettier; Husky + lint-staged; scripts raíz (`dev`, `build`, `test`, `lint`)
- **Acceptance**: `pnpm install && pnpm lint && pnpm build` pasa en limpio
- **Security**: `.gitignore` cubre `.env*`, `node_modules`, builds

### IT-02: Docker Compose dev + Dockerfiles

- **Purpose**: reproducibilidad y paridad con producción
- **Components**: `docker-compose.yml` con services `backend`, `worker`, `frontend`, `db` (Postgres 16), `redis` (Redis 7); `Dockerfile.backend`, `Dockerfile.frontend`, `Dockerfile.worker` multi-stage; volúmenes persistentes; `.env.example` actualizado
- **Acceptance**: `docker compose up` levanta todos los servicios; health checks verdes
- **Security**: no secretos en el compose; todo via `.env`

### IT-03: PostgreSQL + Prisma setup

- **Purpose**: capa de datos
- **Components**: Prisma schema inicial con enums; migración `0001_init`; cliente singleton; convenciones de soft delete via `deleted_at`
- **Acceptance**: `prisma migrate dev` crea todas las tablas del data_model; `prisma studio` navegable
- **Security**: connection string vía env; usuario DB con permisos mínimos

### IT-04: Auth backend (JWT + bcrypt + sesiones)

- **Purpose**: autenticación
- **Components**: service `auth` con register (solo admin), login, refresh, logout; middleware `requireAuth` y `requireRole`; bcrypt password hash; rotación de refresh tokens
- **Acceptance**: tests de integración pasan login happy, refresh, logout, invalid password, expired token
- **Security**: cost 12 bcrypt; refresh rotation; no passwords en logs; rate limit login

### IT-05: Users model + seed Alex/Alba

- **Purpose**: usuarios iniciales con privilegios
- **Components**: CRUD admin de users; seed `prisma/seed.ts` crea Alex y Alba con rol `admin` y contraseñas desde env (`SEED_ALEX_PASSWORD`, `SEED_ALBA_PASSWORD`)
- **Acceptance**: `pnpm seed` crea ambos usuarios; login funciona con las credenciales
- **Security**: passwords del seed en env no commiteados; jamás en el repo

### IT-06: Credential Vault (cifrado AES-256-GCM)

- **Purpose**: Level 3 de credenciales gestionables desde admin
- **Components**: `core/crypto/vault.ts` con `encrypt/decrypt`; modelo `Credential`; API `/admin/credentials` CRUD + rotate + test; `core/config/secrets.ts` centraliza lectura on-demand
- **Acceptance**: round-trip encrypt/decrypt testado; rotación soportada; API nunca devuelve ciphertext ni plaintext a cliente
- **Security**: master key vía env (Level 2); tests de regresión para no leakar valores; audit log en cada change

### IT-07: Background jobs (BullMQ + worker)

- **Purpose**: base asíncrona para enrichment y content generation
- **Components**: queues `enrichment`, `content_generation`, `content_adapt`, `integration_test`; worker entrypoint; modelo espejo `Job` para UI; endpoint `GET /jobs/:id`
- **Acceptance**: job dummy encolado desde API se procesa en worker y aparece como `succeeded` en la API
- **Security**: inputs de job validados con zod antes de encolar

### IT-08: Anthropic client wrapper

- **Purpose**: integración IA centralizada
- **Components**: `core/ai/AnthropicClient` con:
  - selección de modelo por feature (map estático)
  - prompt caching obligatorio (bloques `cache_control` en system prompts y few-shots reutilizables)
  - logging de `usage` a `ai_usage_log` (incluye cache hit/miss y coste estimado)
  - reintentos exponenciales (3 intentos) para 429/5xx
  - timeout configurable
  - fallback a Haiku para extracción si Sonnet falla
- **Acceptance**: test con respuesta mockeada verifica cache_control, logging y cálculo de coste
- **Security**: API key desde env o credential vault; jamás en logs

### IT-09: HTTP layer (Fastify + observabilidad)

- **Purpose**: setup común de la API
- **Components**: Fastify con helmet, CORS, rate limit, pino logger con correlation id, error handler con códigos uniformes, zod-to-openapi para `/api/v1/docs` opcional
- **Acceptance**: `/health` y `/ready` responden; logs estructurados; errores homogéneos
- **Security**: helmet CSP; CORS limitado a `APP_URL`

### IT-10: Frontend shell (Next.js + auth + theming)

- **Purpose**: base de la UI
- **Components**: Next.js 15 App Router; layout autenticado `(app)`; ruta `/login`; provider de auth con refresh automático; Tailwind con tokens del style guide; toggle dark/light; Topbar + Sidebar + command palette (cmd-K) básico; toasts (sonner); TanStack Query provider
- **Acceptance**: login real funciona contra backend; rutas protegidas redirigen; tema persiste
- **Security**: refresh token solo en cookie httpOnly secure samesite=lax; access token en memoria (no localStorage)

### IT-11: Seed data completa + CI

- **Purpose**: entorno demo y pipeline automatizado
- **Components**: `prisma/seed.ts` extendido con 10 empresas (cafés/físios/yoga de Madrid/Barcelona), 20 contactos, 15 leads distribuidos, pipeline por defecto, 3 pillars, 3 service lines, taxonomía de pain points sembrada, 8 content items variados. GitHub Actions con lint + typecheck + test + build en PR
- **Acceptance**: `pnpm seed` resetea y puebla base; todas las páginas renderizan con datos; CI verde
- **Security**: seed no contiene secretos reales

---

## MILESTONE M1 — CRM Core (6 UJ)

### UJ-01: Login y sesión persistente

- **Description**: Alex o Alba entran con email + contraseña y pueden moverse por la app con sesión persistente
- **Backend**: endpoints `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` (apoyados en IT-04)
- **Frontend**: `/login` (public), provider de auth, guard de rutas, menú de usuario con logout
- **Acceptance**: login válido entra al dashboard; login inválido muestra error claro; sesión persiste tras recargar; logout limpia
- **Security**: rate limit 5 intentos/min; password nunca en URL ni logs; refresh en cookie httpOnly
- **Tests**: E2E Playwright: login happy path, login con credenciales malas, logout

### UJ-02: CRUD de Empresas

- **Description**: crear, ver, editar, borrar empresas; lista con filtros y paginación
- **Backend**: `/companies` CRUD; dedupe por dominio; soft delete
- **Frontend**: `/companies` lista con filtros (q, vertical, ciudad, tag); `/companies/:id` detalle con tabs (overview, contactos, leads, actividad); modales crear/editar
- **Acceptance**: flujo completo crear → ver → editar → eliminar funciona; dedupe por dominio avisa al crear existente
- **Security**: input validation con zod; authz admin
- **Tests**: integration tests de los endpoints

### UJ-03: CRUD de Contactos

- **Description**: contactos asociados a empresas; gestión GDPR
- **Backend**: `/contacts` CRUD + `/contacts/:id/anonymize`
- **Frontend**: lista, detalle, formulario; picker de empresa
- **Acceptance**: crear contacto requiere seleccionar empresa; anonimizar reemplaza PII con placeholders
- **Security**: endpoint de anonimización requiere confirmación; audit log
- **Tests**: unit del anonymizer; integration del endpoint

### UJ-04: Pipelines y Kanban de Leads

- **Description**: gestionar leads moviéndolos por stages en Kanban
- **Backend**: `/pipelines` CRUD; `/leads` CRUD con mover stage; pipeline por defecto seedeado
- **Frontend**: vista Kanban con dnd-kit; vista Lista toggle; filtros por owner, vertical, priority, tag; modales crear/editar; acciones won/lost
- **Acceptance**: arrastrar lead entre stages actualiza DB; lead won/lost se mueve a columna final con motivo
- **Security**: only owner/admin puede modificar
- **Tests**: unit del reducer Kanban; E2E de drag&drop

### UJ-05: Activities (notas + tareas) polimórficas

- **Description**: notas y tareas pegables a cualquier entidad con timeline y pendientes
- **Backend**: `/activities` CRUD + complete
- **Frontend**: timeline en detalle de empresa/contacto/lead; vista global `/activities` con filtros; recordatorio visual
- **Acceptance**: crear nota en empresa la muestra en el timeline; marcar tarea completa cambia estado; vista "mis pendientes" funciona
- **Security**: only owner/admin puede editar/borrar
- **Tests**: integration de los CRUD

### UJ-06: Tags y búsqueda global

- **Description**: etiquetar entidades y buscar globalmente
- **Backend**: `/tags` CRUD + assign/unassign; `/search?q=`
- **Frontend**: tag picker en detalles; cmd-K global que lista resultados top por tipo
- **Acceptance**: asignar/quitar tags funciona; cmd-K encuentra empresas/contactos/leads por fragmento
- **Security**: authz admin para crear/borrar tags
- **Tests**: unit del search ranker

---

## MILESTONE M2 — CRM Supporting (4 UJ)

### UJ-07: Importación CSV de empresas y contactos

- **Description**: subir un CSV de empresas (y opcionalmente contactos) y que se creen en batch
- **Backend**: endpoint `/companies/import-csv` que encola job de ingesta con validación por fila; stream de resultados
- **Frontend**: `/companies` botón "Importar CSV"; modal con plantilla descargable; tras subir, muestra progreso del job y resumen (creados, saltados por dedupe, errores por fila)
- **Acceptance**: archivo con 50 filas se procesa; dedupe por dominio; errores por fila no bloquean el resto
- **Security**: validación estricta del tipo/tamaño; límite 2MB
- **Tests**: integration con CSV de fixture

### UJ-08: Dashboard de inicio

- **Description**: vista resumen al entrar: métricas, leads prioritarios, próximas acciones, contenido pendiente, coste IA del mes
- **Backend**: endpoints agregados `/dashboard/metrics`, `/dashboard/upcoming-actions`, `/dashboard/top-priority-leads`
- **Frontend**: `/` con cards de métricas y listas top
- **Acceptance**: dashboard carga < 1s con datos del seed; todos los links llevan a la vista correspondiente
- **Security**: endpoints cachean breve; authz admin
- **Tests**: integration de los endpoints agregados

### UJ-09: Empty states y onboarding ligero

- **Description**: primera experiencia cuando no hay datos: callouts claros que guían a la primera acción
- **Backend**: n/a (solo flags de "tienes datos" derivados)
- **Frontend**: empty states en companies, contacts, leads, content, con CTA primaria ("Crea tu primera empresa" / "Pega una URL para investigar" / "Genera tu primera idea")
- **Acceptance**: tras `prisma migrate reset` sin seed, la app no rompe; cada sección muestra empty state útil
- **Tests**: E2E con DB vacía

### UJ-10: Filtros avanzados y guardado de vistas

- **Description**: listas de companies/leads guardan filtros recientes del usuario (localStorage) para retomar vista
- **Backend**: n/a
- **Frontend**: chips de filtros activos; botón "restablecer"; persistencia en localStorage por usuario
- **Acceptance**: refrescar mantiene los filtros; cambiar de usuario los resetea
- **Tests**: unit de la persistencia

---

## MILESTONE M3 — Admin Panel (5 UJ)

### UJ-11: Gestión de usuarios

- **Description**: invitar, editar, desactivar, resetear contraseña de usuarios
- **Backend**: `/users` CRUD + `/users/:id/password/reset` (genera temporal)
- **Frontend**: `/admin/users` tabla con acciones; modales
- **Acceptance**: Alex añade un tercer usuario; se puede desactivar sin borrar
- **Security**: role `admin` requerido; audit log
- **Tests**: integration

### UJ-12: Credential Vault UI

- **Description**: añadir, rotar, probar, desactivar claves API desde la UI
- **Backend**: `/admin/credentials` (apoyado en IT-06); acción `test` encola job que hace ping al proveedor
- **Frontend**: `/admin/credentials` lista con chip de salud, formulario de alta, acciones
- **Acceptance**: añadir una API key de Google Places, probarla, ver salud actualizarse
- **Security**: plaintext solo en memoria transitoria; UI nunca re-muestra valor; audit log
- **Tests**: integration round-trip; test de no-leak

### UJ-13: Taxonomías editables (pain points, service lines, content pillars)

- **Description**: editar catálogos desde admin para ajustar sin deploy
- **Backend**: `/intel/taxonomies/pain-points`, `/intel/service-lines`, `/content/pillars` CRUD
- **Frontend**: `/admin/taxonomies` con tabs
- **Acceptance**: añadir una nueva categoría de pain point; aparece inmediatamente en los dropdowns de Lead Intelligence
- **Security**: role admin
- **Tests**: integration

### UJ-14: Dashboard de costes de IA + Audit log + Integration health

- **Description**: visibilidad de uso y trazabilidad
- **Backend**: `/admin/ai-usage`, `/admin/external-usage`, `/admin/audit-log`, `/admin/integration-health`
- **Frontend**: `/admin/ai-costs` con gráfico línea + breakdown por feature/modelo; `/admin/audit` tabla filtrable; `/admin/integrations` snapshot
- **Acceptance**: tras seed + algunas llamadas mockeadas de IA, el dashboard muestra totales coherentes
- **Security**: role admin
- **Tests**: integration; unit del cálculo de coste

### UJ-15: GDPR toolkit (retention, anonymize, export)

- **Description**: herramientas mínimas para cumplimiento: anonimizar contacto (ya en UJ-03), purgar logs > retention, export de datos de un contacto bajo petición
- **Backend**: job programable (cron) para purgar `ai_usage_log` y `external_api_usage_log` más viejos que retention; endpoint `/contacts/:id/data-export`
- **Frontend**: acción "Exportar datos" en detalle de contacto; banner de retención en admin
- **Acceptance**: retention purga datos correctamente; export devuelve JSON de todo lo asociado al contacto
- **Security**: solo admin
- **Tests**: unit del purger

---

## MILESTONE M4 — Lead Intelligence (6 UJ)

### UJ-16: Investigar empresa por URL

- **Description**: pegar una URL y obtener empresa enriquecida end-to-end
- **Backend**: `POST /intel/enrichment-runs`; pipeline del worker (fuentes paralelas → Claude Haiku extracción → reglas pain points → Claude Sonnet inference → service fit → outbound base)
- **Frontend**: `/intel/research` con input principal + historial de runs recientes; polling de estado; al completar, navega al detalle de empresa
- **Acceptance**: pegar URL de un café real → en <60s se ve registro con campos rellenos, al menos 2 pain points (1 observed + 1 inferred), 1 service fit recommendation
- **Security**: URL validada; scraping respeta robots.txt; timeout duro; sin secretos en el request
- **Tests**: integration con Claude mockeado + HTTP intercepts; E2E con fixture HTML

### UJ-17: Bulk import de leads por CSV

- **Description**: subir CSV con columnas `name,website` y disparar enrichment en cadena
- **Backend**: `POST /intel/bulk-import` encola batch de runs
- **Frontend**: entrada alternativa en `/intel/research` tab "CSV"; progreso del batch
- **Acceptance**: 20 filas se procesan con tasa de éxito visible; errores por fila no bloquean
- **Security**: tamaño límite 2MB
- **Tests**: integration

### UJ-18: Revisar y verificar pain points

- **Description**: vista cross-empresa para revisar, verificar (human_verified) o descartar pain points detectados
- **Backend**: `/intel/pain-points` con filtros; PATCH para verificar/editar; DELETE
- **Frontend**: `/intel/pain-points` tabla filtrable; panel lateral con evidencia y fuente clicable
- **Acceptance**: filtrar por confidence=speculative y descartar masivamente funciona; el badge `verificado` se marca
- **Security**: role admin
- **Tests**: integration

### UJ-19: Service fit recommendations (regenerar + revisar)

- **Description**: ver recomendaciones por empresa, regenerarlas con Claude, editar rationale
- **Backend**: `GET /intel/service-fit?company_id=`, `POST /intel/service-fit/regenerate`
- **Frontend**: tab "Service fit" en detalle empresa; vista cross en `/intel/service-fit`
- **Acceptance**: regenerar produce nuevas cards con rationale actualizado; reglas disparadas visibles
- **Security**: role admin; coste IA loggeado
- **Tests**: unit de las reglas; integration con Claude mock

### UJ-20: Outbound Prep

- **Description**: ver y editar el briefing de outreach por empresa
- **Backend**: `GET /intel/outbound-prep?company_id=`, `POST /intel/outbound-prep/regenerate`, `PATCH`
- **Frontend**: tab "Outbound" en detalle empresa; vista cross priorizada en `/intel/outbound` con copy-friendly layout
- **Acceptance**: copiar todo el briefing al portapapeles con un click; edición manual sobreescribe la versión generada
- **Security**: role admin
- **Tests**: integration

### UJ-21: Conectar lead → actividad de outreach

- **Description**: desde Outbound Prep, crear una activity `task` con la propuesta como body y due_at sugerido; se refleja en el lead
- **Backend**: endpoint helper `POST /intel/outbound-prep/:company_id/to-task`
- **Frontend**: botón "Crear tarea de outreach" en Outbound Prep
- **Acceptance**: crea task asignada al owner del lead correspondiente; aparece en activities y en dashboard
- **Tests**: integration

---

## MILESTONE M5 — Content Engine (6 UJ)

### UJ-22: Generador de ideas con Claude

- **Description**: generar 5 sugerencias de ideas desde pillar + vertical + brief
- **Backend**: `POST /content/ideas` con `{ generate: true, brief }` encola job; al terminar persiste ideas como `status=idea`
- **Frontend**: `/content/ideas` botón "Generar ideas"; modal con dropdowns y textarea; al completar, lista para aceptar individualmente o descartar
- **Acceptance**: para "newsletter de reactivación de clientes de cafeterías" Claude sugiere 5 ideas variadas con ángulo distinto
- **Security**: límite de llamadas por día por usuario; coste IA loggeado
- **Tests**: integration con Claude mock

### UJ-23: Borradores multi-canal desde una idea

- **Description**: desde una idea, generar simultáneamente draft Instagram / LinkedIn / newsletter
- **Backend**: `POST /content/ideas/:id/draft` encola 3 jobs; cada uno crea ContentItem + ContentVersion v1 con prompt específico de canal
- **Frontend**: botón "Generar borradores"; progreso de los 3; al terminar, navega al editor del primero
- **Acceptance**: los 3 drafts existen con contenido distinto (no copy-paste entre canales), hooks y CTA adaptados
- **Security**: coste IA loggeado; tono HeyDay impuesto en system prompt
- **Tests**: unit de los prompt builders; integration con Claude mock

### UJ-24: Editor de contenido con versiones

- **Description**: editar draft con markdown + preview; cada guardado crea nueva versión; historial con revert
- **Backend**: `POST /content/items/:id/versions` crea versión; `GET /content/items/:id` devuelve current + últimas 5
- **Frontend**: `/content/items/:id` con Tiptap; side-by-side preview; tab "Versiones" con diff y revert
- **Acceptance**: editar y guardar crea versión; revertir a v2 crea v_n+1 con el contenido de v2 (historial preservado)
- **Security**: concurrency: optimistic locking por `version_number`
- **Tests**: unit del diff; integration

### UJ-25: Flujo de aprobación

- **Description**: draft → in_review → approved → exported con ContentApprovalEvent
- **Backend**: endpoints `submit-review`, `approve`, `reject`, `export`
- **Frontend**: acciones en header del editor; `/content/reviews` cola de pendientes
- **Acceptance**: Alex envía a revisión, Alba aprueba, Alex exporta; cada transición genera evento con actor y timestamp
- **Security**: solo role admin en v1; approvals por usuario distinto al autor (soft check, warning)
- **Tests**: integration del state machine

### UJ-26: Calendario editorial

- **Description**: vista mes/semana con drag&drop para re-agendar
- **Backend**: `/content/calendar?from=&to=`; PATCH de `scheduled_for`
- **Frontend**: `/content/calendar` con react-big-calendar; filtros canal/estado/vertical
- **Acceptance**: drag a otro día actualiza DB; filtros funcionan
- **Tests**: unit de la serialización; E2E de drag&drop

### UJ-27: Exportar contenido y biblioteca

- **Description**: exportar approved items como MD, copy al portapapeles, ICS (calendario), CSV (lista); biblioteca buscable
- **Backend**: `POST /content/items/:id/export?format=`; `/content/library` con búsqueda
- **Frontend**: botones de export en editor; `/content/library` con buscador full-text
- **Acceptance**: exportar MD devuelve archivo con front-matter (canal, pillar, scheduled_for, hashtags); ICS importa correctamente en Google Calendar; CSV abre en Excel
- **Security**: exportar genera AuditLog
- **Tests**: unit de cada exporter

---

## M6 — Post-delivery (iteración 1)

Añadidos tras delivery por petición del usuario. No afectan el alcance original.

### UJ-28: Calendario personal y de equipo

- **Description**: agenda transversal de reuniones, milestones y fechas importantes con dos niveles de visibilidad: eventos `personal` (solo el owner los ve) y eventos `general` (visibles a todos).
- **Backend**:
  - Nueva entidad `CalendarEvent` con campos `id, owner_id (nullable cuando general), created_by, title, description, location, starts_at, ends_at, all_day, visibility ('personal'|'general'), related_entity_type ('lead'|'company'|'contact'|null), related_entity_id, color, created_at, updated_at, deleted_at`.
  - Endpoints: `GET /calendar/events?from=&to=&visibility=`, `POST /calendar/events`, `PATCH /calendar/events/:id`, `DELETE /calendar/events/:id`.
  - **RBAC server-side** en service: `list` devuelve eventos donde `visibility='general' OR owner_id=currentUser`. `update/delete` requiere ser owner (personales) o admin (generales). Nunca confiar en filtros del cliente.
- **Frontend**:
  - Página `/calendar` con vista mensual (default) + toggle a vista semanal.
  - Toggle de filtro: "Mis eventos" / "Generales" / "Ambos" (default).
  - Dialog crear/editar evento: título, fechas (con all-day toggle), ubicación, descripción, visibilidad (personal/general), link opcional a lead/empresa/contacto.
  - Click en evento → ver detalle, editar (si owner o general) o borrar.
  - Entrada en sidebar.
- **Acceptance**:
  - Alex crea evento personal "Reunión con Acme" → solo Alex lo ve.
  - Alba crea evento general "Standup semanal" → Alex y Alba lo ven.
  - Alex no puede ver ni editar el evento personal de Alba (verificado server-side).
  - Vista mensual navegable con ◀/▶ y "Hoy".
- **Security**: RBAC en service, validación de fechas (`ends_at >= starts_at`), XSS escape en descripción/ubicación.
- **Tests**: service (RBAC list + update/delete), routes (200/403/404), frontend (render mensual, dialog crear, toggle visibilidad).

### UJ-29a: Bandeja de correo — vault + lectura

- **Description**: cada usuario configura sus credenciales IMAP/SMTP de Hostinger desde su perfil. Lista paginada de mensajes (INBOX por defecto, navegable a otras carpetas). Lectura individual.
- **Backend**:
  - Nueva entidad `EmailAccount`: `id, owner_id, email_address, display_name, imap_host, imap_port, smtp_host, smtp_port, credential_id (FK a Credential vault, AES-256-GCM), signature_text, signature_html, last_sync_at, created_at, updated_at`.
  - Defaults Hostinger preconfigurados: `imap.hostinger.com:993`, `smtp.hostinger.com:465`.
  - Tabla pivote `EmailAccountShare(email_account_id, user_id)` para que `hello@estudioheyday.com` sea accesible por Alex y Alba.
  - Endpoints:
    - `POST /mail/accounts` — registrar cuenta (test conexión IMAP login antes de guardar; si falla, no persiste).
    - `GET /mail/accounts` — lista cuentas accesibles para el usuario actual (propias + compartidas).
    - `PATCH /mail/accounts/:id`, `DELETE /mail/accounts/:id`.
    - `GET /mail/accounts/:id/folders` — lista de mailboxes IMAP.
    - `GET /mail/accounts/:id/messages?folder=INBOX&page=1&page_size=50` — lista paginada (UID + flags + envelope).
    - `GET /mail/accounts/:id/messages/:uid?folder=INBOX` — mensaje completo (HTML sanitizado, texto, headers).
    - `POST /mail/accounts/:id/messages/:uid/flags` — marcar leído/no leído/destacado.
  - Cliente IMAP: `imapflow`. Pool de conexiones por cuenta con TTL.
  - Cliente SMTP: `nodemailer`.
- **Frontend**:
  - Página `/mail` con sidebar (cuentas + carpetas) + lista de mensajes + panel de lectura.
  - En `/profile` o `/settings`: sección "Cuentas de correo" con form (email, password, firma).
- **Acceptance**: Alex añade `alejandro@estudioheyday.com`, conecta y ve INBOX. Alba ve `hello@estudioheyday.com` (compartido) y `alba@estudioheyday.com`. Click en mensaje → render HTML sanitizado.
- **Security**: passwords cifrados Level 3 vault. HTML sanitizado (sin `<script>`, sin `javascript:`, sin remote images por default). RBAC estricto. Audit log en `POST /mail/accounts`. Rate limit por usuario.
- **Tests**: service (vault + share), routes (RBAC), frontend (lista + lectura, mocked).

### UJ-29b: Compose, reply, forward + adjuntos

- **Description**: redactar nuevos emails, responder, responder a todos, reenviar. Subir y descargar adjuntos.
- **Backend**:
  - `POST /mail/accounts/:id/send` — multipart con `to, cc, bcc, subject, body_text, body_html, in_reply_to (uid), attachments`.
  - `GET /mail/accounts/:id/messages/:uid/attachments/:partId` — descarga adjunto (stream).
  - Limite: 25MB total por mensaje.
- **Frontend**:
  - Compose modal con `to/cc/bcc` chips, subject, editor (Tiptap reusado de UJ-24), attachments dropzone.
  - Botones reply/reply-all/forward en panel de lectura. Reply prefiltra `to`/`subject` y cita el mensaje original.
  - Firma del usuario insertada al final.
- **Acceptance**: Alex envía email a Alba desde `alejandro@`, Alba lo recibe. Reply mantiene threading. Adjunto PDF se sube y descarga íntegro.
- **Security**: validación tamaño y MIME de adjuntos. No inyección de headers vía `\r\n`. Audit log de cada envío.
- **Tests**: service send (mocked SMTP), attachment streaming.

### UJ-29c: Búsqueda + vínculo CRM + borradores locales

- **Description**: buscar mensajes server-side (IMAP SEARCH). Detectar emails de contactos del CRM y permitir convertir un email en activity. Borradores en localStorage.
- **Backend**:
  - `GET /mail/accounts/:id/search?q=&folder=&from=&to=&since=&before=` — proxy a IMAP SEARCH.
  - `POST /mail/accounts/:id/messages/:uid/to-activity` — crea Activity tipo `email` linkeada al lead/company/contact que coincida con remitente.
- **Frontend**:
  - Buscador con debounce 400ms.
  - Chip "→ Empresa Acme" si remitente match. Botón "Crear activity desde este email".
  - Borrador local: `localStorage` por cuenta cada 2s.
- **Acceptance**: buscar "factura" devuelve mensajes con esa palabra. Email de `juan@acme.com` muestra chip si "Acme" existe en CRM. Cerrar y reabrir compose recupera borrador.
- **Security**: query SEARCH parametrizada. Match contacto solo en buzones del usuario.
- **Tests**: service search + match contact, frontend draft persistence.

### IT-12: Deploy a EasyPanel — VPS producción

- **Description**: desplegar el CRM en VPS EasyPanel `46.202.131.13` con dominio `crm.estudioheyday.com`.
- **Trabajo**:
  - Validar build de los 3 Dockerfiles (`backend`, `worker`, `frontend`) en target `prod`.
  - `deployment/easypanel/project.yml` con 5 servicios + healthchecks + volúmenes persistentes (db, redis, backend uploads).
  - Hardening producción: `cookie.secure=true`, `cookie.sameSite=strict`, CORS lockdown a `https://crm.estudioheyday.com`, `APP_ENV=production`, logs JSON, rate-limit estricto.
  - Job one-shot migraciones (`pnpm db:migrate:deploy`) y seed base (`pnpm seed`, sin `seed:demo`).
  - Cron diario `pg_dump` → volumen persistente, retención 7 días.
  - Runbook paso-a-paso en `deployment/easypanel/README.md` (DNS, secrets, deploy, smoke checklist).
- **Acceptance**: login en `https://crm.estudioheyday.com` con Alex y Alba. Crear empresa/contacto/lead/evento de calendario y configurar email account funcionan. `/health` verde. Backup verificable.
- **Security**: secrets via EasyPanel env (Level 2). TLS forzado. Logs sin PII. Rate-limit habilitado.

---

## Orden de ejecución final

1. **M0 — Foundation**: IT-01 → IT-02 → IT-03 → IT-04 → IT-05 → IT-09 → IT-10 → IT-06 → IT-07 → IT-08 → IT-11
2. **M1 — CRM Core**: UJ-01 → UJ-02 → UJ-03 → UJ-04 → UJ-05 → UJ-06
3. **M2 — CRM Supporting**: UJ-07 → UJ-08 → UJ-09 → UJ-10
4. **M3 — Admin Panel**: UJ-11 → UJ-12 → UJ-13 → UJ-14 → UJ-15
5. **M4 — Lead Intelligence**: UJ-16 → UJ-17 → UJ-18 → UJ-19 → UJ-20 → UJ-21
6. **M5 — Content Engine**: UJ-22 → UJ-23 → UJ-24 → UJ-25 → UJ-26 → UJ-27
7. **M6 — Post-delivery**: UJ-28 → UJ-29a → UJ-29b → UJ-29c → IT-12

Tras cada milestone: `/review`. Antes de delivery: audit holístico de seguridad + seed demo + verificación de golden paths.

## Estimación de sesiones

- M0: ~3-4 sesiones (infra intensa)
- M1: ~3 sesiones (CRUDs + Kanban)
- M2: ~1-2 sesiones
- M3: ~2-3 sesiones (vault + dashboards)
- M4: ~3-4 sesiones (pipeline asíncrono)
- M5: ~3 sesiones (editor + approval + export)
- **Total estimado**: 15-19 sesiones
