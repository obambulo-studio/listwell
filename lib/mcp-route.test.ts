import type {
  AuditEngineEnv,
  FetchWebsiteOptions,
} from "@listwell/audit-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscoverRequest, DiscoverResponse } from "@/lib/discover";

const {
  consumeRateLimit,
  discoverBusiness,
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
} = vi.hoisted(() => ({
  consumeRateLimit: vi.fn<() => Promise<boolean>>(),
  discoverBusiness:
    vi.fn<
      (
        input: DiscoverRequest,
        env: AuditEngineEnv,
        options?: FetchWebsiteOptions
      ) => Promise<DiscoverResponse>
    >(),
  getAuditEngineEnv: vi.fn<() => Promise<AuditEngineEnv>>(),
  getCloudflareEnv: vi.fn<() => Promise<null>>(),
  getFetchWebsiteOptions: vi.fn<() => Promise<FetchWebsiteOptions>>(),
}));

vi.mock(import("@/lib/rate-limit-kv"), () => ({
  consumeRateLimit,
}));

vi.mock(import("@/lib/discover"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    discoverBusiness,
  };
});

vi.mock(import("@/lib/audit-env"), () => ({
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
}));

const mcpRequest = (body: unknown): Request =>
  new Request("https://listwell.dev/mcp", {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

describe("MCP route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    consumeRateLimit.mockResolvedValue(true);
    getCloudflareEnv.mockResolvedValue(null);
    getAuditEngineEnv.mockResolvedValue({});
    getFetchWebsiteOptions.mockResolvedValue({});
    discoverBusiness.mockResolvedValue({
      candidates: [],
      categoryDisplayLabel: "Cafe",
      categoryId: "food",
      profiles: [],
    });
  });

  it("refuses a server-sent event stream", async () => {
    const { GET } = await import("@/app/mcp/route");
    const response = GET();
    expect(response.status).toBe(405);
  });

  it("has no session to delete", async () => {
    const { DELETE } = await import("@/app/mcp/route");
    const response = DELETE();
    expect(response.status).toBe(404);
  });

  it("searches listings through the shared discover rate limit", async () => {
    const { POST } = await import("@/app/mcp/route");
    const response = await POST(
      mcpRequest({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: { businessName: "Cafe" },
          name: "discover_listings",
        },
      })
    );
    expect(response.status).toBe(200);
    expect(consumeRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "discover", maxRequests: 20 })
    );
    expect(discoverBusiness).toHaveBeenCalledOnce();
  });
});
