import { describe, expect, it } from "vitest";

import { persistedCategoryLabel, resolveTypedCategory } from "./category";
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
      websiteUrl: "example.com",
    });
    expect(business.id).toBe("audit-1");
    expect(business.websiteUrl).toBe("https://example.com/");
    expect(business.locations[0]?.address).toBe("West End, Brisbane");
    expect(business.userId).toBeNull();
    expect(business.categoryLabel).toBeNull();
  });

  it("keeps a typed category label beside the other scoring bucket", () => {
    const choice = resolveTypedCategory("florist");
    expect(choice).toStrictEqual({ categoryId: "retail", label: "Florist" });
    const business = businessFromCreateRequest({
      category: choice.categoryId,
      categoryLabel: persistedCategoryLabel(choice),
      id: "audit-florist",
      locations: [],
      name: "Stem",
    });
    expect(business.category).toBe("retail");
    expect(business.categoryLabel).toBe("Florist");
    expect(resolveTypedCategory("Food and drink")).toStrictEqual({
      categoryId: "food",
      label: "Food and drink",
    });
    expect(
      persistedCategoryLabel({
        categoryId: "food",
        label: "Food and drink",
      })
    ).toBeNull();
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
    expect(loaded?.websiteUrl).toBe("https://example.com/");
  });

  it("marks entitlements unavailable when Convex is down", async () => {
    const owner = await getActiveEntitlementOwner("missing");
    expect(owner).toStrictEqual({ backendAvailable: false });
    await expect(probeConvexBusinesses()).resolves.toBe("error");
  });
});
