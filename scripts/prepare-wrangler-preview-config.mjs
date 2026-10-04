import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

export const prepareWranglerPreviewConfig = () => {
  const raw = readFileSync(serverConfigPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("dist/server/wrangler.json must be a JSON object");
  }
  const config = parsed;
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
