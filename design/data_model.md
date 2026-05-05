# Data Model

PostgreSQL 16 + Prisma ORM. IDs en `cuid()` salvo `audit_log` que usa `bigserial` por volumen. Timestamps en UTC. Soft delete vía `deleted_at` en entidades editables por el usuario (empresas, contactos, leads, contenidos); hard delete en entidades derivadas (enrichment_runs, ai_usage_logs).

## Leyenda

- `PK` — primary key
- `FK → X` — foreign key a X
- `?` — nullable
- `[]` — array
- `enum(...)` — enumerado tipado
- `unique` / `idx` — restricciones e índices

---

## Módulo: Auth & Users

### User

- id: cuid, PK
- email: text, unique, lowercase
- password_hash: text (bcrypt, cost 12)
- name: text
- role: enum(`admin`, `operator`, `viewer`) — v1 usa solo `admin`
- is_active: boolean, default true
- last_login_at: timestamptz?
- created_at, updated_at: timestamptz
- idx: email

### Session

- id: cuid, PK
- user_id: FK → User
- refresh_token_hash: text (sha256 del refresh token)
- user_agent: text?
- ip: inet?
- expires_at: timestamptz
- revoked_at: timestamptz?
- created_at: timestamptz
- idx: user_id, expires_at

### AuditLog

- id: bigserial, PK
- actor_user_id: FK → User?
- action: text (`auth.login`, `auth.logout`, `credential.rotate`, `company.delete`, `content.export`, …)
- entity_type: text?
- entity_id: text?
- metadata: jsonb (sin PII, sin secretos)
- ip: inet?
- created_at: timestamptz
- idx: created_at, actor_user_id, (entity_type, entity_id)

---

## Módulo: CRM Core

### Company

- id: cuid, PK
- name: text
- website: text?
- domain: text? (normalizado, unique when not null)
- industry: text?
- icp_vertical: enum(`physiotherapy`, `pilates`, `yoga`, `gym_fitness`, `bakery`, `cafe`, `other`)?
- country: text (default `ES`)
- region: text?
- city: text?
- postal_code: text?
- address: text?
- size_signal: enum(`solo`, `micro_1_5`, `small_6_25`, `mid_26_100`, `unknown`)?
- phone: text?
- email: text?
- whatsapp: text?
- linkedin_url: text?
- instagram_handle: text?
- notes: text?
- created_by_id: FK → User
- created_at, updated_at: timestamptz
- deleted_at: timestamptz?
- idx: domain, icp_vertical, city, deleted_at

### Contact

- id: cuid, PK
- company_id: FK → Company?
- first_name: text
- last_name: text?
- role_title: text?
- email: text?
- phone: text?
- whatsapp: text?
- linkedin_url: text?
- is_primary: boolean (máximo uno primary por empresa; enforced en service)
- consent_status: enum(`unknown`, `public_business_data_only`, `explicit_granted`, `revoked`), default `public_business_data_only`
- created_by_id: FK → User
- created_at, updated_at: timestamptz
- deleted_at: timestamptz?
- idx: company_id, email

### Pipeline

- id: cuid, PK
- name: text
- is_default: boolean
- created_at, updated_at: timestamptz

### PipelineStage

- id: cuid, PK
- pipeline_id: FK → Pipeline
- name: text
- order_index: int
- kind: enum(`open`, `won`, `lost`)
- color: text? (hex)
- unique: (pipeline_id, order_index)

### Lead

- id: cuid, PK
- company_id: FK → Company
- primary_contact_id: FK → Contact?
- pipeline_id: FK → Pipeline
- stage_id: FK → PipelineStage
- owner_id: FK → User
- source: enum(`manual`, `csv_import`, `enrichment`, `n8n_webhook`, `other`)
- status: enum(`open`, `won`, `lost`, `archived`)
- priority_score: int (0-100, calculado por Lead Intelligence)
- priority_manual: int? (0-100, override manual)
- next_action_at: timestamptz?
- lost_reason: text?
- created_at, updated_at: timestamptz
- deleted_at: timestamptz?
- idx: stage_id, owner_id, status, priority_score desc

### Tag

