import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const root = path.join(import.meta.dirname, "..");
const serverConfigPath = path.join(root, "dist/server/wrangler.json");
const previewConfigPath = path.join(root, "dist/server/wrangler.preview.json");

const wranglerObjectSchema = z.record(z.string(), z.unknown());
const kvNamespaceSchema = z
  .object({
    binding: z.string(),
    id: z.string().optional(),
  })
  .passthrough();

/** Live preview namespace `listwell-audit-preview`. */
export const PREVIEW_AUDIT_KV_NAMESPACE_ID = "543048c92e7f44b694365d78521bf495";
const PREVIEW_KV_ID_PATTERN = /^[0-9a-f]{32}$/u;
const sourceConfigPath = path.join(root, "wrangler.jsonc");

const stripJsoncComments = (source) => source.replaceAll(/^\s*\/\/.*$/gmu, "");

export const previewAuditKvIdFromConfig = (config, envId) => {
  const configured =
    typeof envId === "string" ? envId.trim().toLowerCase() : "";
  if (PREVIEW_KV_ID_PATTERN.test(configured)) {
    return configured;
  }
  const previews = config?.previews;
  const namespaces =
    previews && typeof previews === "object"
      ? previews.kv_namespaces
      : undefined;
  if (!Array.isArray(namespaces)) {
    return PREVIEW_AUDIT_KV_NAMESPACE_ID;
  }
  for (const entry of namespaces) {
    const parsed = kvNamespaceSchema.safeParse(entry);
    if (
      parsed.success &&
      parsed.data.binding === "AUDIT_KV" &&
      parsed.data.id
    ) {
      return parsed.data.id;
    }
  }
  return PREVIEW_AUDIT_KV_NAMESPACE_ID;
};

export const readPreviewAuditKvNamespaceId = () => {
  let source = {};
  if (existsSync(sourceConfigPath)) {
    try {
      source = JSON.parse(
        stripJsoncComments(readFileSync(sourceConfigPath, "utf-8"))
      );
    } catch {
      source = {};
    }
  }
  return previewAuditKvIdFromConfig(
    source,
    process.env.AUDIT_KV_PREVIEW_NAMESPACE_ID
  );
};

export const retargetPreviewKvNamespaces = (namespaces, previewKvId) => {
  if (!Array.isArray(namespaces)) {
    return namespaces;
  }
  return namespaces.map((entry) => {
    const parsed = kvNamespaceSchema.safeParse(entry);
    if (!parsed.success || parsed.data.binding !== "AUDIT_KV") {
      return entry;
    }
    return { ...parsed.data, id: previewKvId };
  });
};

/** Fields that break `wrangler preview` on Workers Builds (production-only). */
export const stripProductionOnlyWranglerFields = (
  config,
  previewKvId = readPreviewAuditKvNamespaceId()
) => {
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

  // Preview deploy config only (production wrangler.jsonc keeps workers_dev false).
  previewConfig.workers_dev = true;
  previewConfig.kv_namespaces = retargetPreviewKvNamespaces(
    previewConfig.kv_namespaces,
    previewKvId
  );
  if (previewConfig.previews && typeof previewConfig.previews === "object") {
    const previews = { ...previewConfig.previews };
    previews.kv_namespaces = retargetPreviewKvNamespaces(
      previews.kv_namespaces,
      previewKvId
    );
    previewConfig.previews = previews;
  }

  return previewConfig;
};

export const prepareWranglerPreviewConfig = () => {
  if (!existsSync(serverConfigPath)) {
    throw new Error(
      `Missing ${serverConfigPath}. Run the full vinext build (bun run build) so Cloudflare emits dist/server/wrangler.json before preparing preview config.`
    );
  }
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
