import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { applyWranglerPreviewBranchPatch } from "./patch-wrangler-preview-branch.mjs";
import { prepareWranglerPreviewConfig } from "./prepare-wrangler-preview-config.mjs";
import { installWranglerBinWrapper } from "./wrangler-bin-wrapper.mjs";

const root = path.join(import.meta.dirname, "..");
const rootPreviewConfigPath = path.join(root, "wrangler.json");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

export const runAfterCfBuild = () => {
  if (process.env.WORKERS_CI !== "1") {
    return;
  }

  const branch = process.env.WORKERS_CI_BRANCH ?? "";
  if (branch === "main") {
    return;
  }

  applyWranglerPreviewBranchPatch();

  const previewConfig = prepareWranglerPreviewConfig();
  const serialized = `${JSON.stringify(previewConfig, null, 2)}\n`;
  writeFileSync(rootPreviewConfigPath, serialized);
  writeFileSync(serverConfigPath, serialized);
  writeFileSync(previewConfigPath, serialized);
};

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === executedPath) {
  runAfterCfBuild();
}
