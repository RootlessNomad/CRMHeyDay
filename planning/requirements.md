# Requirements — HeyDay CRM + Lead Intelligence + Content Engine

## Producto

CRM interno para HeyDay Studio que unifica:

1. Un **CRM core** (empresas, contactos, leads, pipelines, actividades, etiquetas).
2. Un módulo de **Lead Intelligence** (investigación estructurada, detección de pain points basada en evidencias, recomendación de servicios, preparación de outbound).
3. Un módulo de **Content Engine** (planificación y creación de contenido para Instagram, LinkedIn y newsletter, adaptado al tono y verticales de HeyDay).
4. Un **Admin Panel** para usuarios, credenciales cifradas, taxonomías, salud de integraciones y control de costes de IA.

## Usuarios y roles

- **Alex** — rol `admin` (todos los privilegios).
- **Alba** — rol `admin` (todos los privilegios).
- Modelo de roles preparado para `operator` y `viewer` en futuras iteraciones.

## Requisitos funcionales

### RF-1. CRM Core

- RF-1.1 Login / logout con email + contraseña. Sesión persistente vía refresh token.
- RF-1.2 CRUD de **Empresas**: nombre, website, industria, ubicación, tamaño, canales, notas, etiquetas.
- RF-1.3 CRUD de **Contactos**: nombre, cargo, email, teléfono, WhatsApp, LinkedIn, empresa asociada.
- RF-1.4 CRUD de **Leads**: empresa, contacto principal, origen, estado, stage del pipeline, owner, prioridad.
- RF-1.5 **Pipelines** configurables con stages (por defecto: Nuevo → Calificado → Contactado → Reunión → Propuesta → Ganado/Perdido). Vista Kanban.
- RF-1.6 **Actividades** (notas + tareas) sobre cualquier entidad, con fecha, owner, recordatorio.
- RF-1.7 **Etiquetas** creables y asignables a empresas, contactos y leads.
- RF-1.8 **Búsqueda global** sobre empresas, contactos y leads.
- RF-1.9 **Importación CSV** de empresas y contactos.

### RF-2. Lead Intelligence

- RF-2.1 Ingesta manual de empresa por URL — pegar URL, disparar trabajo de enriquecimiento asíncrono.
- RF-2.2 Ingesta bulk por CSV (lista de URLs o nombres + dominios).
- RF-2.3 Enriquecimiento automático desde fuentes públicas: scraping web (Playwright headless), Google Places, PageSpeed Insights/Lighthouse, WHOIS/DNS, detección de redes sociales (presencia + último post).
- RF-2.4 Extracción estructurada con Claude: industria, propuesta de valor, servicios ofrecidos, señales de tamaño, señales de madurez digital, señales de crecimiento.
- RF-2.5 **Pain points** categorizados en tres niveles: `observed` (hecho observable con evidencia), `inferred` (inferencia razonable), `speculative` (hipótesis). Cada pain point guarda evidencia + fuente + timestamp.
- RF-2.6 **Service fit**: recomendaciones mapeadas exclusivamente a los 3 verticales reales de HeyDay (Automations, Content, Website/SEO). Cada recomendación incluye señal que la disparó, porqué encaja, y outcome esperado.
- RF-2.7 **Outbound prep**: segmento, likely need, ángulo de outreach, propuesta de valor sugerida, pitch de servicio, guía de tono, priority score, notas para SDR.
- RF-2.8 Todo el enriquecimiento preserva `source_url`, `source_type`, `fetched_at` para auditoría.
- RF-2.9 Filtrado y segmentación de leads por vertical sugerido, priority score, vertical ICP, etiquetas, stage.

### RF-3. Content Engine

- RF-3.1 **Idea generator** de posts basado en: vertical de servicio, pilar de contenido, audiencia ICP, tipo (educativo, autoridad, opinión, caso de uso, newsjack).
- RF-3.2 **Calendario editorial** (vista mes / semana) con filtros por canal y estado.
- RF-3.3 **Borradores multi-canal**: una idea fuente → borrador adaptado para Instagram (caption + hooks + CTA), LinkedIn (post largo + hooks), newsletter (bloque + asunto + CTA).
- RF-3.4 **Editor** con versiones (cada guardado crea versión), revertible.
- RF-3.5 **Flujo de aprobación**: `draft` → `in_review` → `approved` → `exported` (con historial de quién hizo cada cambio).
- RF-3.6 **Exportación**: copy al portapapeles, Markdown, CSV del calendario, ICS del calendario.
- RF-3.7 **Biblioteca** buscable y archivo de contenido histórico.
- RF-3.8 Todas las generaciones respetan el tono de HeyDay (prompts con guía de voz, restricciones de tono, ejemplos few-shot).

### RF-4. Admin Panel

- RF-4.1 Gestión de usuarios (alta, baja, cambio de rol, reset de contraseña).
- RF-4.2 **Credential vault**: alta, rotación y revocación de claves API (OpenAI alternativo, Apollo, Clearbit, Google Places, n8n webhook secret, Airtable PAT, Meta Graph, LinkedIn, WhatsApp). Cifrado AES-256-GCM en reposo con clave maestra derivada de env var (Level 2).
- RF-4.3 **Estado de integraciones**: última llamada, errores recientes, salud.
- RF-4.4 **Dashboard de costes de IA**: tokens consumidos por Claude por día/mes, por feature (lead enrichment, content generation, service matching), llamadas a APIs externas con coste estimado.
- RF-4.5 **Audit log**: eventos críticos (login, cambio de credencial, borrado de entidad, export masivo).
- RF-4.6 **Taxonomía de pain points** editable.
- RF-4.7 **Líneas de servicio** de HeyDay editables (para poder ajustar mapeo sin deploy).

## Requisitos no funcionales (resumen — ver `docs/nfr.md`)

- **Seguridad**: cumplir checklist de CLAUDE.md en cada tarea; nunca secretos en código; Level 1/2/3 de credenciales; validación de inputs; rate limiting en endpoints públicos; CSRF; HTTPS obligatorio en producción; logs sin PII.
- **Performance**: p95 < 400ms en endpoints CRUD; jobs de enriquecimiento asíncronos (nunca bloquean UI); paginación obligatoria en listas.
- **Disponibilidad**: single-node aceptable para v1; plan de backups diario de PostgreSQL.
- **Compliance**: GDPR-aware — consentimiento implícito limitado a datos públicos de negocio; derecho al olvido en contactos; retention policy configurable.
- **Accesibilidad**: WCAG 2.1 AA en vistas principales.
- **Responsive**: desktop-first, funcional en tablet, adaptado a mobile para lectura.

## Criterios de éxito del v1

1. Alex y Alba pueden hacer login y gestionar empresas, contactos, leads y pipeline de principio a fin.
2. Al pegar una URL de un negocio objetivo (p.ej. una cafetería en Madrid), el sistema devuelve en <60s un registro enriquecido con pain points categorizados y al menos una recomendación de servicio fundamentada.
3. Un operador puede generar en un click 3 variantes de post (IG / LinkedIn / newsletter) desde una idea, editarlas, aprobarlas y exportarlas.
4. Las claves API externas se gestionan íntegramente desde el admin panel, nunca se hardcodean.
5. El dashboard de costes muestra el gasto de tokens del mes vigente.
6. El seed script produce un entorno demo creíble (10 empresas, 20 contactos, 15 leads distribuidos en pipeline, 8 piezas de contenido en distintos estados).
