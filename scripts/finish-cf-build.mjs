import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const wranglerPath = path.join(root, "dist/server/wrangler.json");

const readGitBranch = () => {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: root,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
};

/** Production Workers Builds check out `main`; previews use other refs or detached HEAD. */
const isProductionBuild = () => {
  const fromEnv =
    process.env.GITHUB_REF_NAME ??
    process.env.CF_PAGES_BRANCH ??
    process.env.WRANGLER_CI_BRANCH;
  if (fromEnv === "main") {
    return true;
  }
  if (fromEnv && fromEnv !== "main") {
    return false;
  }
  const gitBranch = readGitBranch();
  return gitBranch === "main";
};

if (isProductionBuild()) {
  process.exit(0);
}

const raw = readFileSync(wranglerPath, "utf-8");
const config = JSON.parse(raw);

delete config.routes;
delete config.migrations;

if (config.exports && typeof config.exports === "object") {
  const defaultExport = config.exports.default;
  if (defaultExport) {
    config.exports = { default: defaultExport };
  }
}

if (Array.isArray(config.services)) {
  config.services = config.services.filter(
    (entry) => entry?.binding !== "WORKER_SELF_REFERENCE"
  );
  if (config.services.length === 0) {
    delete config.services;
  }
}

writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);
