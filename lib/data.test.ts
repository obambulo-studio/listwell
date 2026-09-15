import { describe, expect, it } from "vitest";

import {
  businessFromCreateRequest,
  createBusiness,
  getActiveEntitlementOwner,
  getBusiness,
  probeConvexBusinesses,
} from "./data";

describe("anonymous audit store", () => {
  it("builds a business document from a create request", () => {
    const business = businessFromCreateRequest({
      category: "food",
      id: "audit-1",
      locations: [{ address: "West End, Brisbane", name: "Blackstar Coffee" }],
      name: "Blackstar Coffee",
      websiteUrl: "https://example.com",
    });
    expect(business.id).toBe("audit-1");
    expect(business.websiteUrl).toBe("https://example.com");
    expect(business.locations[0]?.address).toBe("West End, Brisbane");
    expect(business.userId).toBeNull();
  });

  it("saves and loads an audit when Convex is down", async () => {
    const created = await createBusiness({
      category: "food",
      locations: [{ address: "West End, Brisbane", name: "Blackstar Coffee" }],
      name: "Blackstar Coffee",
      websiteUrl: "https://example.com",
    });
    expect(created.name).toBe("Blackstar Coffee");
    const loaded = await getBusiness(created.id);
    expect(loaded?.id).toBe(created.id);
    expect(loaded?.websiteUrl).toBe("https://example.com");
  });

  it("treats entitlements as locked when Convex is down", async () => {
    const owner = await getActiveEntitlementOwner("missing");
    expect(owner).toStrictEqual({
      kind: null,
      ownerEmail: null,
      ownerUserId: null,
      unlocked: false,
    });
    await expect(probeConvexBusinesses()).resolves.toBe("error");
  });
});
