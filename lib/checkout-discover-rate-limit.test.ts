import type {
  AuditEngineEnv,
  FetchWebsiteOptions,
} from "@listwell/audit-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCloudflareEnv } = vi.hoisted(() => ({
  getCloudflareEnv: vi.fn<() => Promise<CloudflareEnv | null>>(),
}));

vi.mock(import("@/lib/audit-env"), () => ({
  getAuditEngineEnv: vi.fn<() => Promise<AuditEngineEnv>>(),
  getCloudflareEnv,
  getFetchWebsiteOptions: vi.fn<() => Promise<FetchWebsiteOptions>>(),
}));

const failingKv = (): KVNamespace => ({
  delete() {
    return Promise.resolve();
  },
  get() {
    return Promise.resolve(null);
  },
  list() {
    return Promise.resolve({ keys: [], list_complete: true });
  },
  put() {
    return Promise.reject(new Error("kv put failed"));
  },
});

const post = (path: string): Request =>
  new Request(`https://listwell.dev${path}`, { method: "POST" });

describe("checkout and discover rate limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails closed with 503 when checkout has no KV binding", async () => {
    getCloudflareEnv.mockResolvedValue(null);
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post("/api/checkout"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Checkout is not available right now.",
    });
  });

  it("fails closed with 503 when checkout KV writes fail", async () => {
    getCloudflareEnv.mockResolvedValue({ AUDIT_KV: failingKv() });
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post("/api/checkout"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Checkout is not available right now.",
    });
  });

  it("fails closed with 503 when discover has no KV binding", async () => {
    getCloudflareEnv.mockResolvedValue(null);
    const { POST } = await import("@/app/api/discover/route");
    const response = await POST(post("/api/discover"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Listing search is not available right now.",
    });
  });

  it("fails closed with 503 when discover KV writes fail", async () => {
    getCloudflareEnv.mockResolvedValue({ AUDIT_KV: failingKv() });
    const { POST } = await import("@/app/api/discover/route");
    const response = await POST(post("/api/discover"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Listing search is not available right now.",
    });
  });
});
