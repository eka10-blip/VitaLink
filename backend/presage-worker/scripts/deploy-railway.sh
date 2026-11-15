#!/bin/zsh
# Deploy presage-worker to Railway and print the public HTTPS URL.
# Prerequisites: `railway login` once. Never prints secret values.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: npm i -g @railway/cli"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: railway login"
  exit 1
fi

# Create/link project if needed
if ! railway status >/dev/null 2>&1; then
  railway init --name vitalink-presage-worker || true
fi

# Load non-empty keys from local .env into Railway (values never echoed)
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    [ -z "$key" ] && continue
    [ "$key" = "PORT" ] && continue
    [ -z "$val" ] && continue
    railway variables set "${key}=${val}" >/dev/null
    echo "set $key"
  done < .env
fi

railway variables set "PRESAGE_MODE=live" >/dev/null 2>&1 || true

echo "Uploading…"
railway up --detach --path-as-root .

echo "Generating public domain…"
railway domain 2>/dev/null || true

echo
echo "Public URL (use as EXPO_PUBLIC_PRESAGE_WORKER_URL):"
railway domain 2>/dev/null || railway status
echo
echo "Health check once deploy finishes:"
echo '  curl -sS "$(railway domain)/health"'
