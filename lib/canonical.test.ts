import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalFor, listwellMetadataBase } from "./site-metadata";

const repoRoot = path.resolve(import.meta.dirname, "..");

const publicPages: [file: string, pathname: string][] = [
  ["app/page.tsx", "/"],
  ["app/chat/page.tsx", "/chat"],
  ["app/discover/page.tsx", "/discover"],
  ["app/example/page.tsx", "/example"],
  ["app/how-it-works/page.tsx", "/how-it-works"],
  ["app/new/page.tsx", "/new"],
  ["app/privacy/page.tsx", "/privacy"],
  ["app/refunds/page.tsx", "/refunds"],
  ["app/sign-in/page.tsx", "/sign-in"],
  ["app/terms/page.tsx", "/terms"],
];

describe("canonical urls", () => {
  it("resolves canonicals against the apex origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
    expect(listwellMetadataBase().href).toBe("https://listwell.dev/");
    expect(
      new URL(canonicalFor("/terms").canonical, listwellMetadataBase()).href
    ).toBe("https://listwell.dev/terms");
  });

  it.each(publicPages)(
    "%s declares a self-referencing canonical",
    (file, pathname) => {
      const source = readFileSync(path.join(repoRoot, file), "utf-8");
      expect(source).toContain(`alternates: canonicalFor("${pathname}")`);
    }
  );

  it("sets metadataBase in the root layout", () => {
    const source = readFileSync(path.join(repoRoot, "app/layout.tsx"), "utf-8");
    expect(source).toContain("metadataBase: listwellMetadataBase()");
  });

  it("gives the homepage an absolute title so the template is not doubled", () => {
    const source = readFileSync(path.join(repoRoot, "app/page.tsx"), "utf-8");
    expect(source).toContain("absolute: LISTWELL_HOME_TITLE");
    expect(source).not.toContain('title: "Listwell"');
  });

  it.each(["app/[id]/page.tsx", "app/share/[token]/page.tsx"])(
    "%s has no canonical",
    (file) => {
      const source = readFileSync(path.join(repoRoot, file), "utf-8");
      expect(source).not.toContain("canonicalFor");
    }
  );
});
