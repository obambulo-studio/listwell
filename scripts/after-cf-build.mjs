import { writeFileSync } from "node:fs";
import path from "node:path";

import { prepareWranglerPreviewConfig } from "./prepare-wrangler-preview-config.mjs";

const root = path.join(import.meta.dirname, "..");
const rootPreviewConfigPath = path.join(root, "wrangler.json");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

const workersCi = process.env.WORKERS_CI === "1";
if (!workersCi) {
  process.exit(0);
}

const branch = process.env.WORKERS_CI_BRANCH ?? "";
if (branch === "main") {
  process.exit(0);
}

const previewConfig = prepareWranglerPreviewConfig();
const serialized = `${JSON.stringify(previewConfig, null, 2)}\n`;
writeFileSync(rootPreviewConfigPath, serialized);
writeFileSync(serverConfigPath, serialized);
writeFileSync(previewConfigPath, serialized);
