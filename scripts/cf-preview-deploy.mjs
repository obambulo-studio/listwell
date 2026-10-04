import { spawnSync } from "node:child_process";
import path from "node:path";

import { applyWranglerPreviewBranchPatch } from "./patch-wrangler-preview-branch.mjs";
import { prepareWranglerPreviewConfig } from "./prepare-wrangler-preview-config.mjs";

const root = path.join(import.meta.dirname, "..");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

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

applyWranglerPreviewBranchPatch();
prepareWranglerPreviewConfig();

const previewName = resolvePreviewName();
const result = spawnSync(
  "npx",
  ["wrangler", "preview", "--config", previewConfigPath, "--name", previewName],
  { cwd: root, stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
