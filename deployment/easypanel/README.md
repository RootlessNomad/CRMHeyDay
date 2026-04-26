# EasyPanel — HeyDay CRM

Guía de configuración en EasyPanel. Los templates concretos se completarán al acercarnos a producción (tras M5). Por ahora, referencia de los servicios que se desplegarán.

## Servicios a crear en el proyecto EasyPanel

1. **heyday-db** — Postgres 16 (servicio built-in de EasyPanel o imagen `postgres:16`). Volumen persistente.
2. **heyday-redis** — Redis 7 (built-in o imagen `redis:7`). Volumen persistente.
3. **heyday-backend** — Docker → `deployment/docker/Dockerfile.backend` target `prod`. Puerto interno 3001. Healthcheck `/health`.
4. **heyday-worker** — Docker → `deployment/docker/Dockerfile.worker` target `prod`. No expone puertos. Depende de db+redis.
5. **heyday-frontend** — Docker → `deployment/docker/Dockerfile.frontend` target `prod`. Puerto interno 3000. Público con TLS terminado por EasyPanel.

## Variables requeridas (Level 2)

Configurar como env del proyecto EasyPanel:

```
APP_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://...        # desde el servicio postgres de EasyPanel
REDIS_URL=redis://...                # desde el servicio redis
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=14d
CREDENTIAL_MASTER_KEY=<openssl rand -base64 32>
ANTHROPIC_API_KEY=sk-ant-...
APP_URL=https://crm.heyday.studio    # o el dominio final
COOKIE_DOMAIN=crm.heyday.studio
TZ=Europe/Madrid
NEXT_PUBLIC_API_URL=https://crm.heyday.studio/api/v1
```

## Plantilla (placeholder)

Cuando preparemos el deployment final añadiremos aquí:

- `project.yml` con la definición de servicios
- Secrets de EasyPanel documentados paso a paso
- Configuración de dominios + TLS
- Configuración de healthchecks y auto-restart

## Orden de deploy

1. DB + Redis (primero, porque el resto depende)
2. Migraciones: job one-shot `pnpm db:migrate:deploy` antes del primer start del backend
3. Backend
4. Worker
5. Frontend
6. Seed inicial (Alex + Alba + taxonomías): one-shot `pnpm seed` tras migraciones
