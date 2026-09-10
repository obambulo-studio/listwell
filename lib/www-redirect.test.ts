import { describe, expect, it } from "vitest";

import { wwwToApexHref } from "./www-redirect";

describe(wwwToApexHref, () => {
  it("redirects www to apex and keeps path and query", () => {
    expect(
      wwwToApexHref("https://www.listwell.dev/sign-in?next=%2Faccount")
    ).toBe("https://listwell.dev/sign-in?next=%2Faccount");
  });

  it("upgrades http www to https apex", () => {
    expect(wwwToApexHref("http://www.listwell.dev/account")).toBe(
      "https://listwell.dev/account"
    );
  });

  it("leaves apex and other hosts unchanged", () => {
    expect(wwwToApexHref("https://listwell.dev/sign-in")).toBeNull();
    expect(wwwToApexHref("https://www.example.com/")).toBeNull();
  });

  it("rejects an invalid URL", () => {
    expect(() => wwwToApexHref("not-a-url")).toThrow(/Invalid URL/u);
  });
});
