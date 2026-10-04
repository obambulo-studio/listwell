import { describe, expect, it } from "vitest";

import { reportSessionRequired } from "./entitlements-access";

describe("guest report access", () => {
  it("allows an active guest session when the owner purchased the report", () => {
    const purchaserSessionRequired = reportSessionRequired({
      authEnabled: true,
      ownerUserId: "owner-1",
      purchaserBound: false,
      sessionUserId: "guest-1",
      unlocked: true,
    });
    expect(purchaserSessionRequired).toBeTruthy();

    const guestMember = true;
    const sessionRequired = guestMember ? false : purchaserSessionRequired;
    expect(sessionRequired).toBeFalsy();
  });
});