- id: cuid, PK
- name: text, unique (case-insensitive)
- color: text? (hex)
- kind: enum(`general`, `vertical`, `persona`, `service_interest`)
- created_at: timestamptz

### Taggable (tabla polimórfica)

- id: cuid, PK
- tag_id: FK → Tag
- entity_type: enum(`company`, `contact`, `lead`, `content_item`)
- entity_id: text
- unique: (tag_id, entity_type, entity_id)
- idx: (entity_type, entity_id)

### Activity (notas + tareas, polimórfico)

- id: cuid, PK
- kind: enum(`note`, `task`, `call_log`, `email_log`, `meeting_log`)
- entity_type: enum(`company`, `contact`, `lead`)
- entity_id: text
- title: text?
- body: text?
- owner_id: FK → User
- due_at: timestamptz?
- completed_at: timestamptz?
- remind_at: timestamptz?
- created_by_id: FK → User
- created_at, updated_at: timestamptz
- idx: (entity_type, entity_id), owner_id, due_at

---

## Módulo: Lead Intelligence

### EnrichmentRun

- id: cuid, PK
- company_id: FK → Company
- triggered_by_id: FK → User
- status: enum(`queued`, `running`, `partial`, `succeeded`, `failed`)
- input_url: text?
- started_at: timestamptz?
- finished_at: timestamptz?
- error_message: text?
- summary: jsonb (stats de qué fuentes funcionaron, qué campos se llenaron)
- created_at: timestamptz
- idx: company_id, status, created_at desc

### EnrichmentSourceHit

- id: cuid, PK
- run_id: FK → EnrichmentRun
- source_type: enum(`website_scrape`, `google_places`, `lighthouse`, `whois`, `instagram_public`, `linkedin_public`, `facebook_public`, `manual`)
- source_url: text?
- status: enum(`ok`, `blocked`, `not_found`, `error`)
- fetched_at: timestamptz
- response_excerpt: text? (truncado a 4KB)
- extracted: jsonb
- error: text?
- idx: run_id, source_type

### PainPoint

- id: cuid, PK
- company_id: FK → Company
- category_id: FK → PainPointCategory
- confidence: enum(`observed`, `inferred`, `speculative`)
- evidence_text: text (cita o descripción concreta)
- evidence_source_url: text?
- evidence_source_hit_id: FK → EnrichmentSourceHit?
- evidence_timestamp: timestamptz
- detected_by: enum(`rule`, `claude`, `human`)
- human_verified: boolean, default false
- verified_by_id: FK → User?
- created_at, updated_at: timestamptz
- idx: company_id, category_id, confidence

### PainPointCategory (taxonomía editable)

- id: cuid, PK
- key: text, unique (slug: `weak_website`, `no_seo`, `poor_content_cadence`, …)
- label_es: text
- description_es: text
- default_service_recommendations: text[] (keys de ServiceLine)
- is_active: boolean, default true
- created_at, updated_at: timestamptz

### ServiceLine (verticales reales de HeyDay, editables)

- id: cuid, PK
- key: text, unique (`automations`, `content`, `website_seo`)
- label_es: text
- description_es: text
- sub_capabilities: jsonb (lista de capacidades paquetizadas)
- is_active: boolean
- created_at, updated_at: timestamptz

### ServiceFitRecommendation

- id: cuid, PK
- company_id: FK → Company
- service_line_id: FK → ServiceLine
- triggering_signals: text[] (keys de pain_points o señales crudas)
- rationale_es: text (generado por Claude, explicando porqué encaja)
- expected_outcome_es: text
- fit_score: int (0-100)
- generated_by: enum(`rule`, `claude`, `human`)
- created_at, updated_at: timestamptz
- idx: company_id, service_line_id

### OutboundPrep

- id: cuid, PK
- company_id: FK → Company (unique — uno por empresa)
- segment: text (p.ej. "cafés de barrio, Madrid, sin automatización visible")
- likely_need: text
- outreach_angle: text
- value_proposition: text
- service_pitch: text
- tone_guidance: text
- priority_score: int (0-100)
- sdr_notes: text?
- last_generated_at: timestamptz
- last_generated_by_id: FK → User?
- created_at, updated_at: timestamptz

