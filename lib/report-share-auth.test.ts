import { describe, expect, it } from "vitest";

import { canManageReportShareFromAccess } from "./report-share-access";

describe(canManageReportShareFromAccess, () => {
  it("allows share when the viewer owns an unlocked report", () => {
    expect(
      canManageReportShareFromAccess({
        isOwnerView: true,
        sessionRequired: false,
        unlocked: true,
      })
    ).toBeTruthy();
  });

  it("blocks share for read-only shared report views", () => {
    expect(
      canManageReportShareFromAccess({
        isOwnerView: false,
        sessionRequired: false,
        unlocked: true,
      })
    ).toBeFalsy();
  });

  it("blocks share when sign-in is required for the purchaser", () => {
    expect(
      canManageReportShareFromAccess({
        isOwnerView: true,
        sessionRequired: true,
        unlocked: true,
      })
    ).toBeFalsy();
  });

  it("blocks share on locked reports", () => {
    expect(
      canManageReportShareFromAccess({
        isOwnerView: true,
        sessionRequired: false,
        unlocked: false,
      })
    ).toBeFalsy();
  });
});
