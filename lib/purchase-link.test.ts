import { describe, expect, it } from "vitest";

import {
  activePurchaseLinksToUser,
  normalizePurchaserEmail,
} from "./purchase-link";

describe(normalizePurchaserEmail, () => {
  it("trims and lowercases a checkout email", () => {
    expect(normalizePurchaserEmail("  Ada@Example.com ")).toBe(
      "ada@example.com"
    );
  });

  it("rejects a missing email", () => {
    expect(normalizePurchaserEmail()).toBeUndefined();
  });

  it("rejects malformed emails", () => {
    expect(normalizePurchaserEmail("   ")).toBeUndefined();
    expect(normalizePurchaserEmail("ada")).toBeUndefined();
    expect(normalizePurchaserEmail("ada@")).toBeUndefined();
    expect(normalizePurchaserEmail("@example.com")).toBeUndefined();
    expect(normalizePurchaserEmail("ada@@example.com")).toBeUndefined();
  });

  it("rejects emails with spaces", () => {
    expect(normalizePurchaserEmail("ada @example.com")).toBeUndefined();
  });
});

describe(activePurchaseLinksToUser, () => {
  it("links an unlocked purchase that has no account yet", () => {
    expect(
      activePurchaseLinksToUser({ status: "active" }, "user_1")
    ).toBeTruthy();
  });

  it("keeps a purchase already owned by this account", () => {
    expect(
      activePurchaseLinksToUser(
        { status: "active", userId: "user_1" },
        "user_1"
      )
    ).toBeTruthy();
  });

  it("leaves a purchase owned by someone else", () => {
    expect(
      activePurchaseLinksToUser(
        { status: "active", userId: "user_2" },
        "user_1"
      )
    ).toBeFalsy();
  });

  it("ignores a revoked purchase", () => {
    expect(
      activePurchaseLinksToUser({ status: "revoked" }, "user_1")
    ).toBeFalsy();
  });
});
