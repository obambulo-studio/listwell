#!/usr/bin/env bash
set -euo pipefail

ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
APEX="${LISTWELL_APEX:-listwell.dev}"

if [[ -z "$ZONE_ID" || -z "$API_TOKEN" ]]; then
  echo "Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN to publish DNS-AID records." >&2
  exit 1
fi

api() {
  local method=$1
  local path=$2
  local data=${3:-}
  if [[ -n "$data" ]]; then
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${path}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data"
  else
    curl -sS -X "$method" "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}${path}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

upsert_https() {
  local name=$1
  local alpn=$2
  local payload
  payload=$(cat <<EOF
{
  "type": "HTTPS",
  "name": "${name}",
  "ttl": 3600,
  "data": {
    "priority": 1,
    "target": "${APEX}",
    "value": "alpn=\\"${alpn}\\" port=443"
  }
}
EOF
)
  local existing
  existing=$(api GET "/dns_records?type=HTTPS&name=${name}.${APEX}")
  local record_id
  record_id=$(echo "$existing" | node -e "
    const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const row=(d.result||[])[0];
    process.stdout.write(row&&row.id?row.id:'');
  ")
  if [[ -n "$record_id" ]]; then
    api PUT "/dns_records/${record_id}" "$payload" >/dev/null
    echo "Updated HTTPS ${name}.${APEX}"
  else
    api POST "/dns_records" "$payload" >/dev/null
    echo "Created HTTPS ${name}.${APEX}"
  fi
}

upsert_https "_index._agents" "h2,mcp"
upsert_https "_mcp._agents" "mcp,h2"
upsert_https "_a2a._agents" "a2a,h2"

echo "Enable DNSSEC for ${APEX} in Cloudflare if not already on (see docs/DNS-AID.md)."
