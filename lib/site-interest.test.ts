import { describe, expect, it } from "vitest";

import {
  saveSiteInterest,
  siteInterestInputSchema,
  siteInterestsToCsv,
  sitePlanInterestLabel,
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

  it("accepts optional plan and business count", () => {
    const parsed = siteInterestInputSchema.parse({
      businessCount: "24",
      email: "agency@example.com",
      planInterest: "monthly_reports",
    });
    expect(parsed.planInterest).toBe("monthly_reports");
    expect(parsed.businessCount).toBe(24);
  });

  it("rejects invalid plan and business count", () => {
    expect(() =>
      siteInterestInputSchema.parse({
        email: "a@example.com",
        planInterest: "enterprise",
      })
    ).toThrow("Invalid option");
    expect(() =>
      siteInterestInputSchema.parse({
        businessCount: 0,
        email: "a@example.com",
      })
    ).toThrow("Too small");
  });
});

describe("save site interest", () => {
  it("de-duplicates by normalised email", async () => {
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
    const env = { AUDIT_KV: kv } as unknown as CloudflareEnv;

    const first = await saveSiteInterest({
      env,
      payload: siteInterestInputSchema.parse({
        email: "a@example.com",
        name: "Alex",
      }),
    });
    const second = await saveSiteInterest({
      env,
      payload: siteInterestInputSchema.parse({
        email: "A@example.com",
        note: "duplicate",
      }),
    });

    expect(first.created).toBeTruthy();
    expect(second.created).toBeFalsy();
    expect(second.record.email).toBe("a@example.com");
    expect(second.record.name).toBe("Alex");
  });

  it("stores plan interest and business count", async () => {
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
    const env = { AUDIT_KV: kv } as unknown as CloudflareEnv;

    const result = await saveSiteInterest({
      env,
      payload: siteInterestInputSchema.parse({
        businessCount: 3,
        email: "owner@example.com",
        planInterest: "yearly_per_business",
      }),
    });

    expect(result.record.planInterest).toBe("yearly_per_business");
    expect(result.record.businessCount).toBe(3);
  });
});

describe("site interests CSV export", () => {
  it("escapes commas and quotes", () => {
    const csv = siteInterestsToCsv([
      {
        businessCount: 5,
        createdAt: Date.parse("2026-01-15T00:00:00.000Z"),
        email: "a@example.com",
        name: 'Alex "Owner"',
        note: "Cafe, website pending",
        planInterest: "one_off_report",
      },
    ]);
    expect(csv).toContain("plan_interest,business_count");
    expect(csv).toContain(sitePlanInterestLabel("one_off_report"));
    expect(csv).toContain(",5,");
    expect(csv).toContain('"Alex ""Owner"""');
    expect(csv).toContain('"Cafe, website pending"');
  });
});
