import { describe, expect, it } from "vitest";

import { destinationAfterSignIn, safeAppPath } from "./query-params";

describe(destinationAfterSignIn, () => {
  it("sends a new sign-in to the account page", () => {
    expect(destinationAfterSignIn(safeAppPath())).toBe("/account");
    expect(destinationAfterSignIn("/")).toBe("/account");
  });

  it("keeps an explicit return path", () => {
    expect(destinationAfterSignIn("/account/profile")).toBe("/account/profile");
    expect(destinationAfterSignIn("/api/account/billing")).toBe(
      "/api/account/billing"
    );
  });
});
