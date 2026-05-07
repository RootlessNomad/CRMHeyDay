#!/usr/bin/env bash
# backup-postgres.sh — Backup diario de PostgreSQL con retención de 7 días.
#
# USO en EasyPanel (cron job en el servicio heyday-db):
#   Comando: bash /scripts/backup-postgres.sh
#   Cron: 0 3 * * *   (cada día a las 03:00 hora del servidor)
#
# ALTERNATIVAMENTE, ejecutar desde el host VPS con docker exec:
#   docker exec heyday-db bash /scripts/backup-postgres.sh
#
# Variables de entorno requeridas (se leen del contenedor postgres):
#   POSTGRES_PASSWORD, POSTGRES_DB (predeterminado: heyday_crm), POSTGRES_USER (predeterminado: postgres)
#
# El backup se guarda en /var/backups/heyday/ dentro del contenedor,
# que debe tener un volumen montado para persistencia.

set -euo pipefail

# ─── Configuración ────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/heyday}"
DB_NAME="${POSTGRES_DB:-heyday_crm}"
DB_USER="${POSTGRES_USER:-postgres}"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/heyday_${TIMESTAMP}.sql.gz"

# ─── Preparar directorio ──────────────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ─── Dump + compress ──────────────────────────────────────────────────────────
echo "[backup] Iniciando pg_dump de ${DB_NAME} → ${BACKUP_FILE}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --host=localhost \
  --port=5432 \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=plain \
  --no-password \
  | gzip -9 > "${BACKUP_FILE}"

echo "[backup] Backup completado: $(du -sh "${BACKUP_FILE}" | cut -f1)"

# ─── Retención: eliminar backups > 7 días ─────────────────────────────────────
echo "[backup] Limpiando backups con más de ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -name "heyday_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] Backups actuales:"
ls -lh "${BACKUP_DIR}/heyday_"*.sql.gz 2>/dev/null || echo "  (ninguno)"

echo "[backup] Listo."
