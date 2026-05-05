# API Contracts

Base URL: `/api/v1`. JSON body, UTF-8. Auth: `Authorization: Bearer <access_token>` salvo que se indique `public`. Errores siguen el schema `{ error: { code, message, details? } }`. Paginación: `?page=1&limit=20` en listas; respuesta incluye `{ data, pagination: { page, limit, total, total_pages } }`.

## Convenciones

- Fechas ISO 8601 UTC.
- IDs en `cuid`.
- Validación server-side con Zod.
- Rate limit: 120 req/min por IP en auth; 300 req/min por usuario en resto.
- Jobs asíncronos devuelven `202 Accepted` con `{ job_id }`.

---

## Auth

### POST /auth/login — public

Request: `{ email, password }`
Response 200: `{ access_token, refresh_token, user: { id, email, name, role } }`
Errores: 401 credenciales inválidas.

### POST /auth/refresh — public

Request: `{ refresh_token }`
Response 200: `{ access_token, refresh_token }`

### POST /auth/logout

Request: `{ refresh_token }`
Response 204

### GET /auth/me

Response 200: `{ id, email, name, role, last_login_at }`

### POST /auth/password/change

Request: `{ current_password, new_password }`
Response 204

---

## Users (admin only)

- GET /users — lista
- POST /users — crear `{ email, name, role, password }`
- GET /users/:id
- PATCH /users/:id — editar rol, nombre, is_active
- POST /users/:id/password/reset — genera contraseña temporal

---

## Companies

- GET /companies — filtros `q`, `icp_vertical`, `city`, `tag`, `priority_min`, `priority_max`, `sort`
- POST /companies — crear
- GET /companies/:id — detalle con `contacts`, `leads_count`, `pain_points_count`, `service_recommendations_count`
- PATCH /companies/:id
- DELETE /companies/:id — soft delete
- POST /companies/import-csv — multipart, dispara job bulk

## Contacts

- GET /contacts — filtros `q`, `company_id`, `tag`
- POST /contacts
- GET /contacts/:id
- PATCH /contacts/:id
- DELETE /contacts/:id
- POST /contacts/:id/anonymize — GDPR (reemplaza PII con placeholders, mantiene referencias)

## Leads

- GET /leads — filtros `stage_id`, `owner_id`, `status`, `priority_min`, `tag`, `icp_vertical`
- POST /leads
- GET /leads/:id
- PATCH /leads/:id — incluye mover de stage (`stage_id`)
- POST /leads/:id/won / /lost — atajo con `lost_reason?`
- DELETE /leads/:id

## Pipelines

- GET /pipelines
- POST /pipelines (admin)
- PATCH /pipelines/:id
- POST /pipelines/:id/stages — crear stage
- PATCH /pipeline-stages/:id
- DELETE /pipeline-stages/:id — falla si hay leads en el stage

## Activities (notas + tareas)

- GET /activities — filtros `entity_type`, `entity_id`, `kind`, `owner_id`, `due_from`, `due_to`
- POST /activities
- PATCH /activities/:id
- POST /activities/:id/complete
- DELETE /activities/:id

## Tags

- GET /tags
- POST /tags — `{ name, color?, kind }`
- PATCH /tags/:id
- DELETE /tags/:id
- POST /tags/assign — `{ tag_id, entity_type, entity_id }`
- POST /tags/unassign — idem

## Search

- GET /search?q=… — devuelve top 10 por tipo (companies / contacts / leads / content_items)

---

## Lead Intelligence

### POST /intel/enrichment-runs

Dispara enriquecimiento para una empresa.
Request: `{ company_id?, input_url? }` (si solo `input_url`, crea empresa preliminar)
Response 202: `{ job_id, run_id, company_id, status: "queued" }`

### GET /intel/enrichment-runs/:id

Response 200: `{ id, status, input_url, sources: [...], summary, error_message? }`

### GET /intel/companies/:id/enrichment — histórico de runs

### POST /intel/bulk-import — multipart CSV → N enrichment runs

Response 202: `{ batch_id, count }`

### GET /intel/pain-points?company_id=…

### POST /intel/pain-points — manual `{ company_id, category_id, confidence, evidence_text, evidence_source_url? }`

### PATCH /intel/pain-points/:id — human_verified, edit evidence

### DELETE /intel/pain-points/:id

### GET /intel/service-fit?company_id=…

### POST /intel/service-fit/regenerate — `{ company_id }` → llama a Claude (202 con job_id)

### GET /intel/outbound-prep?company_id=…

### POST /intel/outbound-prep/regenerate — `{ company_id }` (202)

### PATCH /intel/outbound-prep/:company_id — edición manual

### GET /intel/taxonomies/pain-points — lista

### POST / PATCH / DELETE /intel/taxonomies/pain-points (admin)

### GET /intel/service-lines

### PATCH /intel/service-lines/:id (admin)

---

## Content Engine

### GET /content/pillars

### POST / PATCH /content/pillars (admin)

### GET /content/ideas — filtros `pillar`, `vertical`, `status`, `q`

### POST /content/ideas — manual o `{ generate: true, brief: {...} }` para que Claude sugiera varias (202)

### GET /content/ideas/:id

### PATCH /content/ideas/:id

### DELETE /content/ideas/:id

### POST /content/ideas/:id/draft — genera borrador para los 3 canales en paralelo

Response 202: `{ job_id, item_ids: { instagram, linkedin, newsletter } }`

