# Questions & Assumptions — Resolved

## Answers received (2026-04-19)

| #   | Question                       | Decision                                                                                                                                                                                           |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Greenfield o CRM existente     | **Greenfield**. Construir CRM completo + Lead Intelligence + Content Engine como un solo producto coherente.                                                                                       |
| Q2  | Usuarios, roles, multi-tenancy | **Single-tenant**. Dos usuarios seed: `Alex` y `Alba`, ambos con rol `admin` (todos los privilegios). Modelo de roles preparado para extensión posterior.                                          |
| Q3  | Fuentes de Lead Intelligence   | **Default**: foco en España, UI en español, fuentes públicas/gratuitas para v1 (scraping web, Google Places, Lighthouse, WHOIS, social handles). APIs de pago se añaden más tarde vía admin panel. |
| Q4  | Proveedor IA y publicación     | **Anthropic** (Claude) vía SDK oficial `@anthropic-ai/sdk`. Prompt caching activado por defecto. Sin publicación directa a IG/LinkedIn en v1 — export + copy.                                      |
| Q5  | Integraciones en v1            | **Diferidas**. n8n, Google Calendar, Airtable, WhatsApp se irán conectando conforme construimos. v1 expone webhooks y guarda credenciales en admin panel (Level 3 cifrado).                        |
| Q6  | Datos a importar               | **Ninguno**. Arranque desde cero. Seed script + CSV importer disponibles desde v1.                                                                                                                 |

## Decisiones derivadas (no bloqueantes — se asumen salvo objeción)

- **Stack**: Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL 16 + BullMQ + Redis (backend); Next.js 15 App Router + React 19 + TailwindCSS + shadcn/ui + TanStack Query (frontend).
- **Auth**: JWT access + refresh tokens, bcrypt para hash de contraseñas.
- **IA**: Anthropic Claude — modelo por defecto `claude-sonnet-4-6` para tareas estándar, `claude-haiku-4-5-20251001` para tareas rápidas/baratas (clasificación, extracción), `claude-opus-4-7` opcional para generación de contenido premium. Prompt caching obligatorio.
- **Idioma**: UI en español. Prompts de IA en español. Datos de leads en español. Soporte multi-idioma diferido.
- **Visual**: minimalismo con acento glass sutil, paleta neutra (off-white / slate / un acento), dark mode desde día 1.
- **Taxonomía de pain points**: semilla editable desde admin panel.
- **Service matching**: híbrido — reglas deterministas + Claude para justificación humana.
- **Cost tracking**: log de tokens y llamadas externas por registro, dashboard mensual en admin.
- **Deployment**: Docker Compose + EasyPanel.
- **Compliance**: GDPR-aware, solo datos públicos de negocio, fuente + timestamp preservados.

## Preguntas no bloqueantes abiertas

- Ninguna bloqueante para arrancar. Las decisiones de integraciones concretas (n8n webhooks específicos, Airtable bases concretas) se toman cuando se construyan.
