import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const wranglerPath = path.join(root, "wrangler.jsonc");
const workerEntry = path.join(root, "dist/server/index.js");

const source = readFileSync(wranglerPath, "utf-8");
const patched = source.replace(
  /"main"\s*:\s*"vinext\/server\/fetch-handler"/u,
  '"main": "dist/server/index.js"'
);

if (patched === source) {
  throw new Error(
    "Could not patch wrangler.jsonc main for Workers preview deploy."
  );
}

writeFileSync(wranglerPath, patched);
console.log(`Patched ${wranglerPath} main → dist/server/index.js (${workerEntry})`);
