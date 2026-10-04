import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const wranglerPath = path.join(root, "wrangler.jsonc");

const source = readFileSync(wranglerPath, "utf-8");

if (source.includes('"main": "dist/server/index.js"')) {
  console.log("wrangler.jsonc already patched for Workers preview.");
  process.exit(0);
}

let patched = source.replace(
  /"main"\s*:\s*"vinext\/server\/fetch-handler"/u,
  '"main": "dist/server/index.js"'
);

patched = patched.replace(/"workers_dev"\s*:\s*false/u, '"workers_dev": true');

patched = patched.replace(
  /\/\/ Apex only[\s\S]*?"routes"\s*:\s*\[[\s\S]*?\],/u,
  ""
);

patched = patched.replace(/"services"\s*:\s*\[[\s\S]*?\],/u, "");

if (patched === source) {
  throw new Error("Could not patch wrangler.jsonc for Workers preview deploy.");
}

writeFileSync(wranglerPath, patched);
console.log(
  "Patched wrangler.jsonc for Workers preview (dist entry, no custom routes)."
);
