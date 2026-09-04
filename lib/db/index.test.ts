import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { categoryIdSchema } from "../category";
import { discoveredProfileSchema } from "../channel";
import { businessInputFromDiscovery } from "../profiles";
import {
  getBusiness,
  persistDiscoveredBusiness,
  resetBusinessStoreForTests,
  setTestD1,
} from "./index";

const MIGRATION_SQL = readFileSync(new URL("./migrations/0000.sql", import.meta.url), "utf8");

const sqlValueSchema = z.union([z.string(), z.number(), z.bigint(), z.instanceof(Uint8Array), z.null()]);
const sqlRowSchema = z.record(z.string(), z.unknown());

function sqlBindings(values: unknown[]) {
  return values.map((value) => sqlValueSchema.parse(value));
}

function createSqliteD1(sql: string): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(sql);

  function createStatement(query: string, bound: unknown[] = []): D1PreparedStatement {
    return {
      bind(...values: unknown[]) {
        return createStatement(query, values);
      },
      async first() {
        const row = sqlite.prepare(query).get(...sqlBindings(bound));
        return row === undefined ? null : sqlRowSchema.parse(row);
      },
      async run() {
        const result = sqlite.prepare(query).run(...sqlBindings(bound));
        return { success: true, meta: result };
      },
      async all() {
        const results = z.array(sqlRowSchema).parse(sqlite.prepare(query).all(...sqlBindings(bound)));
        return { results };
      },
      async raw() {
        const rows = z.array(sqlRowSchema).parse(sqlite.prepare(query).all(...sqlBindings(bound)));
        return rows.map((row) => Object.keys(row).map((column) => row[column]));
      },
    };
  }

  return {
    prepare(query: string) {
      return createStatement(query);
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };
}

const discovered = {
  name: "Seoul Bistro",
  category: categoryIdSchema.parse("food"),
  profiles: z.array(discoveredProfileSchema).parse([
    { type: "website", title: "https://seoulbistro.example" },
    {
      type: "google-maps",
      title: "Seoul Bistro",
      subtitle: "12 Example Street, South Brisbane",
      googlePlaceId: "places/abc",
    },
    { type: "instagram", title: "seoulbistro" },
  ]),
  address: "12 Example Street, South Brisbane",
};

afterEach(() => {
  resetBusinessStoreForTests();
});

describe("businessInputFromDiscovery", () => {
  it("maps a discovered listing onto the create-business payload", () => {
    const payload = businessInputFromDiscovery(
      discovered.name,
      discovered.category,
      discovered.profiles,
      discovered.address,
    );

    expect(payload.name).toBe("Seoul Bistro");
    expect(payload.category).toBe("food");
    expect(payload.websiteUrl).toBe("https://seoulbistro.example");
    expect(payload.instagramUsername).toBe("seoulbistro");
    expect(payload.locations[0]).toMatchObject({
      googlePlaceId: "places/abc",
      address: "12 Example Street, South Brisbane",
    });
  });
});

describe("persistDiscoveredBusiness memory fallback", () => {
  it("saves and loads a discovered business when D1 is absent", async () => {
    setTestD1(null);
    const saved = await persistDiscoveredBusiness(discovered);
    const loaded = await getBusiness(saved.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("Seoul Bistro");
    expect(loaded?.websiteUrl).toBe("https://seoulbistro.example");
    expect(loaded?.instagramUsername).toBe("seoulbistro");
    expect(loaded?.locations[0]?.googlePlaceId).toBe("places/abc");
    expect(loaded?.locations[0]?.address).toBe("12 Example Street, South Brisbane");
  });
});

describe("persistDiscoveredBusiness Drizzle / D1 schema", () => {
  it("writes and reads a discovered business through the migration schema", async () => {
    const d1 = createSqliteD1(MIGRATION_SQL);
    setTestD1(d1);

    const saved = await persistDiscoveredBusiness(discovered);
    resetBusinessStoreForTests();
    setTestD1(d1);
    const loaded = await getBusiness(saved.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(saved.id);
    expect(loaded?.name).toBe("Seoul Bistro");
    expect(loaded?.category).toBe("food");
    expect(loaded?.websiteUrl).toBe("https://seoulbistro.example");
    expect(loaded?.instagramUsername).toBe("seoulbistro");
    expect(loaded?.locations).toHaveLength(1);
    expect(loaded?.locations[0]?.googlePlaceId).toBe("places/abc");
    expect(loaded?.locations[0]?.address).toBe("12 Example Street, South Brisbane");
  });
});
