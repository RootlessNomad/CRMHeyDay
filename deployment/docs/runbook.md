# Runbook de deploy — HeyDay CRM en producción

**Dominio:** crm.estudioheyday.com  
**VPS:** 46.202.131.13 (EasyPanel)  
**Última actualización:** 2026-05-07

---

## Requisitos previos

- EasyPanel instalado y accesible en `http://46.202.131.13:3000` (o el puerto que uses)
- Repo en GitHub con acceso de lectura desde EasyPanel
- Dominio `crm.estudioheyday.com` apuntando a `46.202.131.13` (registro A en tu DNS)

---

## 1. Primera vez — setup completo

### 1.1 Crear el proyecto en EasyPanel

1. Entra en EasyPanel → **Projects → New Project**.
2. Nombre: `heyday`.
3. **No** crees servicios manualmente — los importaremos del YAML.

### 1.2 Conectar GitHub

1. EasyPanel → **Settings → Integrations → GitHub**.
2. Autoriza la app de EasyPanel en tu cuenta/organización.
3. Selecciona el repo del CRM.

### 1.3 Generar secretos de producción

En tu máquina local (o en el servidor con `ssh root@46.202.131.13`):

```bash
echo "JWT_ACCESS_SECRET:     $(openssl rand -base64 48)"
echo "JWT_REFRESH_SECRET:    $(openssl rand -base64 48)"
echo "CREDENTIAL_MASTER_KEY: $(openssl rand -base64 32)"
echo "POSTGRES_PASSWORD:     $(openssl rand -base64 24 | tr -d /+= | head -c 32)"
echo "SEED_ALEX_PASSWORD:    $(openssl rand -base64 12)"
echo "SEED_ALBA_PASSWORD:    $(openssl rand -base64 12)"
```

Guárdalos en un gestor de contraseñas (Bitwarden, 1Password, etc.).  
**NUNCA** los subas al repositorio.

### 1.4 Preparar el project.yml

1. Copia `deployment/easypanel/project.yml`.
2. Reemplaza **todos** los `<CAMBIAR_*>` y `<GITHUB_*>` con tus valores reales.
3. Guarda el fichero (no lo subas al repo con los secretos).

### 1.5 Importar el proyecto en EasyPanel

1. EasyPanel → **Projects → heyday → Import**.
2. Pega el contenido del `project.yml` relleno.
3. EasyPanel creará los 5 servicios: `heyday-db`, `heyday-redis`, `heyday-backend`, `heyday-worker`, `heyday-frontend`.

### 1.6 Arrancar DB y Redis primero

1. En EasyPanel → servicios `heyday-db` y `heyday-redis` → **Deploy**.
2. Espera a que ambos estén en estado **Running** (healthcheck verde).

### 1.7 Ejecutar migraciones (una sola vez)

Desde el panel de EasyPanel, abre una terminal en el servicio `heyday-backend`, o usa SSH + docker exec:

```bash
ssh root@46.202.131.13
docker exec -it heyday-backend sh

# Dentro del contenedor:
cd /app/backend
node_modules/.bin/prisma migrate deploy
```

Esto aplica todas las migraciones pendientes en orden, incluyendo:

- `add_calendar_events`
- `add_email_accounts`

### 1.8 Seed inicial (Alex + Alba + taxonomías)

```bash
# Dentro del contenedor heyday-backend:
cd /app
node backend/dist/seed/seed.js
```

O si el script de seed está configurado como npm script:

```bash
pnpm --filter @heyday/backend run seed
```

Este seed crea:

- Usuario Alex (alejandro@estudioheyday.com) con rol `admin`
- Usuario Alba (alba@estudioheyday.com) con rol `admin`
- Taxonomías base (PainPointCategory, ServiceLine, ContentPillar)
- Pipeline por defecto

> **IMPORTANTE**: El seed es idempotente — se puede ejecutar varias veces sin duplicar datos.

### 1.9 Arrancar backend, worker y frontend

1. En EasyPanel → `heyday-backend` → **Deploy**.
2. Espera a que el healthcheck `/health` esté verde.
3. `heyday-worker` → **Deploy**.
4. `heyday-frontend` → **Deploy**.

### 1.10 Configurar dominio y TLS

