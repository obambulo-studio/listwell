import { describe, expect, it } from "vitest";

import {
  ANALYTICS_BANDS,
  analyticsBandById,
  analyticsBandByEntitlementKind,
  formatEventLimit,
} from "./analytics-pricing";

describe("analytics pricing bands", () => {
  it("lists three GST-inclusive bands", () => {
    expect(ANALYTICS_BANDS).toHaveLength(3);
    expect(analyticsBandById("10k").displayPrice).toBe("A$9/mo");
    expect(analyticsBandById("100k").displayPrice).toBe("A$19/mo");
    expect(analyticsBandById("1m").displayPrice).toBe("A$49/mo");
  });

  it("maps entitlement kinds to event limits", () => {
    expect(
      analyticsBandByEntitlementKind("analytics_10k").eventLimitPerMonth
    ).toBe(10_000);
    expect(formatEventLimit(1_000_000)).toBe("1,000,000");
  });
});
