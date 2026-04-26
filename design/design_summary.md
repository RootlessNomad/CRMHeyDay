# Design Summary — HeyDay CRM + Lead Intelligence + Content Engine

## Stack

- **Backend**: Node.js 20 + TS + Fastify 4 + Prisma 5 + Zod + pino + BullMQ + Playwright
- **Frontend**: Next.js 15 (App Router) + React 19 + TS + Tailwind + shadcn/ui + TanStack Query + Tiptap + dnd-kit
- **DB**: PostgreSQL 16 (cuid PK, jsonb para payloads flexibles, soft delete via `deleted_at`)
- **Queue/Cache**: Redis 7 (BullMQ + rate limit)
- **Auth**: JWT access 15min + refresh 14d rotado, bcrypt cost 12, roles `admin`/`operator`/`viewer` (v1 solo admin)
- **IA**: Anthropic Claude — Sonnet 4.6 default, Haiku 4.5 para extracción, Opus 4.7 opcional. Prompt caching obligatorio.

## Module Map

- **Backend** `backend/src/modules/`: auth, users, companies, contacts, leads, pipelines, activities, tags, search, intel, content, admin, jobs, webhooks. Plus `core/`: ai, crypto, scraping, sources, queue, audit, prisma, http, auth.
- **Frontend** `frontend/src/app/`: `(auth)/login`, `(app)/` con dashboard, companies, contacts, leads, activities, intel/{research,pain-points,service-fit,outbound}, content/{ideas,calendar,library,reviews,items}, admin/{users,credentials,integrations,ai-costs,audit,taxonomies}.
- **Worker**: mismo paquete backend, entrypoint separado consumiendo queues enrichment / content_generation / content_adapt / integration_test.

## Entities (29)

- **Auth/Users**: User, Session, AuditLog
- **CRM**: Company, Contact, Pipeline, PipelineStage, Lead, Tag, Taggable, Activity
- **Lead Intelligence**: EnrichmentRun, EnrichmentSourceHit, PainPoint, PainPointCategory, ServiceLine, ServiceFitRecommendation, OutboundPrep
- **Content Engine**: ContentPillar, ContentIdea, ContentItem, ContentVersion, ContentApprovalEvent
- **Admin/Infra**: Credential, IntegrationHealth, AiUsageLog, ExternalApiUsageLog, Job

## Key Patterns

- Soft delete `deleted_at` en entidades editables; hard delete en logs/derivados.
- Polimorfismo `(entity_type, entity_id)` en Tag/Taggable y Activity (integridad en services).
- Jobs asíncronos: API 202 + `/jobs/:id` polling; worker desacoplado.
- Prompt caching obligatorio en todas las llamadas a Claude; usage loggeado por feature.
- Pain points con `confidence` enum (observed/inferred/speculative) + evidencia textual + source_url + timestamp siempre.
- ContentItem versionado; rollback = nueva versión con contenido antiguo.
- Credentials cifradas AES-256-GCM; nunca expuestas por API; rotación con `key_version`.
- 202 + job_id para operaciones largas (enrichment, content generation, bulk import).

## Credential Map

- **Level 1 (.env)**: APP_ENV, LOG_LEVEL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, feature flags
- **Level 2 (EasyPanel env)**: DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CREDENTIAL_MASTER_KEY, ANTHROPIC_API_KEY, APP_URL, COOKIE_DOMAIN, SEED_ALEX_PASSWORD, SEED_ALBA_PASSWORD
- **Level 3 (admin panel cifrado)**: Google Places, PageSpeed, n8n_webhook_secret, Airtable PAT, Google OAuth, Meta Graph, LinkedIn API, WhatsApp API, Apollo/Clearbit/etc. (diferidos)

## Installed Skills & MCPs

- **Skills seleccionadas**: claude-api (obligatorio para IA), start-execution, session-start, review, security-review, simplify, iterate
- **MCPs disponibles**: Claude_Preview (dev UI validation), Claude_in_Chrome (scraping targets exploration), scheduled-tasks
- **APIs externas del producto**: Anthropic (core), Google Places + PageSpeed (lead intel), Playwright + WHOIS (no-credential). 8 integraciones preparadas via vault para activación posterior.