1. EasyPanel → `heyday-frontend` → **Domains**.
2. Añade dominio: `crm.estudioheyday.com`, puerto `3000`.
3. Activa **HTTPS** (EasyPanel provisiona TLS via Let's Encrypt automáticamente).
4. Espera unos minutos a que el certificado esté listo.
5. Verifica en `https://crm.estudioheyday.com`.

---

## 2. Backups automáticos

### 2.1 Script de backup

El script está en `deployment/scripts/backup-postgres.sh`. Hace `pg_dump` comprimido con retención de 7 días.

### 2.2 Configurar cron en EasyPanel

EasyPanel permite añadir cron jobs al servicio. En `heyday-db`:

1. **EasyPanel → heyday-db → Cron Jobs → Add**.
2. Cron: `0 3 * * *` (diariamente a las 03:00 AM, hora del servidor).
3. Comando: `bash /scripts/backup-postgres.sh`.

> El script necesita acceso a `pg_dump` y un volumen persistente montado en `/var/backups/heyday`.

### 2.3 Alternativa: backup desde el host VPS

```bash
# En el servidor, crear el cron del host:
crontab -e

# Añadir:
0 3 * * * docker exec heyday-db bash /scripts/backup-postgres.sh >> /var/log/heyday-backup.log 2>&1
```

### 2.4 Restaurar backup

```bash
# Listar backups disponibles
docker exec heyday-db ls -lh /var/backups/heyday/

# Restaurar (sustituye YYYY MM DD por la fecha del backup)
docker exec heyday-db sh -c \
  "gunzip -c /var/backups/heyday/heyday_YYYYMMDD_HHMMSS.sql.gz | \
   PGPASSWORD=\$POSTGRES_PASSWORD psql -U postgres heyday_crm"
```

---

## 3. Actualizaciones (redeploy)

### 3.1 Deploy de nueva versión

1. Haz `git push origin main` con los cambios.
2. En EasyPanel → `heyday-backend` → **Redeploy** (o activa auto-deploy).
3. Repite para `heyday-worker` y `heyday-frontend`.
4. Si hay migraciones nuevas:
   ```bash
   docker exec -it heyday-backend sh -c "cd /app/backend && node_modules/.bin/prisma migrate deploy"
   ```

### 3.2 Variables de entorno

Si necesitas cambiar una variable de entorno en producción:

1. EasyPanel → servicio → **Environment**.
2. Edita la variable.
3. **Redeploy** el servicio para que surta efecto.

---

## 4. Acceso y operaciones

### Abrir el CRM

- URL: `https://crm.estudioheyday.com`
- Usuario: `alejandro@estudioheyday.com` / contraseña configurada en `SEED_ALEX_PASSWORD`

### Logs en tiempo real

```bash
docker logs -f heyday-backend
docker logs -f heyday-worker
docker logs -f heyday-frontend
```

O desde EasyPanel → servicio → **Logs**.

### Estado de los servicios

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Reiniciar un servicio

```bash
docker restart heyday-backend
# o desde EasyPanel → servicio → Restart
```

---

## 5. Hardening de producción (ya aplicado en código)

Estos ajustes están activos automáticamente cuando `APP_ENV=production`:

| Ajuste              | Comportamiento                                               |
| ------------------- | ------------------------------------------------------------ |
| Cookie `hd_refresh` | `secure: true`, `httpOnly: true`, `sameSite: lax`            |
| CORS                | Permite solo `APP_URL` (`https://crm.estudioheyday.com`)     |
| Logger              | JSON estructurado (sin pino-pretty)                          |
| Rate limit          | 100 req/min global (Redis); 20-30/min en endpoints IMAP/SMTP |
| Helmet              | Headers de seguridad por defecto                             |
| Contraseñas         | bcrypt cost 12, nunca en logs ni DTOs                        |
| Vault               | AES-256-GCM con `CREDENTIAL_MASTER_KEY`                      |

---

## 6. Troubleshooting

### El frontend no conecta con el backend

Verifica que `NEXT_PUBLIC_API_URL` apunte a `https://crm.estudioheyday.com/api/v1`.  
EasyPanel debe tener un proxy reverso que enrute `/api/v1/*` al backend (puerto 3001).

Si EasyPanel no enruta automáticamente, añade un dominio adicional al `heyday-backend` con el mismo host y path `/api/v1`.

### Error de migraciones al arrancar

```bash
docker exec -it heyday-backend sh
cd /app/backend
node_modules/.bin/prisma migrate status
node_modules/.bin/prisma migrate deploy
```

### CREDENTIAL_MASTER_KEY cambiada accidentalmente

Si cambias `CREDENTIAL_MASTER_KEY` en producción, todas las credenciales cifradas quedan ilegibles. Antes de rotar:

1. Exporta todas las credenciales en claro desde el admin panel.
2. Cambia la key.
3. Re-importa las credenciales.

---

## 7. Checklist de go-live

- [ ] DNS: registro A `crm.estudioheyday.com → 46.202.131.13` activo
- [ ] Secretos generados y guardados en gestor de contraseñas
- [ ] `project.yml` importado en EasyPanel
- [ ] `heyday-db` y `heyday-redis` en estado Running
- [ ] Migraciones ejecutadas sin errores (`prisma migrate deploy`)
- [ ] Seed ejecutado: Alex + Alba + taxonomías creados
- [ ] `heyday-backend` healthcheck `/health` verde
- [ ] `heyday-worker` en estado Running
- [ ] `heyday-frontend` en estado Running
- [ ] TLS activo en `https://crm.estudioheyday.com`
- [ ] Login con `alejandro@estudioheyday.com` funciona
- [ ] Cron de backup configurado (0 3 \* \* \*)
- [ ] Auto-deploy activado para el branch `main`
