import { describe, expect, it } from "vitest";

import { businessSchema } from "./schema";
import { parseActiveEntitlementOwnerValue } from "./data";

describe(parseActiveEntitlementOwnerValue, () => {
  it("accepts missing Polar billing fields on an active owner", () => {
    expect(
      parseActiveEntitlementOwnerValue({
        kind: "report_once",
        monthlyCancelled: false,
        ownerEmail: null,
        ownerUserId: "user_1",
        unlocked: true,
      })
    ).toStrictEqual({
      kind: "report_once",
      monthlyCancelled: false,
      ownerEmail: null,
      ownerUserId: "user_1",
      polarOrderId: null,
      purchaserEmail: null,
      unlocked: true,
    });
  });
});

describe("business website parsing", () => {
  it("coerces a stored bare host when loading a business", () => {
    const business = businessSchema.parse({
      category: "food",
      createdAt: "2026-01-01T00:00:00.000Z",
      deliverooUrl: null,
      doorDashUrl: null,
      facebookUsername: null,
      id: "biz_1",
      instagramUsername: null,
      linkedinUrl: null,
      locations: [],
      menulogUrl: null,
      name: "Example cafe",
      tiktokUsername: null,
      uberEatsUrl: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      userId: null,
      websiteUrl: "assetal.store",
      xUsername: null,
      youtubeUrl: null,
    });
    expect(business.websiteUrl).toBe("https://assetal.store/");
  });
});