### GET /content/items — filtros `status`, `channel`, `scheduled_from`, `scheduled_to`, `pillar`, `vertical`

### POST /content/items — manual (sin idea previa)

### GET /content/items/:id — incluye current_version + últimas 5 versiones

### PATCH /content/items/:id — editar metadatos (scheduled_for)

### POST /content/items/:id/versions — crear nueva versión `{ title?, body, hooks, ctas, hashtags? }`

### POST /content/items/:id/regenerate — Claude produce nueva versión `{ guidance? }` (202)

### POST /content/items/:id/submit-review — draft → in_review

### POST /content/items/:id/approve — in_review → approved

### POST /content/items/:id/reject — in_review → draft con comment

### POST /content/items/:id/export — approved → exported, devuelve payload según `format` (`md` | `plain` | `ics` | `csv`)

### DELETE /content/items/:id — archivar

### GET /content/calendar?from=&to= — view optimizada para calendario

---

## Admin

### GET /admin/credentials — lista sin ciphertext

### POST /admin/credentials — `{ key, provider, label, value }` (value cifrado server-side, nunca persistido en claro)

### POST /admin/credentials/:id/rotate — `{ value }`

### PATCH /admin/credentials/:id — activar/desactivar / label

### DELETE /admin/credentials/:id

### POST /admin/credentials/:id/test — hace una llamada de prueba al proveedor (202)

### GET /admin/integration-health — snapshot actual

### GET /admin/audit-log — filtros `actor_user_id`, `action`, `from`, `to`

### GET /admin/ai-usage — agregación por día, por feature, por modelo; totales de tokens y coste

### GET /admin/external-usage — agregación por provider

---

## Jobs

### GET /jobs/:id — polling de cualquier job async (enrichment, content_generation, …)

Response 200: `{ id, queue, status, progress?, result?, error? }`

### GET /jobs?queue=…&status=…

### (Opcional) GET /jobs/:id/events — Server-Sent Events stream

---

## Webhooks (expuestos para integraciones diferidas)

### POST /webhooks/n8n/:token

Token validado contra credential `n8n_webhook_secret`. Acepta payloads de n8n para crear leads, activities, disparar enrichment.

---

## Calendar (UJ-28)

### GET /calendar/events?from=ISO&to=ISO&visibility=personal|general|both

Response 200: `{ data: CalendarEventDto[] }`. Aplicar RBAC server-side (no confiar en `visibility` del query): `WHERE visibility='general' OR owner_id=currentUser`. El query param `visibility` solo filtra dentro del set permitido.

### POST /calendar/events

Body: `{ title, description?, location?, starts_at, ends_at, all_day, visibility, related_entity_type?, related_entity_id?, color? }`. Si `visibility='personal'`, `owner_id` se asigna automáticamente al usuario autenticado.

### PATCH /calendar/events/:id

Solo owner (personal) o admin (general). Rechaza con `FORBIDDEN` si no.

### DELETE /calendar/events/:id

Soft delete. Mismas reglas RBAC que PATCH.

---

## Mail (UJ-29a/b/c)

### POST /mail/accounts

Body: `{ email_address, password, display_name?, imap_host?, imap_port?, smtp_host?, smtp_port?, signature_text?, signature_html? }`. Hace login IMAP de prueba antes de persistir; si falla devuelve `INTEGRATION_UNAVAILABLE` y no guarda nada. Password cifrada AES-256-GCM en `Credential` (Level 3).

### GET /mail/accounts

Lista cuentas accesibles para el usuario (propias + compartidas vía `EmailAccountShare`). No expone password.

### PATCH /mail/accounts/:id

Actualiza display, firma o password. Si cambia password, re-test IMAP login.

### DELETE /mail/accounts/:id

Solo owner. Cascade borra `EmailAccountShare`.

### GET /mail/accounts/:id/folders

Lista mailboxes IMAP (INBOX, Sent, Drafts, Trash, custom).

### GET /mail/accounts/:id/messages?folder=INBOX&page=1&page_size=50

Lista paginada con UID + flags + envelope (from, to, subject, date, has_attachments).

### GET /mail/accounts/:id/messages/:uid?folder=INBOX

Mensaje completo. `body_html` sanitizado server-side (sin `<script>`, sin `javascript:`, remote images bloqueadas por default; opción "load images").

### POST /mail/accounts/:id/messages/:uid/flags

Body: `{ folder, seen?, flagged?, deleted? }`.

### POST /mail/accounts/:id/send (UJ-29b)

Multipart. Campos: `to[], cc[], bcc[], subject, body_text, body_html, in_reply_to (uid)?, attachments[]`. Limite 25MB total. Audit log.

### GET /mail/accounts/:id/messages/:uid/attachments/:partId

Stream del adjunto con content-type del part.

### GET /mail/accounts/:id/search?q=&folder=&from=&to=&since=&before= (UJ-29c)

Proxy a IMAP SEARCH. Devuelve UIDs paginados.

### POST /mail/accounts/:id/messages/:uid/to-activity (UJ-29c)

Crea Activity tipo `email` linkeada al lead/company/contact que coincida con remitente. Si no hay match, devuelve `NOT_FOUND` con sugerencia de crear contacto.

---

## Códigos de error comunes

- `AUTH_INVALID_CREDENTIALS` (401)
- `AUTH_EXPIRED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (422, con `details` de Zod)
- `RATE_LIMITED` (429)
- `INTEGRATION_UNAVAILABLE` (502) — para fallos de Claude, Google Places, etc.
- `INTERNAL_ERROR` (500)