---

## Módulo: Content Engine

### ContentPillar (taxonomía editable)

- id: cuid, PK
- key: text, unique (`education`, `authority`, `opinion`, `case_study`, `news_reactive`)
- label_es: text
- description_es: text
- is_active: boolean

### ContentIdea

- id: cuid, PK
- title: text
- angle: text
- pillar_id: FK → ContentPillar
- service_line_id: FK → ServiceLine?
- icp_vertical: enum (ver Company.icp_vertical)?
- brief_es: text
- status: enum(`idea`, `in_production`, `shipped`, `archived`)
- created_by_id: FK → User
- created_at, updated_at: timestamptz
- idx: status, pillar_id, icp_vertical

### ContentItem (borrador por canal, ligado a una idea)

- id: cuid, PK
- idea_id: FK → ContentIdea
- channel: enum(`instagram`, `linkedin`, `newsletter`)
- status: enum(`draft`, `in_review`, `approved`, `exported`, `archived`)
- scheduled_for: date?
- current_version_id: FK → ContentVersion?
- created_by_id: FK → User
- approved_by_id: FK → User?
- approved_at: timestamptz?
- exported_at: timestamptz?
- created_at, updated_at: timestamptz
- idx: status, channel, scheduled_for

### ContentVersion (historial editable)

- id: cuid, PK
- item_id: FK → ContentItem
- version_number: int (autoincrement por item)
- title: text? (subject para newsletter)
- body: text (markdown)
- hooks: text[] (variantes de gancho)
- ctas: text[] (variantes de CTA)
- hashtags: text[]? (IG)
- meta: jsonb (longitud char, n_hashtags, reading_time, …)
- generated_by: enum(`claude`, `human`, `claude_edited_by_human`)
- edited_by_id: FK → User
- created_at: timestamptz
- unique: (item_id, version_number)

### ContentApprovalEvent

- id: cuid, PK
- item_id: FK → ContentItem
- from_status: text
- to_status: text
- actor_id: FK → User
- comment: text?
- created_at: timestamptz

---

## Módulo: Admin & Infra

### Credential

- id: cuid, PK
- key: text, unique (`anthropic_primary`, `google_places`, `n8n_webhook_secret`, `airtable_pat`, …)
- provider: text
- label: text
- ciphertext: bytea (AES-256-GCM)
- iv: bytea
- auth_tag: bytea
- key_version: int (para rotación de clave maestra)
- is_active: boolean
- last_used_at: timestamptz?
- last_rotated_at: timestamptz?
- created_by_id: FK → User
- created_at, updated_at: timestamptz

### IntegrationHealth

- id: cuid, PK
- credential_id: FK → Credential
- last_checked_at: timestamptz?
- last_status: enum(`ok`, `warn`, `error`, `unknown`)
- last_error: text?
- success_count_24h: int
- error_count_24h: int

### AiUsageLog

