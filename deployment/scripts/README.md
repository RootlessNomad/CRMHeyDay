# Deployment Scripts

Scripts de apoyo al deployment. Todos están pensados para correr desde la raíz del repo.

## Scripts

| Script                | Qué hace                                                                                            | Cuándo se usa                            |
| --------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `backup.sh`           | `pg_dump` contra `DATABASE_URL` y guarda dump con timestamp en `backups/`                           | Cron diario en producción                |
| `restore.sh`          | Restaura un dump en `DATABASE_URL`                                                                  | Manual, ante incidente o test de restore |
| `bootstrap-prod.sh`   | Pipeline one-shot: migrate:deploy + seed (idempotente)                                              | Tras primer despliegue a EasyPanel       |
| `generate-secrets.sh` | Imprime valores listos para env: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CREDENTIAL_MASTER_KEY` | Setup inicial                            |

Los scripts se completarán en IT-11 (cuando exista seed real y migraciones reales).
