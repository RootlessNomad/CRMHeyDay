# Non-Functional Requirements

## Performance

- p95 endpoints CRUD < 400ms con DB caliente y 1k empresas
- p95 listado paginado < 600ms con filtros
- Jobs de enrichment: target < 60s end-to-end por empresa (depende de fuentes externas)
- Content draft (3 canales en paralelo): target < 45s para completar los 3 jobs
- Paginación obligatoria; límite duro 100 items por página
- Playwright pool máximo 3 navegadores concurrentes por worker

## Security

- Auth JWT (access 15 min, refresh 14 días, rotación en uso)
- bcrypt cost 12 para passwords
- AES-256-GCM para Level 3 credentials con master key en env (Level 2)
- HTTPS obligatorio en prod; HSTS habilitado
- Helmet CSP restrictivo, CORS solo a `APP_URL`
- Rate limit: 120/min auth, 300/min usuario autenticado
- CSRF en formularios admin críticos
- No secretos ni PII en logs
- Errores 5xx con mensajes genéricos al cliente; detalle solo server-side
- Audit log inmutable (sin UPDATE/DELETE desde app)
- RBAC: role `admin` requerido para rutas `/admin/*` y para endpoints que muten taxonomías, credenciales, usuarios

## Compliance

- GDPR-aware: solo datos públicos de negocio; consent_status en Contact
- Derecho al olvido: endpoint `POST /contacts/:id/anonymize` reemplaza PII con placeholders manteniendo referencias
- Retention configurable: `ai_usage_log` y `external_api_usage_log` 13 meses por defecto
- Fuente + timestamp preservados en cada dato enriquecido
- No scraping de paywalls, anti-bot, redes sociales logueadas, datos personales fuera de contexto público de negocio
- robots.txt respetado por defecto (flag override requiere justificación por dominio)

## Accesibilidad

- WCAG 2.1 AA en páginas principales (dashboard, listados, detalles, editor de contenido, admin)
- Contraste mínimo 4.5:1 (texto), 3:1 (UI)
- Navegación teclado completa (Kanban, calendario, tablas, modales)
- Focus ring visible
- `prefers-reduced-motion` respetado
- aria-labels en iconos sin texto
- Foco trap en modales; Esc cierra

## Responsive

- Desktop-first, plenamente funcional en ≥1280px
- Tablet (768-1279): sidebar en drawer, layouts adaptados
- Mobile (<768): modo consulta (ver leads, aprobar contenido); edición pesada no optimizada

## Observabilidad

- Logs estructurados JSON con correlation id por request
- Niveles: debug/info/warn/error; `LOG_LEVEL` configurable por env
- Endpoint `/health` con checks de DB, Redis, Anthropic reachability
- Endpoint `/ready` para EasyPanel health checks
- Dashboard `/admin/ai-costs` cubre observabilidad de IA
- Dashboard `/admin/integrations` cubre salud de fuentes externas
- `AuditLog` cubre observabilidad de acciones de usuario

## Fiabilidad

- Backup diario Postgres via `pg_dump`, retención 14 días
- Restore probado al menos una vez antes de delivery
- Migraciones reversibles hasta donde es posible (Prisma down scripts)
- Jobs idempotentes en enrichment (reintentar no duplica source hits, usa dedupe por `(run_id, source_type, source_url)`)
- Graceful shutdown de worker (termina job en curso antes de salir)

## Escalabilidad

- Single-node aceptable para v1 (2 usuarios, ≤ 10k empresas, ≤ 1k jobs/día)
- Worker y API desacoplados: se puede escalar worker horizontalmente sin tocar API
- Postgres con conexiones pooled vía PgBouncer diferido (solo si hiciera falta)
- Cache de Redis puntual; no se asume como fuente de verdad

## Internacionalización

- UI es-ES en v1; strings centralizadas para poder añadir en-US o ca-ES más tarde sin refactor profundo
- Prompts de Claude en español
- Formatos de fecha/hora Europa/Madrid; timezone respetado en frontend

## Mantenibilidad

- Cobertura mínima de test en critical paths: auth, crypto, enrichment pipeline, content generation, admin credentials
- Linter + formatter en pre-commit
- CI obligatorio: lint + typecheck + tests + build
- Documentación viva: `design_summary.md` actualizado cuando cambia arquitectura
