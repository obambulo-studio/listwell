import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuditEngineEnv,
  hasAuditKv,
  lookupProvidersFromEnv,
  probeConvexBusinesses,
} = vi.hoisted(() => ({
  getAuditEngineEnv: vi.fn<() => Promise<Record<string, never>>>(),
  hasAuditKv: vi.fn<() => Promise<boolean>>(),
  lookupProvidersFromEnv:
    vi.fn<() => { apple: boolean; google: boolean; osm: true }>(),
  probeConvexBusinesses: vi.fn<() => Promise<"ok" | "error">>(),
}));

vi.mock(import("@/lib/data"), () => ({
  hasAuditKv,
  probeConvexBusinesses,
}));

vi.mock(import("@/lib/audit-env"), () => ({
  getAuditEngineEnv,
  lookupProvidersFromEnv,
}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    probeConvexBusinesses.mockResolvedValue("ok");
    hasAuditKv.mockResolvedValue(true);
    getAuditEngineEnv.mockResolvedValue({});
    lookupProvidersFromEnv.mockReturnValue({
      apple: false,
      google: false,
      osm: true,
    });
  });

  it("returns ok when audit KV and OSM lookups are available", async () => {
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toStrictEqual({
      convex: "ok",
      lookups: {
        apple: false,
        google: false,
        osm: true,
      },
      ok: true,
      storage: {
        auditKv: true,
        d1: false,
      },
    });
  });

  it("sets ok false when audit KV is missing", async () => {
    hasAuditKv.mockResolvedValue(false);
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      storage: { auditKv: false, d1: false },
    });
  });

  it("reflects convex probe errors", async () => {
    probeConvexBusinesses.mockResolvedValue("error");
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body: unknown = await response.json();
    expect(body).toMatchObject({ convex: "error" });
  });
});
