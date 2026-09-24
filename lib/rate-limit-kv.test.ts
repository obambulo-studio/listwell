import { describe, expect, it } from "vitest";

import { consumeRateLimit } from "./rate-limit-kv";

const memoryKv = () => {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    get(key: string) {
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
    put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        expiresAt: Date.now() + (opts?.expirationTtl ?? 60) * 1000,
        value,
      });
      return Promise.resolve();
    },
  };
};

describe(consumeRateLimit, () => {
  it("allows up to maxRequests then blocks", async () => {
    const kv = memoryKv();
    const env = { AUDIT_KV: kv } as unknown as CloudflareEnv;
    const request = new Request("https://listwell.dev/api/discover");
    for (let index = 0; index < 3; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(
        consumeRateLimit({ bucket: "test", env, maxRequests: 3, request })
      ).resolves.toBeTruthy();
    }
    await expect(
      consumeRateLimit({ bucket: "test", env, maxRequests: 3, request })
    ).resolves.toBeFalsy();
  });

  it("fails open without KV by default, closed when requested", async () => {
    const request = new Request("https://listwell.dev/api/discover");
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
});
