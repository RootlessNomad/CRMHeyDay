# System Architecture

## Overview

Aplicación monorepo con backend API + frontend web + worker de background jobs, desplegada con Docker Compose a EasyPanel.

```
┌──────────────────────────────────────────────────────────────────┐
│                        EasyPanel (host)                          │
│                                                                  │
│  ┌────────────────┐   ┌──────────────────┐   ┌──────────────┐   │
│  │ Next.js 15     │   │ Fastify API      │   │ Worker       │   │
│  │ frontend (SSR) │──▶│ (REST /api/v1)   │──▶│ BullMQ       │   │
│  │ :3000          │   │ :3001            │   │ consumer     │   │
│  └────────────────┘   └──────────┬───────┘   └──────┬───────┘   │
│                                  │                  │           │
│                         ┌────────┴──────────┐       │           │
│                         ▼                   ▼       ▼           │
│                  ┌──────────────┐    ┌────────────────┐        │
│                  │ PostgreSQL 16│    │ Redis 7 (BullMQ│        │
│                  │ (data + audit│    │  + cache)      │        │
│                  │  + logs)     │    └────────────────┘        │
│                  └──────────────┘                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
           │                                   │
           ▼                                   ▼
  ┌──────────────────┐              ┌──────────────────────┐
  │ Anthropic API    │              │ Fuentes públicas     │
  │ (Claude Sonnet/  │              │ - Web scrape (Playwr)│
  │  Haiku/Opus)     │              │ - Google Places      │
  └──────────────────┘              │ - PageSpeed/Lighthouse│
                                    │ - WHOIS / DNS        │
                                    └──────────────────────┘
```

## Módulos backend

`backend/src/`:

- `modules/auth/` — login, refresh, sesiones, password hashing
- `modules/users/` — CRUD admin
- `modules/companies/`, `modules/contacts/`, `modules/leads/`, `modules/pipelines/`, `modules/activities/`, `modules/tags/`, `modules/search/`
- `modules/intel/` — enrichment-runs, pain-points, service-fit, outbound-prep, taxonomies
- `modules/content/` — pillars, ideas, items, versions, approvals, calendar, library
- `modules/admin/` — credentials (vault), integration-health, audit, ai-usage, external-usage
- `modules/jobs/` — lectura estado BullMQ
- `modules/webhooks/` — receptor de n8n u otros
- `core/ai/` — `AnthropicClient` wrapper: selección de modelo por feature, prompt caching obligatorio, logging de tokens a `ai_usage_log`, reintentos con backoff, timeout configurable
- `core/crypto/` — AES-256-GCM para credentials; key derivation con `CREDENTIAL_MASTER_KEY` (Level 2)
- `core/scraping/` — Playwright pool, user-agent real, timeouts, rate limiting por dominio, respeta robots.txt por defecto (flag para saltarlo solo si es página pública de negocio sin Disallow)
- `core/sources/` — adapters por fuente pública (`google_places`, `lighthouse`, `whois`, `instagram_public`, `linkedin_public`); cada uno implementa `fetch(company) → EnrichmentSourceHit`
- `core/queue/` — BullMQ queues: `enrichment`, `content_generation`, `content_adapt`, `integration_test`
- `core/audit/` — middleware para anotar AuditLog
- `core/prisma/` — schema y client
- `core/http/` — Fastify setup, error handler, rate limit, CORS, helmet, zod-to-openapi
- `core/auth/` — JWT sign/verify, guards, RBAC

## Módulos frontend

`frontend/src/app/`:

- `(auth)/login` — página pública
- `(app)/` — layout autenticado
  - `page.tsx` — dashboard
  - `companies/`, `contacts/`, `leads/`, `activities/`
  - `intel/research/`, `intel/pain-points/`, `intel/service-fit/`, `intel/outbound/`
  - `content/ideas/`, `content/calendar/`, `content/library/`, `content/reviews/`, `content/items/[id]/`
  - `admin/users/`, `admin/credentials/`, `admin/integrations/`, `admin/ai-costs/`, `admin/audit/`, `admin/taxonomies/`

`frontend/src/components/` — shadcn/ui base, componentes de dominio (CompanyCard, PainPointList, KanbanBoard, CalendarGrid, EditorPane, CostChart, …).

`frontend/src/lib/`:

- `api/` — clientes tipados por módulo (generados desde zod schemas compartidos)
- `auth/` — context + hook, interceptor de refresh
- `query/` — TanStack Query setup, keys
- `jobs/` — polling de jobs

## Flujo típico: enriquecer una empresa

1. Usuario pega URL en `/intel/research` → UI envía `POST /intel/enrichment-runs { input_url }`
2. API valida, crea/encuentra `Company` por dominio, crea `EnrichmentRun(status=queued)`, encola job en `enrichment` queue, responde `202 { job_id, run_id }`
3. Worker consume job:
   - ejecuta sources en paralelo (`website_scrape`, `google_places`, `lighthouse`, `whois`, `instagram_public`) con timeout duro
   - cada uno persiste `EnrichmentSourceHit`
   - agrega los hits en un prompt único para Claude (Haiku — extracción estructurada) → rellena campos normalizados de Company
   - ejecuta reglas deterministas de pain points → inserta PainPoint(`detected_by=rule`)
   - llama a Claude (Sonnet) con el contexto agregado para añadir pain points nivel `inferred`/`speculative` + rationale + evidencia textual → PainPoint(`detected_by=claude`)
   - corre reglas de service-fit y llama a Claude para rationale → ServiceFitRecommendation
   - genera OutboundPrep base
   - marca run `succeeded`, actualiza `AiUsageLog` y `ExternalApiUsageLog`