- id: bigserial, PK
- feature: enum(`lead_enrichment_extract`, `pain_points`, `service_fit`, `outbound_prep`, `content_idea`, `content_draft`, `content_adapt`, `other`)
- model: text (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-7`)
- input_tokens: int
- output_tokens: int
- cache_creation_input_tokens: int, default 0
- cache_read_input_tokens: int, default 0
- estimated_cost_usd: numeric(10,6)
- entity_type: text?
- entity_id: text?
- user_id: FK → User?
- request_id: text?
- latency_ms: int
- created_at: timestamptz
- idx: created_at, feature, user_id

### ExternalApiUsageLog

- id: bigserial, PK
- provider: text (`google_places`, `lighthouse`, `apollo`, …)
- endpoint: text
- units_consumed: int (calls, rows, credits)
- estimated_cost_usd: numeric(10,6)
- entity_type: text?
- entity_id: text?
- created_at: timestamptz

### Job (espejo read-model de BullMQ para UI)

- id: cuid, PK
- queue: text (`enrichment`, `content_generation`, `content_adapt`)
- status: enum(`queued`, `running`, `succeeded`, `failed`)
- payload: jsonb
- result: jsonb?
- error: text?
- started_at: timestamptz?
- finished_at: timestamptz?
- created_at: timestamptz

---

## M6 — Calendario y correo (post-delivery)

### CalendarEvent (UJ-28)

- id: uuid
- owner_id: uuid? FK User — null cuando `visibility='general'` y nadie es dueño exclusivo
- created_by: uuid FK User
- title: text not null
- description: text?
- location: text?
- starts_at: timestamptz not null
- ends_at: timestamptz not null (constraint: `ends_at >= starts_at`)
- all_day: boolean default false
- visibility: enum(`personal`, `general`)
- related_entity_type: enum(`lead`, `company`, `contact`)?
- related_entity_id: uuid?
- color: text? (hex `#RRGGBB`, opcional para tag visual)
- created_at, updated_at, deleted_at: timestamptz

Índices: `(owner_id, starts_at)`, `(visibility, starts_at)`, `(related_entity_type, related_entity_id)`.

RBAC: `list` aplica `WHERE visibility='general' OR owner_id = currentUser`. `update/delete` requiere ownership o admin.

### EmailAccount (UJ-29a)

- id: uuid
- owner_id: uuid FK User (dueño principal)
- email_address: text not null unique (case-insensitive)
- display_name: text?
- imap_host: text not null (default `imap.hostinger.com`)
- imap_port: int not null (default 993)
- smtp_host: text not null (default `smtp.hostinger.com`)
- smtp_port: int not null (default 465)
- credential_id: uuid FK Credential — apunta al secret cifrado AES-256-GCM con la password IMAP/SMTP
- signature_text: text?
- signature_html: text?
- last_sync_at: timestamptz?
- created_at, updated_at: timestamptz

### EmailAccountShare (UJ-29a)

Permite que un buzón sea accesible por más de un usuario (ej. `hello@estudioheyday.com` lo ven Alex y Alba).

- email_account_id: uuid FK EmailAccount (cascade delete)
- user_id: uuid FK User
- created_at: timestamptz
- PK compuesta: `(email_account_id, user_id)`.

Lectura/uso del buzón requiere `email_account.owner_id = currentUser OR EXISTS share`.

---

## Diagrama de relaciones (ASCII)

```
User ──┬── Session
       ├── AuditLog (actor)
       ├── Company (created_by)
       ├── Contact (created_by)
       ├── Lead (owner)
       ├── Activity (owner / created_by)
       ├── Credential (created_by)
       └── ContentItem (created_by / approved_by)

Company ──┬── Contact ───── Lead (primary_contact)
          ├── Lead ─── Pipeline ── PipelineStage
          ├── EnrichmentRun ─── EnrichmentSourceHit
          ├── PainPoint ── PainPointCategory
          │     └── evidence_source_hit → EnrichmentSourceHit
          ├── ServiceFitRecommendation ── ServiceLine
          └── OutboundPrep

ContentPillar ─── ContentIdea ─── ContentItem ─── ContentVersion
                                        └── ContentApprovalEvent

Tag ─── Taggable (polimórfica a Company / Contact / Lead / ContentItem)

Credential ─── IntegrationHealth
AiUsageLog / ExternalApiUsageLog — logs agregables por feature/provider
```

## Índices críticos

- `lead(stage_id, priority_score desc)` — vista Kanban ordenada
- `company(domain)` — dedupe al ingestar
- `activity(entity_type, entity_id, due_at)` — timeline y tareas pendientes
- `pain_point(company_id, confidence)` — vista de research
- `content_item(status, channel, scheduled_for)` — calendario
- `ai_usage_log(created_at, feature)` — dashboard de costes
- `audit_log(created_at desc)` — inspección cronológica

## Notas de modelado

- `Taggable` y `Activity` son polimórficas con `(entity_type, entity_id)`. Se aceptan por simplicidad operativa; la integridad referencial se asegura en services, no a nivel DB.
- `ContentItem.current_version_id` apunta a la versión activa; rollback = crear nueva versión con el body de la antigua.
- `OutboundPrep` es 1:1 con Company (regenerable). Lista de pain points y recomendaciones alimentan su generación.
- `EnrichmentRun` es inmutable tras finalizar; reejecutar = nueva run.
- Valores enum se exponen como strings en la API; Prisma los tipa.
