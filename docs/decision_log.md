# Decision Log

## DEC-01: Greenfield en vez de extender CRM existente

- **Fecha**: 2026-04-19
- **Contexto**: `START_PROJECT_PROMPT.md` afirma que "el CRM ya existe y funciona", pero la inspección del repositorio muestra que `backend/` y `frontend/` solo contienen READMEs de plantilla. Usuario confirma que es una plantilla FactorIA y que hay que construir el CRM desde cero con las dos funcionalidades nuevas.
- **Decisión**: Construir CRM core + Lead Intelligence + Content Engine como un solo producto greenfield.
- **Alternativas**: integrarse con un CRM externo (HubSpot/Zoho) via API — descartado, no se dispuso de credenciales y complica ownership de datos. Extender una codebase existente — descartado, no existe.
- **Consecuencias**: se requiere construir el CRM core completo (M1+M2) antes de abordar los módulos estratégicos. Scope mayor, pero coherencia total.

## DEC-02: Anthropic Claude como proveedor de IA por defecto

- **Fecha**: 2026-04-19
- **Contexto**: CLAUDE.md propone OpenAI por defecto. Usuario pide explícitamente Anthropic.
- **Decisión**: Usar `@anthropic-ai/sdk` oficial. Modelos: Sonnet 4.6 por defecto, Haiku 4.5 para extracción estructurada barata, Opus 4.7 opcional tras flag para generación premium.
- **Rationale**: preferencia del usuario; calidad de salida de Claude en español y tareas de razonamiento con evidencia; soporte nativo de prompt caching.
- **Alternativas**: OpenAI (rechazada por usuario); híbrido multi-proveedor (añade complejidad sin beneficio inmediato).
- **Consecuencias**: wrapper `AnthropicClient` centraliza selección de modelo, caching, logging y reintentos. Prompt caching obligatorio para contener coste.

## DEC-03: Stack Node/TS + Fastify + Prisma + Postgres + Next.js

- **Fecha**: 2026-04-19
- **Contexto**: sin preferencia explícita del usuario, hay que elegir default sensato.
- **Decisión**: monorepo TS homogéneo con Fastify (backend), Next.js 15 App Router (frontend), Prisma + Postgres (datos), BullMQ + Redis (jobs), Playwright (scrape + E2E).
- **Rationale**: tipos compartidos front+back; ecosistema maduro; familiar para el equipo FactorIA; Postgres con jsonb cubre bien payloads heterogéneos de enrichment.
- **Alternativas**: FastAPI + SQLAlchemy (añade salto de lenguaje); Remix/SvelteKit (ecosistema más pequeño); MySQL (menos jsonb).
- **Consecuencias**: DX uniforme; un solo linter/formatter; shared zod schemas.

## DEC-04: Credential Vault cifrado en DB con master key en env

- **Fecha**: 2026-04-19
- **Contexto**: CLAUDE.md rule #2 exige Level 3 para secretos de terceros gestionables por admin.
- **Decisión**: AES-256-GCM con master key en env (`CREDENTIAL_MASTER_KEY`, Level 2). Versionado de clave para rotación futura. Ciphertext jamás expuesto por API.
- **Rationale**: KMS externo (AWS KMS, Vault) sería overkill en deployment EasyPanel; AES-256-GCM con master key bien gestionada es estándar aceptado para nivel de riesgo.
- **Alternativas**: libsodium sealed boxes (similar resultado); HashiCorp Vault (sobre-dimensionado).
- **Consecuencias**: requisito operacional: nunca commitear master key; rotación requiere migración de ciphertext.

## DEC-05: Enrichment asíncrono vía BullMQ, polling desde frontend

- **Fecha**: 2026-04-19
- **Contexto**: fuentes externas pueden tardar 30-60s; bloquear request HTTP degradaría UX y arriesgaría timeouts.
- **Decisión**: enrichment y content generation se ejecutan en workers BullMQ; API responde 202 con `job_id`; frontend hace polling a `/jobs/:id` cada 2s.
- **Rationale**: patrón estándar, idempotente, visible en UI. SSE se considera optimización diferida.
- **Alternativas**: WebSockets (overkill por ahora); request síncrono con timeout largo (frágil).
- **Consecuencias**: requiere Redis + worker separado desde día 1.

## DEC-06: Pain points en tres niveles de confianza obligatorios

- **Fecha**: 2026-04-19
- **Contexto**: requisito explícito del briefing — nunca colapsar hechos observados con especulaciones.
- **Decisión**: enum `confidence: observed | inferred | speculative` obligatorio en `PainPoint`. Prompt de Claude fuerza la categorización y pide evidencia textual. UI muestra chips diferenciados.
- **Rationale**: protege credibilidad del outbound y reduce riesgo R-03 (alucinaciones).
- **Consecuencias**: prompts más largos y estrictos; validación server-side del output de Claude.

## DEC-07: Sin publicación automática en v1

- **Fecha**: 2026-04-19
- **Contexto**: briefing exige no auto-publicar sin soporte previo en codebase. Usuario confirma arranque desde cero.
- **Decisión**: v1 soporta solo export (copy, MD, ICS, CSV) y credential vault preparado para futuras integraciones.
- **Rationale**: reduce scope, elimina dependencia de Meta/LinkedIn review processes, mantiene human-in-the-loop.
- **Consecuencias**: integraciones de publicación quedan fuera de v1, añadibles sin refactor gracias al vault.

## DEC-08: Single-tenant, dos usuarios admin (Alex y Alba)

- **Fecha**: 2026-04-19
- **Contexto**: decisión del usuario.
- **Decisión**: single-tenant, seed de Alex y Alba con rol `admin`. Modelo de roles incluye `operator` y `viewer` para extensión futura sin refactor.
- **Consecuencias**: no hace falta workspace scoping en v1; se ahorra complejidad sustancial.

## DEC-09: UI en español (es-ES) en v1

- **Fecha**: 2026-04-19
- **Contexto**: HeyDay opera en España; usuario se comunica en español.
- **Decisión**: UI es-ES; strings centralizadas en archivo para futura i18n; prompts de Claude en español; timezone Europe/Madrid por defecto.
- **Consecuencias**: requiere i18n-ready desde día 1 aunque solo haya un idioma.

## DEC-10: Service matching híbrido (reglas + Claude)

- **Fecha**: 2026-04-19
- **Contexto**: recomendaciones deben ser trazables a evidencia y al mismo tiempo humanamente legibles.
- **Decisión**: reglas deterministas disparan el vertical (ej. "no blog AND sin IG últimos 60 días → Content"); Claude genera rationale y outbound angle basándose en la evidencia.
- **Rationale**: deterministic first = trazable + testeable; Claude encima = calidad de redacción.
- **Consecuencias**: catálogo de reglas editable en `PainPointCategory.default_service_recommendations`; prompt específico de Claude para rationale.

## DEC-11: Admin Panel como milestone propio temprano, no "al final"

- **Fecha**: 2026-04-19
- **Contexto**: CLAUDE.md rule #4 dice admin panel es obligatorio; pero habitualmente se deja para el final.
- **Decisión**: Admin Panel entra en M3 (tras CRM core), antes de Lead Intelligence y Content Engine, porque ambos módulos dependen del credential vault y de las taxonomías editables.
- **Consecuencias**: evita hardcodear claves en IT y facilita desarrollo y testing de los módulos de IA.
