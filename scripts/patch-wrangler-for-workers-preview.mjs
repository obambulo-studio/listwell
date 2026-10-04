import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const wranglerPath = path.join(root, "wrangler.jsonc");

const source = readFileSync(wranglerPath, "utf-8");
let patched = source.replace(
  /"main"\s*:\s*"vinext\/server\/fetch-handler"/u,
  '"main": "dist/server/index.js"'
);

patched = patched.replace(/"workers_dev"\s*:\s*false/u, '"workers_dev": true');

patched = patched.replace(
  /\/\/ Apex only[\s\S]*?"routes"\s*:\s*\[[\s\S]*?\],/u,
  ""
);

if (patched === source) {
  throw new Error(
    "Could not patch wrangler.jsonc for Workers preview deploy."
  );
}

writeFileSync(wranglerPath, patched);
console.log(
  "Patched wrangler.jsonc for Workers preview (dist entry, no custom routes)."
);
