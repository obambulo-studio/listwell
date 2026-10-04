import { writeFileSync } from "node:fs";
import path from "node:path";

import { prepareWranglerPreviewConfig } from "./prepare-wrangler-preview-config.mjs";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

const onWorkersBuild =
  process.env.WORKERS_CI === "1" ||
  Boolean(process.env.WORKERS_CI_BUILD_UUID?.trim());
if (!onWorkersBuild) {
  process.exit(0);
}

const branch =
  process.env.WORKERS_CI_BRANCH ??
  process.env.GITHUB_HEAD_REF ??
  process.env.CI_COMMIT_REF_NAME ??
  "";
if (branch === "main") {
  process.exit(0);
}

const previewConfig = prepareWranglerPreviewConfig();
const serialized = `${JSON.stringify(previewConfig, null, 2)}\n`;
writeFileSync(serverConfigPath, serialized);
writeFileSync(previewConfigPath, serialized);
