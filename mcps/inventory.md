# MCPs & External APIs Inventory

## MCPs disponibles en el entorno (revisados durante planning)

| Name                                                                     | Type | Status                 | Notes                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude_Preview (preview_start/stop/screenshot/eval/console_logs/network) | MCP  | **selected**           | Útil en M1-M5 para previsualizar la app Next.js durante desarrollo; screenshots para `/review`. Se activará cuando exista build funcional.                                 |
| Claude_in_Chrome (navigate/read_page/javascript_tool/find/...)           | MCP  | **selected on-demand** | Útil para validar scraping targets reales durante el desarrollo de UJ-16 (Lead Intelligence) sin tener que levantar Playwright en el worker aún. Solo en desarrollo local. |
| scheduled-tasks (create/list/update)                                     | MCP  | available              | No requerido por el producto en v1. Puede usarse para automatizar `/review` o cron de backups durante desarrollo. Candidato para M5+.                                      |
| ccd_directory                                                            | MCP  | available              | Funcional del IDE, no aplica al producto.                                                                                                                                  |
| mcp-registry (search/suggest_connectors)                                 | MCP  | available              | Meta-tool; usado durante planning.                                                                                                                                         |

## APIs externas del producto

| Name                                                       | Type        | Status                           | Credential Level                            | Notes                                                                                                                                                    |
| ---------------------------------------------------------- | ----------- | -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic Claude**                                       | API         | **selected — core**              | Level 2 (default key) + Level 3 (overrides) | SDK `@anthropic-ai/sdk`. Wrapper `AnthropicClient` con prompt caching obligatorio. Modelos: Sonnet 4.6 default, Haiku 4.5 extracción, Opus 4.7 opcional. |
| **Google Places API**                                      | API         | **selected — lead intelligence** | Level 3                                     | Para datos públicos de empresas locales (reviews, horarios, categoría). Activar cuando se configure key en admin vault.                                  |
| **Google PageSpeed Insights / Lighthouse**                 | API         | **selected — lead intelligence** | Level 3 (key) o sin key con rate limit      | Para detectar madurez técnica de webs objetivo.                                                                                                          |
| **Playwright**                                             | Library     | **selected — lead intelligence** | No credential                               | Scraping controlado de webs públicas. Pool de 3 contextos en worker.                                                                                     |
| **WHOIS**                                                  | Lookup      | **selected — lead intelligence** | No credential                               | Fecha de registro de dominio como señal de madurez.                                                                                                      |
| **n8n webhooks**                                           | Integration | **prepared, not implemented**    | Level 3 (shared secret)                     | `POST /webhooks/n8n/:token` expuesto desde v1 pero sin consumidores.                                                                                     |
| **Airtable API**                                           | API         | **prepared, not implemented**    | Level 3 (PAT)                               | Slot reservado en credential vault; integración diferida.                                                                                                |
| **Google Calendar API**                                    | API         | **prepared, not implemented**    | Level 3 (OAuth)                             | Sincronización con calendario editorial diferida.                                                                                                        |
| **Meta Graph API** (IG)                                    | API         | **prepared, not implemented**    | Level 3                                     | Publicación automática diferida.                                                                                                                         |
| **LinkedIn Marketing API**                                 | API         | **prepared, not implemented**    | Level 3                                     | Publicación automática diferida.                                                                                                                         |
| **WhatsApp Business API**                                  | API         | **prepared, not implemented**    | Level 3                                     | En v1 solo campo de contacto; envío real diferido.                                                                                                       |
| **Apollo.io / Clearbit / Hunter / BuiltWith / Similarweb** | API         | **rejected for v1**              | Level 3 si se añaden                        | Fuente de pago; decisión del usuario: arrancar con fuentes públicas gratuitas. Se pueden añadir más tarde vía credential vault sin refactor.             |
| **OpenAI**                                                 | API         | **rejected**                     | —                                           | Decisión del usuario: usar Anthropic.                                                                                                                    |

## Búsquedas ejecutadas en el registry

- `postgres / database / prisma` → sin resultados en el registry público actual
- `playwright / browser / scraping` → sin resultados
- `github / git / repository` → sin resultados
- `filesystem / files / docker` → sin resultados

El registry público no ofrece conectores que sustituyan los SDK/bibliotecas directas para este proyecto. La comunicación con Postgres, Playwright y Anthropic se hace con sus SDKs oficiales dentro del backend/worker, que es lo adecuado para un producto que corre fuera del IDE.

## Conclusión

- **Core del producto**: 1 API obligatoria (Anthropic) + 2 APIs recomendadas para Lead Intelligence (Google Places, PageSpeed).
- **Preparadas vía Credential Vault**: 8 integraciones (n8n, Airtable, Google Calendar, Meta, LinkedIn, WhatsApp, Apollo/Clearbit equivalentes).
- **MCPs de entorno útiles durante desarrollo**: Claude_Preview, Claude_in_Chrome.
- **No se han identificado MCPs de producción** que deban quedar embebidos en la app; el producto expone sus propias integraciones mediante SDKs oficiales.
