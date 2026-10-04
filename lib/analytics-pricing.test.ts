import { describe, expect, it } from "vitest";

import {
  ANALYTICS_BANDS,
  ANALYTICS_FREE_EVENTS_PER_MONTH,
  ANALYTICS_HOME_ADDON_PRICING,
  analyticsBandById,
  analyticsBandByEntitlementKind,
  analyticsEventDecision,
  analyticsMonthlyAllowance,
  formatEventLimit,
  highestAnalyticsEntitlementKind,
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

  it("derives homepage add-on copy from the free allowance and bands", () => {
    expect(ANALYTICS_HOME_ADDON_PRICING.priceFrom).toBe("5,000 free");
    expect(ANALYTICS_HOME_ADDON_PRICING.priceNote).toBe(
      "Then A$9/mo–A$49/mo, GST inclusive"
    );
    expect(ANALYTICS_HOME_ADDON_PRICING.features).toHaveLength(3);
  });

  it("keeps the first 5,000 events free, then uses the account band cap", () => {
    expect(ANALYTICS_FREE_EVENTS_PER_MONTH).toBe(5000);
    expect(analyticsMonthlyAllowance(null)).toBe(5000);
    expect(analyticsMonthlyAllowance("analytics_10k")).toBe(10_000);
    expect(
      highestAnalyticsEntitlementKind(["analytics_10k", "analytics_1m"])
    ).toBe("analytics_1m");
  });

  it("counts an enabled site until the account allowance is full", () => {
    expect(
      analyticsEventDecision({
        enabled: true,
        eventCount: 4999,
        kind: null,
      })
    ).toBe("accept");
    expect(
      analyticsEventDecision({
        enabled: true,
        eventCount: 5000,
        kind: null,
      })
    ).toBe("over_quota");
    expect(
      analyticsEventDecision({
        enabled: false,
        eventCount: 0,
        kind: "analytics_100k",
      })
    ).toBe("disabled");
    expect(
      analyticsEventDecision({
        enabled: true,
        eventCount: 10_000,
        kind: "analytics_10k",
      })
    ).toBe("over_quota");
  });
});
