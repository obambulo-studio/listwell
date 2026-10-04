import { describe, expect, it, vi } from "vitest";
import type * as EngineZod from "zod";

import { runChecks } from "../src/run";
import type { BusinessSnapshot } from "../src/types";

// The Worker bundle resolves this package's `zod` import to the app's Zod 4.
// Zod 4 `z.record(enum, schema)` requires every enum key. Zod 3 does not.
vi.mock(import("zod"), async () => {
  const appZod = await import("../../../node_modules/zod/index.js");
  return appZod as unknown as typeof EngineZod;
});

const services: BusinessSnapshot = {
  category: "services",
  id: "svc-1",
  locations: [],
  name: "Star Compass",
  websiteUrl: null,
};

describe("runChecks partial ids", () => {
  it("returns only the checks that ran", async () => {
    const results = await runChecks(services, ["website-title"], {
      includeQueued: false,
    });

    expect(results["website-title"]?.type).toBe("check");
    expect(results["website-title"]?.value).toBeNull();
    expect(results["website-performance"]).toBeUndefined();
    expect(results["uber-eats-listing"]).toBeUndefined();
  });
});
