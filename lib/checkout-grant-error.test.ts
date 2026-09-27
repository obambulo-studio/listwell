import { describe, expect, it } from "vitest";

import { CheckoutGrantError } from "./checkout-grant-error";

describe(CheckoutGrantError, () => {
  it("retains checkout and business ids", () => {
    const error = new CheckoutGrantError(
      "biz_1",
      "chk_1",
      new Error("Convex down")
    );
    expect(error.businessId).toBe("biz_1");
    expect(error.checkoutId).toBe("chk_1");
    expect(error.message).toContain("Could not activate purchase");
    expect(error.message).toContain("Convex down");
  });
});
