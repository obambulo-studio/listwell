import { readFileSync } from "node:fs";
import path from "node:path";

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

describe("listwell Worker custom domains", () => {
  it("binds only the apex host so deploy does not fight www-to-apex", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "..", "wrangler.jsonc"),
      "utf-8"
    );
    expect(source).toContain('"pattern": "listwell.dev"');
    expect(source).not.toContain('"pattern": "www.listwell.dev"');
  });
});
