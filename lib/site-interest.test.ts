import { beforeEach, describe, expect, it } from "vitest";

import {
  saveSiteInterest,
  siteInterestInputSchema,
  siteInterestsToCsv,
} from "./site-interest";

describe("site interest input schema", () => {
  it("trims optional fields", () => {
    const parsed = siteInterestInputSchema.parse({
      email: "Owner@Example.com",
      name: "  ",
      note: "Cafe in Fitzroy",
    });
    expect(parsed.email).toBe("owner@example.com");
    expect(parsed.name).toBeUndefined();
    expect(parsed.note).toBe("Cafe in Fitzroy");
  });
});

describe("save site interest", () => {
  let env: CloudflareEnv;

  beforeEach(async () => {
    const store = new Map<string, string>();
    const kv = {
      get: (key: string, type?: "json" | "text") => {
        const value = store.get(key);
        if (value === undefined) {
          return Promise.resolve(null);
        }
        if (type === "json") {
          return Promise.resolve(JSON.parse(value) as unknown);
        }
        return Promise.resolve(value);
      },
      list: () =>
        Promise.resolve({
          keys: [...store.keys()].map((name) => ({ name })),
          list_complete: true,
        }),
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
    };
    env = { AUDIT_KV: kv } as unknown as CloudflareEnv;

    await saveSiteInterest({
      env,
      payload: siteInterestInputSchema.parse({
        email: "a@example.com",
        name: "Alex",
      }),
    });
  });

  it("de-duplicates by normalised email", async () => {
    const second = await saveSiteInterest({
      env,
      payload: siteInterestInputSchema.parse({
        email: "A@example.com",
        note: "duplicate",
      }),
    });

    expect(second.created).toBeFalsy();
    expect(second.record.email).toBe("a@example.com");
    expect(second.record.name).toBe("Alex");
  });
});

describe("site interests CSV export", () => {
  it("escapes commas and quotes", () => {
    const csv = siteInterestsToCsv([
      {
        createdAt: Date.parse("2026-01-15T00:00:00.000Z"),
        email: "a@example.com",
        name: 'Alex "Owner"',
        note: "Cafe, website pending",
      },
    ]);
    expect(csv).toContain('"Alex ""Owner"""');
    expect(csv).toContain('"Cafe, website pending"');
  });
});
