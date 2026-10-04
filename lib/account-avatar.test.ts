import { describe, expect, it } from "vitest";

import { avatarEdgesAreUsable, gravatarAvatarUrl } from "./account-avatar";

describe(avatarEdgesAreUsable, () => {
  it("rejects the 1px upload that hides Gravatar", () => {
    expect(avatarEdgesAreUsable(1, 1)).toBeFalsy();
  });

  it("accepts a real photo", () => {
    expect(avatarEdgesAreUsable(64, 64)).toBeTruthy();
  });
});

describe(gravatarAvatarUrl, () => {
  it("hashes a trimmed, lowercased email", () => {
    expect(gravatarAvatarUrl(" MyEmailAddress@example.com ")).toBe(
      "https://www.gravatar.com/avatar/0bc83cb571cd1c50ba6f3e8a78ef1346?s=64&d=404"
    );
  });

  it("returns null for a blank email", () => {
    expect(gravatarAvatarUrl("  ")).toBeNull();
  });
});
