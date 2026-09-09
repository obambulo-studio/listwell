#!/usr/bin/env bash
set -euo pipefail

# Sync Worker secrets from .env.local to the listwell Worker (wrangler.jsonc).
# Requires: wrangler logged in and the Worker deployed at least once.

root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$root/.env.local"
config="$root/wrangler.jsonc"
secrets_file="$(mktemp)"
trap 'rm -f "$secrets_file"' EXIT

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file — copy .env.example first." >&2
  exit 1
fi

read_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$env_file" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}"
}

keys=(
  GOOGLE_API_KEY
  GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID
  APPLE_MAPKIT_TEAM_ID
  APPLE_MAPKIT_KEY_ID
  APPLE_MAPKIT_PRIVATE_KEY
  LISTWELL_BROWSER_RENDERING_ACCOUNT_ID
  LISTWELL_BROWSER_RENDERING_API_TOKEN
  POLAR_ACCESS_TOKEN
  POLAR_WEBHOOK_SECRET
  POLAR_PRODUCT_REPORT_ONCE
  POLAR_PRODUCT_REPORT_MONTHLY
  POLAR_SERVER
  INTERNAL_API_SECRET
  SITE_URL
  USESEND_API_KEY
  USESEND_FROM
  USESEND_BASE_URL
)

for key in "${keys[@]}"; do
  value="$(read_env "$key")"
  if [[ -n "$value" ]]; then
    printf '%s=%q\n' "$key" "$value" >>"$secrets_file"
  fi
done

if [[ ! -s "$secrets_file" ]]; then
  echo "No Worker secrets found in .env.local." >&2
  exit 1
fi

cd "$root"
bunx wrangler secret bulk "$secrets_file" --config "$config"
echo "Worker secrets synced for listwell."
