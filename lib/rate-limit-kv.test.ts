import { describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  evaluateRateLimit,
  rateLimitHttpError,
  TOO_MANY_REQUESTS_ERROR,
} from "./rate-limit-kv";
import { runInSeries } from "./run-in-series";

const memoryKv = (): KVNamespace => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
    get(key) {
      const entry = store.get(key);
      if (!entry) {
        return Promise.resolve(null);
      }
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(entry.value);
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true });
    },
    put(key, value, opts) {
      store.set(key, {
        expiresAt: Date.now() + (opts?.expirationTtl ?? 60) * 1000,
        value,
      });
      return Promise.resolve();
    },
  };
};

const failingKv = (): KVNamespace => ({
  delete() {
    return Promise.resolve();
  },
  get() {
    return Promise.reject(new Error("kv get failed"));
  },
  list() {
    return Promise.resolve({ keys: [], list_complete: true });
  },
  put() {
    return Promise.reject(new Error("kv put failed"));
  },
});

const request = new Request("https://listwell.dev/api/discover");

describe(consumeRateLimit, () => {
  it("allows up to maxRequests then blocks", async () => {
    const env: CloudflareEnv = { AUDIT_KV: memoryKv() };
    await runInSeries([0, 1, 2], async () => {
      await expect(
        consumeRateLimit({ bucket: "test", env, maxRequests: 3, request })
      ).resolves.toBeTruthy();
    });
    await expect(
      consumeRateLimit({ bucket: "test", env, maxRequests: 3, request })
    ).resolves.toBeFalsy();
  });

  it("fails open without KV by default, closed when requested", async () => {
    await expect(
      consumeRateLimit({ bucket: "test", env: null, request })
    ).resolves.toBeTruthy();
    await expect(
      consumeRateLimit({
        bucket: "test",
        env: null,
        failClosed: true,
        request,
      })
    ).resolves.toBeFalsy();
  });

  it("fails open when KV throws by default, closed when requested", async () => {
    const env: CloudflareEnv = { AUDIT_KV: failingKv() };
    await expect(
      consumeRateLimit({ bucket: "test", env, request })
    ).resolves.toBeTruthy();
    await expect(
      evaluateRateLimit({
        bucket: "test",
        env,
        failClosed: true,
        request,
      })
    ).resolves.toStrictEqual({ allowed: false, reason: "unavailable" });
  });
});

describe(evaluateRateLimit, () => {
  it("reports a missing binding as unavailable only when fail closed", async () => {
    await expect(
      evaluateRateLimit({ bucket: "test", env: null, request })
    ).resolves.toStrictEqual({ allowed: true });
    await expect(
      evaluateRateLimit({
        bucket: "test",
        env: null,
        failClosed: true,
        request,
      })
    ).resolves.toStrictEqual({ allowed: false, reason: "unavailable" });
  });

  it("reports the limit separately from an outage", async () => {
    const env: CloudflareEnv = { AUDIT_KV: memoryKv() };
    await expect(
      evaluateRateLimit({ bucket: "test", env, maxRequests: 1, request })
    ).resolves.toStrictEqual({ allowed: true });
    await expect(
      evaluateRateLimit({ bucket: "test", env, maxRequests: 1, request })
    ).resolves.toStrictEqual({ allowed: false, reason: "limited" });
  });
});

describe(rateLimitHttpError, () => {
  it("uses 503 for an outage and 429 for the limit", () => {
    expect(
      rateLimitHttpError(
        { allowed: false, reason: "unavailable" },
        "Checkout is not available right now."
      )
    ).toStrictEqual({
      error: "Checkout is not available right now.",
      status: 503,
    });
    expect(
      rateLimitHttpError(
        { allowed: false, reason: "limited" },
        "Checkout is not available right now."
      )
    ).toStrictEqual({ error: TOO_MANY_REQUESTS_ERROR, status: 429 });
    expect(
      rateLimitHttpError(
        { allowed: true },
        "Checkout is not available right now."
      )
    ).toBeNull();
  });
});
