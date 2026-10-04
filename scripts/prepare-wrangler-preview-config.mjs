import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

const wranglerObjectSchema = z.record(z.string(), z.unknown());

/** Fields that break `wrangler preview` on Workers Builds (production-only). */
export const stripProductionOnlyWranglerFields = (config) => {
  const previewConfig = { ...config };
  delete previewConfig.routes;
  delete previewConfig.migrations;

  if (previewConfig.exports && typeof previewConfig.exports === "object") {
    const defaultExport = previewConfig.exports.default;
    if (defaultExport) {
      previewConfig.exports = { default: defaultExport };
    }
  }

  if (Array.isArray(previewConfig.services)) {
    previewConfig.services = previewConfig.services.filter(
      (entry) => entry?.binding !== "WORKER_SELF_REFERENCE"
    );
    if (previewConfig.services.length === 0) {
      delete previewConfig.services;
    }
  }

  return previewConfig;
};

export const prepareWranglerPreviewConfig = () => {
  const raw = readFileSync(serverConfigPath, "utf-8");
  const parsed = JSON.parse(raw);
  const config = wranglerObjectSchema.parse(parsed);
  const previewConfig = stripProductionOnlyWranglerFields(config);
  writeFileSync(
    previewConfigPath,
    `${JSON.stringify(previewConfig, null, 2)}\n`
  );
  return previewConfig;
};

const executedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === executedPath) {
  prepareWranglerPreviewConfig();
}
