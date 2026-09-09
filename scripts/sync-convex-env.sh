#!/usr/bin/env bash
set -euo pipefail

# Sync shared secrets from .env.local to the linked Convex dev deployment.
# Requires: npx convex dev has already linked the project (see README).

root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$root/.env.local"

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

site_url="$(read_env SITE_URL)"
auth_secret="$(read_env BETTER_AUTH_SECRET)"
internal_secret="$(read_env INTERNAL_API_SECRET)"
usesend_key="$(read_env USESEND_API_KEY)"
usesend_from="$(read_env USESEND_FROM)"
usesend_base="$(read_env USESEND_BASE_URL)"

if [[ -z "$site_url" || -z "$auth_secret" || -z "$internal_secret" ]]; then
  echo "Set SITE_URL, BETTER_AUTH_SECRET, and INTERNAL_API_SECRET in .env.local first." >&2
  exit 1
fi

if [[ -z "$usesend_key" || -z "$usesend_from" ]]; then
  echo "Warning: USESEND_API_KEY or USESEND_FROM missing — sign-in emails will not send." >&2
fi

cd "$root"
npx convex env set SITE_URL "$site_url"
npx convex env set BETTER_AUTH_SECRET "$auth_secret"
npx convex env set INTERNAL_API_SECRET "$internal_secret"

if [[ -n "$usesend_key" && -n "$usesend_from" ]]; then
  npx convex env set USESEND_API_KEY "$usesend_key"
  npx convex env set USESEND_FROM "$usesend_from"
  if [[ -n "$usesend_base" ]]; then
    npx convex env set USESEND_BASE_URL "$usesend_base"
  fi
fi

echo "Convex env synced for $(grep '^CONVEX_DEPLOYMENT=' "$env_file" | tail -1)"
