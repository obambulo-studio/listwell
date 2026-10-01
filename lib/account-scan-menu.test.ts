import { describe, expect, it } from "vitest";

import { accountScanMenuFlags } from "./account-scan-menu";

describe(accountScanMenuFlags, () => {
  it("offers add when monthly billing is on and plan is not monthly", () => {
    expect(
      accountScanMenuFlags({ monthlyScansAvailable: true, plan: "once" })
    ).toStrictEqual({
      canAddMonthlyScans: true,
      canCancelMonthlyScans: false,
    });
  });

  it("offers cancel when plan is monthly", () => {
    expect(
      accountScanMenuFlags({ monthlyScansAvailable: true, plan: "monthly" })
    ).toStrictEqual({
      canAddMonthlyScans: false,
      canCancelMonthlyScans: true,
    });
  });

  it("hides add when monthly billing is off", () => {
    expect(
      accountScanMenuFlags({ monthlyScansAvailable: false, plan: "once" })
    ).toStrictEqual({
      canAddMonthlyScans: false,
      canCancelMonthlyScans: false,
    });
  });
});
