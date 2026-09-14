#!/usr/bin/env bash
set -euo pipefail

# Prove Discover → save → checks on a live Listwell origin.
# Usage: bun run smoke:discover [https://listwell.dev]

base="${1:-https://listwell.dev}"
base="${base%/}"

json_field() {
  python3 -c 'import json,sys; print(json.load(sys.stdin)'"$1"')'
}

echo "GET $base/api/health"
health="$(curl -fsS "$base/api/health")"
echo "$health"
ok="$(printf '%s' "$health" | json_field '["ok"]')"
if [[ "$ok" != "True" ]]; then
  echo "Health check says Discover is not ready (need AUDIT_KV)." >&2
  exit 1
fi

echo "POST $base/api/discover"
discover="$(curl -fsS -X POST "$base/api/discover" \
  -H "content-type: application/json" \
  -d '{"businessName":"Blackstar Coffee","near":"Brisbane"}')"
candidates="$(printf '%s' "$discover" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("candidates") or []))')"
if [[ "$candidates" -lt 1 ]]; then
  echo "Discover returned no OpenStreetMap candidates." >&2
  echo "$discover" >&2
  exit 1
fi

echo "POST $base/api/businesses"
business="$(curl -fsS -X POST "$base/api/businesses" \
  -H "content-type: application/json" \
  -d '{"name":"Blackstar Coffee","category":"food","websiteUrl":"https://example.com","locations":[{"name":"Blackstar Coffee","address":"West End, Brisbane"}]}')"
id="$(printf '%s' "$business" | json_field '["id"]')"
if [[ -z "$id" || "$id" == "None" ]]; then
  echo "Could not save this audit." >&2
  echo "$business" >&2
  exit 1
fi

echo "GET $base/api/businesses/$id"
loaded="$(curl -fsS "$base/api/businesses/$id")"
name="$(printf '%s' "$loaded" | json_field '["name"]')"
if [[ "$name" != "Blackstar Coffee" ]]; then
  echo "Saved audit did not load back." >&2
  echo "$loaded" >&2
  exit 1
fi

echo "GET $base/api/businesses/$id/checks"
checks="$(curl -fsS "$base/api/businesses/$id/checks")"
results="$(printf '%s' "$checks" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("results") or {}))')"
if [[ "$results" -lt 1 ]]; then
  echo "Checks did not return results." >&2
  echo "$checks" >&2
  exit 1
fi

echo "Discover e2e passed. Report: $base/$id"
