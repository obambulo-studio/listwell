#!/usr/bin/env bash
set -euo pipefail

# Export early-access sign-ups stored in AUDIT_KV (prefix site-interest:by-email:).
# Requires wrangler logged in. Does not need the site gate password.

root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/wrangler.jsonc"
prefix="site-interest:by-email:"
out="${1:-site-interest-export.json}"

cd "$root"
keys="$(bunx wrangler kv key list --binding AUDIT_KV --prefix "$prefix" --config "$config")"
if [[ "$keys" == "[]" ]]; then
  echo "[]" >"$out"
  echo "Wrote empty export to $out"
  exit 0
fi

python3 - <<'PY' "$keys" "$prefix" "$config" "$out"
import json, subprocess, sys
keys_json, prefix, config, out_path = sys.argv[1:5]
keys = json.loads(keys_json)
records = []
for item in keys:
    name = item["name"]
    raw = subprocess.check_output(
        ["bunx", "wrangler", "kv", "key", "get", name, "--binding", "AUDIT_KV", "--config", config],
        text=True,
    ).strip()
    if raw:
        records.append(json.loads(raw))
records.sort(key=lambda row: row.get("createdAt", 0), reverse=True)
with open(out_path, "w", encoding="utf-8") as handle:
    json.dump(records, handle, indent=2)
    handle.write("\n")
print(f"Wrote {len(records)} record(s) to {out_path}")
PY
