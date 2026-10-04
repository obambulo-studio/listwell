import { describe, expect, it } from "vitest";

import { runChecks } from "../src/run";
import type { BusinessSnapshot } from "../src/types";

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
