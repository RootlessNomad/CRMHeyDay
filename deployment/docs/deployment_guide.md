# Deployment Guide — HeyDay CRM

> Estado: esqueleto. Se completa en IT-11 y antes de delivery.

## Prerequisites

- Docker ≥ 24
- Docker Compose v2
- Node 20 + pnpm 9 (solo si se ejecuta sin contenedores)
- Servidor con EasyPanel instalado y dominio apuntando a él
- Cuenta Anthropic con API key válida

## Environment setup

### Desarrollo local

```bash
cp .env.example .env
bash deployment/scripts/generate-secrets.sh   # copiar los valores al .env
docker compose up -d db redis
pnpm install
pnpm db:migrate
pnpm seed
pnpm dev
```

### Producción (EasyPanel)

1. Crear proyecto en EasyPanel
2. Añadir servicios Postgres 16 y Redis 7 (ver `../easypanel/README.md`)
3. Configurar variables de entorno Level 2 en el proyecto EasyPanel
4. Crear servicios `backend`, `worker`, `frontend` con los Dockerfiles del directorio `../docker/` (target `prod`)
5. Ejecutar migraciones: job one-shot `pnpm db:migrate:deploy`
6. Ejecutar seed inicial (solo primera vez): `pnpm seed`
7. Configurar dominio + TLS en el servicio frontend
8. Activar healthchecks con `/health` y `/ready`

## Docker deployment (fuera de EasyPanel)

```bash
# Build
docker build -f deployment/docker/Dockerfile.backend --target prod -t heyday/backend:$(git rev-parse --short HEAD) .
docker build -f deployment/docker/Dockerfile.worker --target prod -t heyday/worker:$(git rev-parse --short HEAD) .
docker build -f deployment/docker/Dockerfile.frontend --target prod -t heyday/frontend:$(git rev-parse --short HEAD) .
```

## Rollback plan

- Las migraciones Prisma son idempotentes y, cuando es posible, reversibles
- Rollback de imagen: EasyPanel permite volver a la versión anterior con un click
- Si una migración rompe datos, restaurar dump reciente con `deployment/scripts/restore.sh`

## Backups

- `deployment/scripts/backup.sh` programado como cron diario en el host de EasyPanel
- Retención 14 días, dumps comprimidos con timestamp ISO
- Test de restore al menos una vez antes de delivery

## Monitoring

- `/health` expuesto por el backend (DB + Redis + Anthropic reachability)
- `/admin/integrations` para salud de APIs externas
- `/admin/ai-costs` para uso de tokens Claude
- Logs estructurados JSON (pino) visibles en EasyPanel
