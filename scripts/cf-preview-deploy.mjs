import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { applyWranglerPreviewBranchPatch } from "./patch-wrangler-preview-branch.mjs";
import { prepareWranglerPreviewConfig } from "./prepare-wrangler-preview-config.mjs";
import { installWranglerBinWrapper } from "./wrangler-bin-wrapper.mjs";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");

const ensureVinextBuildOutput = () => {
  if (!existsSync(serverConfigPath)) {
    throw new Error(
      "Missing dist/server/wrangler.json. Run bun run cf:build (or bun run build) before cf:preview-deploy."
    );
  }
};

const sanitizePreviewName = (value) => {
  const cleaned = value
    .replaceAll(/[^a-zA-Z0-9-]/gu, "-")
    .replaceAll(/-+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .toLowerCase();
  return cleaned.length > 0 ? cleaned.slice(0, 63) : "preview";
};

const resolvePreviewName = () => {
  const pullRequestNumber =
    process.env.PULL_REQUEST_NUMBER ??
    process.env.PR_NUMBER ??
    process.env.GITHUB_EVENT_PULL_REQUEST_NUMBER;
  if (typeof pullRequestNumber === "string" && pullRequestNumber.length > 0) {
    return `pr-${pullRequestNumber}`;
  }

  const branchCandidates = [
    process.env.WORKERS_CI_BRANCH,
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
    process.env.CF_PAGES_BRANCH,
  ];
  for (const branch of branchCandidates) {
    if (typeof branch === "string" && branch.length > 0 && branch !== "HEAD") {
      if (branch === "main") {
        continue;
      }
      return sanitizePreviewName(branch);
    }
  }

  return "preview";
};

ensureVinextBuildOutput();
installWranglerBinWrapper();
applyWranglerPreviewBranchPatch();
prepareWranglerPreviewConfig();

const previewName = resolvePreviewName();
const wranglerCli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const result = spawnSync(
  "node",
  [
    wranglerCli,
    "preview",
    "--config",
    "dist/server/wrangler.preview.json",
    "--name",
    previewName,
  ],
  { cwd: root, stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
