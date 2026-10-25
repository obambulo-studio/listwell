import { describe, expect, it } from "vitest";

import {
  PREVIEW_AUDIT_KV_PLACEHOLDER_ID,
  previewAuditKvIdFromConfig,
  retargetPreviewKvNamespaces,
  stripProductionOnlyWranglerFields,
} from "../scripts/prepare-wrangler-preview-config.mjs";

const productionId = "06b74ff3aa6e41a9a5ea7a6eb365e711";

describe(previewAuditKvIdFromConfig, () => {
  it("prefers a 32-character preview namespace id from the environment", () => {
    expect(
      previewAuditKvIdFromConfig(
        {
          previews: {
            kv_namespaces: [{ binding: "AUDIT_KV", id: "from-file" }],
          },
        },
        "ABCDEF0123456789ABCDEF0123456789"
      )
    ).toBe("abcdef0123456789abcdef0123456789");
  });

  it("reads the previews block, then the placeholder", () => {
    expect(
      previewAuditKvIdFromConfig(
        {
          previews: {
            kv_namespaces: [{ binding: "AUDIT_KV", id: "preview-from-config" }],
          },
        },
        ""
      )
    ).toBe("preview-from-config");
    expect(previewAuditKvIdFromConfig({})).toBe(
      PREVIEW_AUDIT_KV_PLACEHOLDER_ID
    );
  });
});

describe(stripProductionOnlyWranglerFields, () => {
  it("gives preview AUDIT_KV a different id from production", () => {
    const preview = stripProductionOnlyWranglerFields(
      {
        kv_namespaces: [
          { binding: "AUDIT_KV", id: productionId },
          { binding: "OTHER", id: "leave-me" },
        ],
        routes: [{ pattern: "listwell.dev" }],
        workers_dev: false,
      },
      "preview-namespace"
    );
    expect(preview.kv_namespaces).toStrictEqual([
      { binding: "AUDIT_KV", id: "preview-namespace" },
      { binding: "OTHER", id: "leave-me" },
    ]);
    expect(JSON.stringify(preview)).not.toContain(productionId);
    expect(preview.routes).toBeUndefined();
    expect(preview.workers_dev).toBeTruthy();
  });
});

describe(retargetPreviewKvNamespaces, () => {
  it("leaves a missing namespace list alone", () => {
    expect(retargetPreviewKvNamespaces(undefined, "preview")).toBeUndefined();
  });
});
