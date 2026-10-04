import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.join(import.meta.dirname, "..");
const binDir = path.join(root, "node_modules/.bin");
const wrapperPath = path.join(binDir, "wrangler");
const realPath = path.join(binDir, "wrangler-real");
const markerPath = path.join(binDir, ".listwell-wrangler-wrapper");

export const installWranglerBinWrapper = () => {
  const realWrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
  if (!existsSync(realWrangler)) {
    return;
  }
  if (existsSync(markerPath)) {
    return;
  }

  if (!existsSync(realPath) && existsSync(wrapperPath)) {
    const current = readFileSync(wrapperPath, "utf-8");
    if (!current.includes("listwell-wrangler-wrapper")) {
      renameSync(wrapperPath, realPath);
    }
  }

  const shell = `#!/usr/bin/env bash
set -euo pipefail
ROOT="${root.replaceAll('"', '\\"')}"
REAL="$ROOT/node_modules/wrangler/bin/wrangler.js"
if [[ "\${1:-}" == "preview" && -z "\${LISTWELL_WRANGLER_PREVIEW_WRAPPED:-}" ]]; then
  export LISTWELL_WRANGLER_PREVIEW_WRAPPED=1
  exec node "$ROOT/scripts/cf-preview-deploy.mjs"
fi
exec node "$REAL" "$@"
`;

  writeFileSync(wrapperPath, shell);
  chmodSync(wrapperPath, 0o755);
  writeFileSync(markerPath, "installed\n");
};

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === executedPath) {
  installWranglerBinWrapper();
}
