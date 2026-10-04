import { describe, expect, it } from "vitest";

import { webAnalyticsMenuAction } from "./account-web-analytics-menu";

describe(webAnalyticsMenuAction, () => {
  it("opens analytics for a business you own", () => {
    expect(webAnalyticsMenuAction({ owned: true })).toBe("manage-analytics");
  });

  it("hides analytics for a business you do not own", () => {
    expect(webAnalyticsMenuAction({ owned: false })).toBeNull();
  });
});
