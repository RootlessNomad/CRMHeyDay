# Scope

## In Scope (v1)

### CRM core

- Empresas, contactos, leads, pipelines, actividades (notas + tareas), etiquetas.
- Búsqueda global, filtros, paginación.
- Importación CSV de empresas y contactos.
- Auth (login/logout, JWT + refresh, bcrypt).

### Lead Intelligence

- Ingesta manual por URL y bulk CSV.
- Enriquecimiento desde fuentes públicas gratuitas (web scraping, Google Places, Lighthouse, WHOIS, redes sociales públicas).
- Extracción estructurada con Claude.
- Pain points en 3 niveles de confianza (observed / inferred / speculative).
- Service matching híbrido (reglas + Claude) contra los 3 verticales reales de HeyDay.
- Outbound prep (segmento, ángulo, propuesta, pitch, tono, priority score).
- Trazabilidad: source_url, source_type, fetched_at en cada dato.

### Content Engine

- Idea generator con pilares y verticales.
- Calendario editorial mes/semana.
- Borradores multi-canal (IG, LinkedIn, newsletter) con adaptación por canal.
- Editor con versiones y flujo de aprobación (draft → in_review → approved → exported).
- Exportación: copy, Markdown, CSV, ICS.
- Biblioteca y archivo.

### Admin panel

- Gestión de usuarios.
- Credential vault cifrado (AES-256-GCM).
- Dashboard de costes de IA.
- Audit log.
- Taxonomía editable de pain points y líneas de servicio.
- Estado de integraciones (salud de APIs configuradas).

### Infra

- Docker Compose dev + Dockerfiles para backend y frontend.
- Config EasyPanel.
- Seed script con datos demo realistas.
- Logs estructurados.

## Out of Scope (v1)

- **Publicación automática** a Instagram / LinkedIn / newsletter services. Solo export.
- **Sincronización bidireccional** con Google Calendar, Airtable, HubSpot, etc. (Diferido — v1 expone webhooks y guarda credenciales listas.)
- **WhatsApp Business API** real (envío/recepción de mensajes). Solo campo de contacto.
- **Email marketing** (envío masivo, tracking de aperturas, unsubscribe). Fuera.
- **Facturación, cotizaciones, deals financieros.** Fuera.
- **Multi-tenancy / white-labeling.** Single-tenant interno.
- **Multi-idioma de la UI** (es-only en v1).
- **App mobile nativa.** Solo web responsive.
- **SSO / OAuth de terceros** para login (solo email + contraseña en v1).
- **2FA** (preparado en modelo pero activación diferida).
- **Integraciones de pago** (Apollo, Clearbit, BuiltWith, Similarweb). Preparadas vía credential vault pero no construidas en v1.
- **Auto-scraping programado** de leads nuevos desde directorios. Solo ingesta manual o por CSV en v1.
- **Reporting / analytics avanzado** (conversión por stage, velocidad de pipeline, LTV). Diferido.
- **Custom fields** dinámicos por usuario. Esquema fijo en v1.

## Scope boundaries

- **Cumplimiento legal**: solo datos públicos de negocio. Nada de scraping de paywalls, anti-bot, LinkedIn con sesión logueada, redes sociales logueadas, datos personales de individuos fuera del contexto comercial público.
- **No spam**: el sistema prepara borradores de outreach para humanos; nunca envía automáticamente.
- **No rewrites de CRM existente**: es greenfield, no hay existente que preservar.
- **Visibilidad de costes**: cada llamada a Claude y a APIs externas se loggea con coste estimado; el admin panel lo expone.
- **Human-in-the-loop**: toda salida de IA (pain points, recomendaciones, borradores) es editable y requiere revisión humana antes de usarse.
- **Packaged services**: el producto refuerza los 3 verticales reales de HeyDay; no inventa capacidades que HeyDay no vende.
