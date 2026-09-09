import { describe, expect, it } from "vitest";

import {
  businessIdFromMetadata,
  checkoutReturnPath,
  customerEmailFromPolarData,
  entitlementActionFromPolarEvent,
  entitlementKindFromCheckout,
  entitlementKindFromPolarData,
  polarWebhookEventSchema,
  signPolarWebhook,
  verifyPolarSignature,
} from "./polar";
import { checkoutRequestSchema } from "./schema";

const secret = "polar_whsec_test";

const event = (type: string, data: Record<string, unknown>) =>
  polarWebhookEventSchema.parse({ data, type });

describe(checkoutReturnPath, () => {
  it("returns a same-origin report path for a business id", () => {
    expect(checkoutReturnPath("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      "/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    );
    expect(checkoutReturnPath("biz_reports_1")).toBe("/biz_reports_1");
  });

  it("rejects open-redirect values", () => {
    expect(checkoutReturnPath()).toBe("/");
    expect(checkoutReturnPath("//evil.example")).toBe("/");
    expect(checkoutReturnPath("../admin")).toBe("/");
    expect(checkoutReturnPath("biz/extra")).toBe("/");
  });
});

describe(businessIdFromMetadata, () => {
  it("reads businessId", () => {
    expect(businessIdFromMetadata({ businessId: "biz_1" })).toBe("biz_1");
  });

  it("reads business_id", () => {
    expect(businessIdFromMetadata({ business_id: "biz_2" })).toBe("biz_2");
  });

  it("ignores empty and missing values", () => {
    expect(businessIdFromMetadata()).toBeUndefined();
    expect(businessIdFromMetadata({ businessId: "" })).toBeUndefined();
    expect(businessIdFromMetadata({ businessId: 12 })).toBeUndefined();
  });
});

describe(entitlementKindFromCheckout, () => {
  it("uses monthly when a subscription id is present", () => {
    expect(
      entitlementKindFromCheckout({ subscriptionId: "sub_1" }, "prod_month")
    ).toBe("report_monthly");
  });

  it("uses monthly when the product matches", () => {
    expect(
      entitlementKindFromCheckout({ productId: "prod_month" }, "prod_month")
    ).toBe("report_monthly");
  });

  it("uses monthly when metadata plan is monthly", () => {
    expect(
      entitlementKindFromCheckout(
        { metadata: { plan: "monthly" } },
        "prod_month"
      )
    ).toBe("report_monthly");
  });

  it("defaults to one-time", () => {
    expect(
      entitlementKindFromCheckout({ productId: "prod_once" }, "prod_month")
    ).toBe("report_once");
  });
});

describe(entitlementKindFromPolarData, () => {
  it("uses monthly when a subscription id is present", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", subscription_id: "sub_1" },
        "prod_month"
      )
    ).toBe("report_monthly");
  });

  it("uses monthly when the product matches", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", product_id: "prod_month" },
        "prod_month"
      )
    ).toBe("report_monthly");
  });

  it("defaults to one-time", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", product_id: "prod_once" },
        "prod_month"
      )
    ).toBe("report_once");
  });
});

