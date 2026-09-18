import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const readConvex = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "../convex", name), "utf-8");

describe("Convex health isolation", () => {
  it("keeps businesses lookups free of Better Auth", () => {
    const source = readConvex("businesses.ts");
    expect(source).not.toMatch(/from ["']\.\/auth["']/u);
    expect(source).not.toMatch(/import\(["']\.\/auth["']\)/u);
    expect(source).toMatch(/export const getByExternalId = query\(/u);
  });

  it("registers Better Auth HTTP routes lazily", () => {
    const source = readConvex("http.ts");
    expect(source).toMatch(/registerRoutesLazy/u);
    expect(source).not.toMatch(/[^.]registerRoutes\(/u);
  });
});
