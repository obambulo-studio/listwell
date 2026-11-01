import type {
  AuditEngineEnv,
  FetchWebsiteOptions,
} from "@listwell/audit-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PolarConfig } from "./polar-server";
import type { Business, CheckoutPlan, CheckoutReturnTo } from "./schema";
import { businessSchema } from "./schema";

const checkoutUrl = "https://sandbox.polar.sh/checkout/chk_test";

const { createPolarCheckout, getBusiness, getCloudflareEnv, getPolarConfig } =
  vi.hoisted(() => ({
    createPolarCheckout:
      vi.fn<
        (input: {
          businessId: string;
          customerIpAddress?: string;
          origin: string;
          plan: CheckoutPlan;
          returnTo?: CheckoutReturnTo;
        }) => Promise<{ url: string }>
      >(),
    getBusiness: vi.fn<(id: string) => Promise<Business | null>>(),
    getCloudflareEnv: vi.fn<() => Promise<CloudflareEnv | null>>(),
    getPolarConfig: vi.fn<() => Promise<PolarConfig | null>>(),
  }));

vi.mock(import("@/lib/audit-env"), () => ({
  getAuditEngineEnv: vi.fn<() => Promise<AuditEngineEnv>>(),
  getCloudflareEnv,
  getFetchWebsiteOptions: vi.fn<() => Promise<FetchWebsiteOptions>>(),
}));

vi.mock(import("@/lib/polar-server"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPolarCheckout,
    getPolarConfig,
  };
});

vi.mock(import("@/lib/data"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getBusiness,
  };
});

const allowingKv = (): KVNamespace => {
  const values = new Map<string, string>();
  return {
    delete() {
      return Promise.resolve();
    },
    get(key: string) {
      return Promise.resolve(values.get(key) ?? null);
    },
    list() {
      return Promise.resolve({ keys: [], list_complete: true });
    },
    put(key: string, value: string) {
      values.set(key, value);
      return Promise.resolve();
    },
  };
};

const testPolarConfig: PolarConfig = {
  accessToken: "polar_test_token",
  productAnalytics100k: undefined,
  productAnalytics10k: undefined,
  productAnalytics1m: undefined,
  productReportMonthly: undefined,
  productReportOnce: "prod_once_test",
  productReportYearly: undefined,
  server: "sandbox",
  webhookSecret: undefined,
};

const business = businessSchema.parse({
  category: "food",
  createdAt: "2026-01-01T00:00:00.000Z",
  deliverooUrl: null,
  doorDashUrl: null,
  facebookUsername: null,
  id: "biz_1",
  instagramUsername: null,
  linkedinUrl: null,
  locations: [],
  menulogUrl: null,
  name: "Blackstar Coffee",
  tiktokUsername: null,
  uberEatsUrl: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  userId: null,
  websiteUrl: null,
  xUsername: null,
  youtubeUrl: null,
});

const post = (body?: string): Request =>
  new Request("https://listwell.dev/api/checkout", {
    body,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    method: "POST",
  });

const invalidCheckout = { error: "Invalid checkout request" };

describe("POST /api/checkout input", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getCloudflareEnv.mockResolvedValue({ AUDIT_KV: allowingKv() });
    getPolarConfig.mockResolvedValue(testPolarConfig);
    getBusiness.mockResolvedValue(business);
    createPolarCheckout.mockResolvedValue({ url: checkoutUrl });
  });

  it("returns 400 when the body is missing", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual(invalidCheckout);
    expect(createPolarCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty object", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post("{}"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual(invalidCheckout);
    expect(getBusiness).not.toHaveBeenCalled();
    expect(createPolarCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 when businessId is empty", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post(JSON.stringify({ businessId: "" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual(invalidCheckout);
    expect(createPolarCheckout).not.toHaveBeenCalled();
  });

  it.each([
    { businessId: 12 },
    { businessId: null },
    { businessId: true },
    { businessId: ["biz_1"] },
  ])("returns 400 when businessId is $businessId", async (body) => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post(JSON.stringify(body)));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual(invalidCheckout);
    expect(createPolarCheckout).not.toHaveBeenCalled();
  });

  it.each(["{", "not-json", ""])(
    "returns 400 for malformed JSON %j",
    async (body) => {
      const { POST } = await import("@/app/api/checkout/route");
      const response = await POST(post(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toStrictEqual(invalidCheckout);
      expect(createPolarCheckout).not.toHaveBeenCalled();
    }
  );

  it("still fails closed before reading the body when KV is missing", async () => {
    getCloudflareEnv.mockResolvedValue(null);
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post("{}"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Checkout is not available right now.",
    });
    expect(getPolarConfig).not.toHaveBeenCalled();
    expect(createPolarCheckout).not.toHaveBeenCalled();
  });

  it("starts a Polar checkout for a valid body", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(
      post(
        JSON.stringify({
          businessId: "biz_1",
          plan: "yearly",
          returnTo: "account",
        })
      )
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ url: checkoutUrl });
    expect(getBusiness).toHaveBeenCalledWith("biz_1");
    expect(createPolarCheckout).toHaveBeenCalledWith({
      businessId: "biz_1",
      customerIpAddress: undefined,
      origin: "https://listwell.dev",
      plan: "yearly",
      returnTo: "account",
    });
  });

  it("defaults a valid body to the once plan", async () => {
    const { POST } = await import("@/app/api/checkout/route");
    const response = await POST(post(JSON.stringify({ businessId: "biz_1" })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ url: checkoutUrl });
    expect(createPolarCheckout).toHaveBeenCalledWith({
      businessId: "biz_1",
      customerIpAddress: undefined,
      origin: "https://listwell.dev",
      plan: "once",
      returnTo: undefined,
    });
  });
});