describe(entitlementActionFromPolarEvent, () => {
  it("grants on order.paid with business metadata", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("order.paid", {
          id: "ord_1",
          metadata: { businessId: "biz_1" },
          product_id: "prod_once",
        })
      )
    ).toStrictEqual({
      businessId: "biz_1",
      email: undefined,
      kind: "report_once",
      polarOrderId: "ord_1",
      polarSubscriptionId: undefined,
      type: "grant",
    });
  });

  it("grants with a normalised Polar customer email", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("order.paid", {
          customer: { email: "Ada@Example.com" },
          id: "ord_1",
          metadata: { businessId: "biz_1" },
          product_id: "prod_once",
        })
      )
    ).toStrictEqual({
      businessId: "biz_1",
      email: "ada@example.com",
      kind: "report_once",
      polarOrderId: "ord_1",
      polarSubscriptionId: undefined,
      type: "grant",
    });
  });

  it("ignores paid orders without a business id", () => {
    expect(
      entitlementActionFromPolarEvent(event("order.paid", { id: "ord_1" }))
    ).toStrictEqual({
      type: "ignore",
    });
  });

  it("grants on subscription.active", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("subscription.active", {
          id: "sub_1",
          metadata: { businessId: "biz_1" },
          product_id: "prod_month",
          subscription_id: "sub_1",
        }),
        "prod_month"
      )
    ).toStrictEqual({
      businessId: "biz_1",
      email: undefined,
      kind: "report_monthly",
      polarOrderId: undefined,
      polarSubscriptionId: "sub_1",
      type: "grant",
    });
  });

  it("revokes on order.refunded", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("order.refunded", {
          id: "ord_1",
          metadata: { businessId: "biz_1" },
        })
      )
    ).toStrictEqual({
      businessId: "biz_1",
      polarOrderId: "ord_1",
      polarSubscriptionId: undefined,
      type: "revoke",
    });
  });

  it("revokes on subscription.revoked using the subscription id", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("subscription.revoked", {
          id: "sub_1",
          metadata: { businessId: "biz_1" },
        })
      )
    ).toStrictEqual({
      businessId: "biz_1",
      polarOrderId: undefined,
      polarSubscriptionId: "sub_1",
      type: "revoke",
    });
  });

  it("ignores unrelated events", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("checkout.created", { id: "chk_1" })
      )
    ).toStrictEqual({
      type: "ignore",
    });
  });
});

describe(customerEmailFromPolarData, () => {
  it("reads data.customer.email", () => {
    expect(
      customerEmailFromPolarData({ customer: { email: "Ada@Example.com" } })
    ).toBe("ada@example.com");
  });

  it("reads customer_email", () => {
    expect(
      customerEmailFromPolarData({ customer_email: "ada@example.com" })
    ).toBe("ada@example.com");
  });

  it("reads checkout customerEmail", () => {
    expect(
      customerEmailFromPolarData({ customerEmail: "ada@example.com" })
    ).toBe("ada@example.com");
  });

  it("prefers customer.email over other fields", () => {
    expect(
      customerEmailFromPolarData({
        customer: { email: "first@example.com" },
        customerEmail: "third@example.com",
        customer_email: "second@example.com",
      })
    ).toBe("first@example.com");
  });

  it("ignores missing or invalid values", () => {
    expect(customerEmailFromPolarData({})).toBeUndefined();
    expect(customerEmailFromPolarData()).toBeUndefined();
    expect(
      customerEmailFromPolarData({ customer_email: "not-an-email" })
    ).toBeUndefined();
    expect(customerEmailFromPolarData({ customer_email: " " })).toBeUndefined();
  });
});

describe("checkout request schema", () => {
  it("defaults plan to once", () => {
    expect(checkoutRequestSchema.parse({ businessId: "biz_1" }).plan).toBe(
      "once"
    );
  });
});

describe(verifyPolarSignature, () => {
  it("accepts a matching signature", async () => {
    const body = JSON.stringify({ data: { id: "ord_1" }, type: "order.paid" });
    const headers = {
      id: "msg_1",
      signature: "",
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    headers.signature = await signPolarWebhook(body, secret, headers);
    await expect(
      verifyPolarSignature(body, headers, secret)
    ).resolves.toBeTruthy();
  });

  it("rejects a bad signature or stale timestamp", async () => {
    const body = JSON.stringify({ data: { id: "ord_1" }, type: "order.paid" });
    const now = Math.floor(Date.now() / 1000);
    const headers = {
      id: "msg_1",
      signature: "v1,not-a-real-signature",
      timestamp: String(now),
    };
    await expect(
      verifyPolarSignature(body, headers, secret, now)
    ).resolves.toBeFalsy();

    const stale = {
      id: "msg_1",
      signature: "",
      timestamp: String(now - 400),
    };
    stale.signature = await signPolarWebhook(body, secret, stale);
    await expect(
      verifyPolarSignature(body, stale, secret, now)
    ).resolves.toBeFalsy();
  });
});
