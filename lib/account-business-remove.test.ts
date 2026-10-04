import { describe, expect, it, vi } from "vitest";

import {
  canRemoveOwnedBusiness,
  entitlementBelongsToAnotherUser,
  otherAccountsStillHaveAccessMessage,
  removalBillingTarget,
  removalBlockedByOtherActiveEntitlement,
  removeOwnedBusiness,
  subscriptionIdsToRevoke,
} from "./account-business-remove";
import type { RemovalEntitlement } from "./account-business-remove";

const row = (
  status: RemovalEntitlement["status"],
  userId: string | null,
  polarSubscriptionId: string | null = null,
  extras: Partial<RemovalEntitlement> = {}
): RemovalEntitlement => ({
  kind: "report_once",
  polarCustomerId: null,
  polarSubscriptionId,
  purchaserEmail: null,
  status,
  userId,
  ...extras,
});

describe(canRemoveOwnedBusiness, () => {
  it("allows removal when the session user owns the business", () => {
    expect(
      canRemoveOwnedBusiness({
        ownerId: "user-1",
        sessionUserId: "user-1",
      })
    ).toBeTruthy();
  });

  it("blocks removal when there is no owner", () => {
    expect(
      canRemoveOwnedBusiness({
        ownerId: null,
        sessionUserId: "user-1",
      })
    ).toBeFalsy();
  });

  it("blocks removal for a different signed-in user", () => {
    expect(
      canRemoveOwnedBusiness({
        ownerId: "user-2",
        sessionUserId: "user-1",
      })
    ).toBeFalsy();
  });
});

describe(removalBlockedByOtherActiveEntitlement, () => {
  it("blocks when another account has an active entitlement", () => {
    expect(
      removalBlockedByOtherActiveEntitlement(
        [row("active", "user-2")],
        "user-1"
      )
    ).toBeTruthy();
  });

  it("allows the owner's own active entitlement", () => {
    expect(
      removalBlockedByOtherActiveEntitlement(
        [row("active", "user-1", "sub_owner")],
        "user-1"
      )
    ).toBeFalsy();
  });

  it("allows an active entitlement that is not assigned to an account", () => {
    expect(
      removalBlockedByOtherActiveEntitlement(
        [row("active", null, "sub_open")],
        "user-1"
      )
    ).toBeFalsy();
  });

  it("allows a revoked entitlement that belongs to another account", () => {
    expect(
      removalBlockedByOtherActiveEntitlement(
        [row("revoked", "user-2", "sub_old")],
        "user-1"
      )
    ).toBeFalsy();
  });
});

describe(subscriptionIdsToRevoke, () => {
  it("returns distinct subscription ids for the owner and unassigned active rows", () => {
    expect(
      subscriptionIdsToRevoke(
        [
          row("active", "user-1", "sub_owner"),
          row("active", null, "sub_open"),
          row("active", "user-1", "sub_owner"),
          row("active", "user-1", "  "),
        ],
        "user-1"
      )
    ).toStrictEqual(["sub_owner", "sub_open"]);
  });

  it("skips revoked rows and another account's subscription", () => {
    expect(
      subscriptionIdsToRevoke(
        [
          row("revoked", "user-1", "sub_old"),
          row("active", "user-2", "sub_other"),
          row("active", "user-1", null),
        ],
        "user-1"
      )
    ).toStrictEqual([]);
  });
});

describe(removalBillingTarget, () => {
  it("marks monthly as recurring but keeps account analytics subscriptions", () => {
    expect(
      removalBillingTarget(
        [
          row("active", "user-1", "sub_monthly", {
            kind: "report_monthly",
            polarCustomerId: "cus_1",
            purchaserEmail: "ada@example.com",
          }),
          row("active", "user-1", "sub_analytics", {
            kind: "analytics_10k",
          }),
        ],
        "user-1"
      )
    ).toStrictEqual({
      polarCustomerId: "cus_1",
      purchaserEmail: "ada@example.com",
      recurring: true,
      subscriptionIds: ["sub_monthly"],
    });
  });

  it("does not treat analytics-only billing as recurring on removal", () => {
    expect(
      removalBillingTarget(
        [
          row("active", "user-1", "sub_analytics", {
            kind: "analytics_10k",
            polarCustomerId: "cus_1",
          }),
        ],
        "user-1"
      )
    ).toStrictEqual({
      polarCustomerId: "cus_1",
      purchaserEmail: null,
      recurring: false,
      subscriptionIds: [],
    });
  });

  it("ignores a one-time purchase and another account's subscription", () => {
    expect(
      removalBillingTarget(
        [
          row("active", "user-1", null, { kind: "report_once" }),
          row("active", "user-2", "sub_other", {
            kind: "report_monthly",
            polarCustomerId: "cus_other",
          }),
          row("revoked", "user-1", "sub_old", { kind: "report_monthly" }),
        ],
        "user-1"
      )
    ).toStrictEqual({
      polarCustomerId: null,
      purchaserEmail: null,
      recurring: false,
      subscriptionIds: [],
    });
  });
});

describe(entitlementBelongsToAnotherUser, () => {
  it("keeps rows assigned to a different account", () => {
    expect(entitlementBelongsToAnotherUser("user-2", "user-1")).toBeTruthy();
  });

  it("drops the owner's rows and unassigned rows", () => {
    expect(entitlementBelongsToAnotherUser("user-1", "user-1")).toBeFalsy();
    expect(entitlementBelongsToAnotherUser(null, "user-1")).toBeFalsy();
  });
});

describe(removeOwnedBusiness, () => {
  it("maps HTTP 409 to the other-accounts message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: "ignored" }, { status: 409 }))
    );
    try {
      await expect(removeOwnedBusiness("biz-1")).rejects.toThrow(
        otherAccountsStillHaveAccessMessage
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces a billing failure from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error:
              "Billing is not configured, so this business cannot be removed",
          },
          { status: 500 }
        )
      )
    );
    try {
      await expect(removeOwnedBusiness("biz-1")).rejects.toThrow(
        "Billing is not configured, so this business cannot be removed"
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
