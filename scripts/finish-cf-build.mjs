import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const wranglerPath = path.join(root, "dist/server/wrangler.json");

const readBranch = () => {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: root,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "main";
  }
};

const branch = readBranch();
if (branch === "main") {
  process.exit(0);
}

const raw = readFileSync(wranglerPath, "utf-8");
const config = JSON.parse(raw);

delete config.routes;

if (Array.isArray(config.services)) {
  config.services = config.services.filter(
    (entry) => entry?.binding !== "WORKER_SELF_REFERENCE"
  );
  if (config.services.length === 0) {
    delete config.services;
  }
}

writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);
