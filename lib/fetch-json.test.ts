import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fanOutSettled, fetchJsonWithSchema } from "./fetch-json";

describe(fetchJsonWithSchema, () => {
  it("parses valid JSON with schema", async () => {
    const schema = z.object({ ok: z.boolean() });
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(Response.json({ ok: true }))) as typeof fetch;
    try {
      await expect(
        fetchJsonWithSchema(schema, "https://example.com")
      ).resolves.toStrictEqual({ ok: true });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws on non-OK status", async () => {
    const schema = z.object({ ok: z.boolean() });
    const original = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
    try {
      await expect(
        fetchJsonWithSchema(schema, "https://example.com")
      ).rejects.toThrow(/status 500/u);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe(fanOutSettled, () => {
  it("keeps fulfilled results and drops rejections", async () => {
    const result = await fanOutSettled([1, 2, 3], (value) => {
      if (value === 2) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve(value * 2);
    });
    expect(result).toStrictEqual([2, 6]);
  });
});
