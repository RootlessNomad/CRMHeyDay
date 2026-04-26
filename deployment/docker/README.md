# Docker — HeyDay CRM

Multi-stage builds para los tres componentes del runtime.

## Archivos

| Fichero               | Servicio                   | Targets internos |
| --------------------- | -------------------------- | ---------------- |
| `Dockerfile.backend`  | API Fastify                | `dev`, `prod`    |
| `Dockerfile.worker`   | Worker BullMQ + Playwright | `dev`, `prod`    |
| `Dockerfile.frontend` | Next.js 15                 | `dev`, `prod`    |

Los contextos de build se resuelven desde la raíz del repo (monorepo pnpm).

## Uso

### Desarrollo (desde la raíz del repo)

```bash
# Levantar todo el stack con hot reload
docker compose up

# Solo DB y Redis (recomendado si corres backend/frontend en tu host)
docker compose up -d db redis

# Reconstruir tras tocar Dockerfiles
docker compose build
```

### Producción (EasyPanel)

Ver `../easypanel/README.md`. Cada servicio usa su `Dockerfile.*` con el target `prod`.

## Notas

- `Dockerfile.worker` parte de `mcr.microsoft.com/playwright:v1.47.0-jammy` para no instalar navegadores a mano.
- Imágenes de producción corren como usuario `heyday` (uid 1001), nunca root.
- `tini` como PID 1 para manejar señales correctamente.
- Ninguna imagen de producción copia el `.env`; las variables llegan desde EasyPanel.