4. UI hace polling a `GET /jobs/:id` cada 2s hasta `succeeded` y refresca el detalle de la Company

## Flujo típico: generar contenido multi-canal

1. Usuario abre `/content/ideas/:id` → botón "Generar borradores"
2. API encola 3 jobs en `content_generation` (uno por canal) con prompts adaptados
3. Cada job llama a Claude (Sonnet por defecto, Haiku si `vertical==news_reactive` y shortcut), crea `ContentItem(status=draft) + ContentVersion v1`
4. UI recibe 3 items; usuario edita → cada guardado crea nueva ContentVersion
5. Cambio de estado dispara ContentApprovalEvent
6. Export descarga MD/ICS/CSV o copia al portapapeles

## Credential Level Mapping

- **Level 1 (.env del repo, no sensible)**:
  - `APP_ENV` (development/staging/production)
  - `LOG_LEVEL`
  - `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`
  - Feature flags no sensibles
  - Puerto del servicio
- **Level 2 (env de EasyPanel — secreto pero infraestructura)**:
  - `DATABASE_URL` (Postgres)
  - `REDIS_URL`
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (rotables)
  - `CREDENTIAL_MASTER_KEY` (32 bytes base64, usada para cifrar credenciales de Level 3 en DB)
  - `ANTHROPIC_API_KEY` (clave primaria del proveedor de IA por defecto; se puede sobrescribir por credential de Level 3 si se quiere clave distinta por entorno)
  - `APP_URL` público
  - `COOKIE_DOMAIN`
- **Level 3 (DB, cifrado AES-256-GCM, gestionable desde admin panel)**:
  - Claves de Google Places, PageSpeed, Apollo, Clearbit, BuiltWith, Hunter, Similarweb (cuando se activen)
  - Secretos de webhook de n8n entrantes (`N8N_WEBHOOK_SECRET`)
  - Airtable PAT
  - Google OAuth client_id/client_secret (cuando se active)
  - Meta Graph API, LinkedIn API, WhatsApp Business (cuando se activen)
  - API keys alternativas de Anthropic si se quiere separar por entorno / equipo
  - Cualquier otro proveedor que se añada en el futuro

### Proceso de cifrado

- Al guardar un Level 3: generar IV aleatorio 12B, cifrar con AES-256-GCM, guardar `{ ciphertext, iv, auth_tag, key_version }`
- Al leer: descifrar on-demand en memoria, nunca devolver en una response; usar solo en el cliente HTTP/SDK correspondiente, purgar tras uso
- Rotación de clave maestra: nuevo `key_version`, re-cifrado masivo en migración; vieja clave queda como fallback durante transición

## Infraestructura

- **PostgreSQL 16** — datos principales + logs (audit_log, ai_usage_log, external_api_usage_log). Backup diario via `pg_dump` a volumen persistente. Volumen retiene 14 días.
- **Redis 7** — backend de BullMQ y cache ligero (rate limiting, sesión invalidation). No persiste datos críticos.
- **Playwright** — en el worker, browser pool con 3 contextos máximo concurrentes.
- **Anthropic API** — gestionada por `core/ai/AnthropicClient` con:
  - Modelo por defecto según feature
  - Prompt caching (bloques `cache_control`) aplicado a system prompts y few-shots
  - Timeout 60s para extracción, 120s para redacción
  - Reintentos exponenciales (max 3) para 429/5xx
  - Logging obligatorio de `usage` a `ai_usage_log` incluyendo tokens de cache hit/miss
- **Frontend SSR** — Next.js 15 con RSC; data fetching vía TanStack Query en client components, SSR para login y páginas públicas.

## Seguridad

- HTTPS obligatorio en producción (EasyPanel termina TLS)
- Helmet + CORS restringido a `APP_URL`
- Rate limiting por IP y por usuario autenticado
- CSRF token en formularios que no sean API pura (admin actions críticas)
- Contraseñas: bcrypt cost 12; política mínima 10 chars, no enforced complexity (delegado a UX)
- Refresh tokens rotados en cada uso, hash guardado en DB, revocables
- JWT access: 15 min; refresh: 14 días
- Logs NO contienen passwords, tokens, ni ciphertext
- Errores internos devuelven mensajes genéricos; detalles solo en logs server

## Observabilidad

- Logs estructurados JSON (pino) con correlation id por request
- Métricas simples en /health: uptime, DB/Redis/Anthropic reachability
- Exporta `ai_usage_log` y `external_api_usage_log` al dashboard admin (no exporter Prometheus en v1)

## Testing

- Unit: services críticos (auth, crypto, service-fit rules, content prompt builders)
- Integration: endpoints de auth, enrichment pipeline (con Claude mockeado), credential vault (encrypt/decrypt round-trip)
- E2E smoke: golden paths de las 6 success criteria del v1 (Playwright)

## Deployment

- `docker-compose.yml` dev local
- `deployment/docker/Dockerfile.backend`, `Dockerfile.frontend`, `Dockerfile.worker`
- `deployment/easypanel/` con plantillas de servicios + variables requeridas
- `deployment/scripts/` — `seed.ts`, `migrate.ts`, `backup.sh`, `restore.sh`
