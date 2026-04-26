#!/usr/bin/env bash
# Genera los secretos Level 2 necesarios para el .env / EasyPanel.
# No guarda nada en disco; solo imprime a stdout. Cópialos manualmente.

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl no está disponible." >&2
  exit 1
fi

echo "# Pega estos valores en tu .env (dev) o en las env vars de EasyPanel (prod)."
echo "# NUNCA los commites."
echo
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "CREDENTIAL_MASTER_KEY=$(openssl rand -base64 32 | tr -d '\n')"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"
