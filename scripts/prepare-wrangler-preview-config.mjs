import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

const wranglerObjectSchema = z.record(z.string(), z.unknown());

export const prepareWranglerPreviewConfig = () => {
  const raw = readFileSync(serverConfigPath, "utf-8");
  const parsed = JSON.parse(raw);
  const config = wranglerObjectSchema.parse(parsed);
  const previewConfig = { ...config };
  delete previewConfig.routes;
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
