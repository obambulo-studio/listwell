import { describe, expect, it } from "vitest";

import {
  businessIdFromMetadata,
  checkoutCustomerIp,
  checkoutReturnPath,
  customerEmailFromPolarData,
  customerIdFromPolarData,
  deliveryCostEvent,
  customerNameFromPolarData,
  parsePolarCustomerPortalUrl,
  checkoutReturnPathFromMetadata,
  entitlementActionFromPolarEvent,
  entitlementKindFromCheckout,
  entitlementKindFromPolarData,
  polarSubscriptionIdFromEvent,
  subscriptionIdsMatchingBusiness,
  polarWebhookEventSchema,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
  signPolarWebhook,
  unlockPricingNote,
  verifyPolarSignature,
} from "./polar";
import { checkoutRequestSchema } from "./schema";

const secret = "polar_whsec_test";

const event = (type: string, data: Record<string, unknown>) =>
  polarWebhookEventSchema.parse({ data, type });

const polarProducts = {
  analytics100kProductId: "prod_analytics_100k",
  analytics10kProductId: "prod_analytics_10k",
  analytics1mProductId: "prod_analytics_1m",
  monthlyProductId: "prod_month",
  onceProductId: "prod_once",
  yearlyProductId: "prod_year",
};

describe(parsePolarCustomerPortalUrl, () => {
  it("accepts Polar portal hosts", () => {
    expect(
      parsePolarCustomerPortalUrl(
        "https://polar.sh/listwell/portal?customer_session_token=abc"
      )
    ).toBe("https://polar.sh/listwell/portal?customer_session_token=abc");
    expect(
      parsePolarCustomerPortalUrl(
        "https://sandbox.polar.sh/listwell/portal?customer_session_token=abc"
      )
    ).toBe(
      "https://sandbox.polar.sh/listwell/portal?customer_session_token=abc"
    );
  });

  it("rejects other addresses", () => {
    expect(() =>
      parsePolarCustomerPortalUrl("http://polar.sh/listwell/portal")
    ).toThrow("Unexpected billing portal address");
    expect(() =>
      parsePolarCustomerPortalUrl("https://polar.sh.evil.com/portal")
    ).toThrow("Unexpected billing portal address");
    expect(() =>
      parsePolarCustomerPortalUrl("https://example.com/portal")
    ).toThrow("Unexpected billing portal address");
  });
});

describe(checkoutCustomerIp, () => {
  it("drops loopback addresses", () => {
    expect(checkoutCustomerIp("::1")).toBeUndefined();
    expect(checkoutCustomerIp("127.0.0.1")).toBeUndefined();
    expect(checkoutCustomerIp("  127.0.0.1  ")).toBeUndefined();
  });

  it("keeps a public address", () => {
    expect(checkoutCustomerIp("203.0.113.8")).toBe("203.0.113.8");
  });
});
describe("report pricing copy", () => {
  it("uses AUD list prices", () => {
    expect(REPORT_ONCE_PRICE).toBe("A$9.99");
    expect(REPORT_MONTHLY_PRICE).toBe("A$4.99/mo per business");
    expect(REPORT_YEARLY_PRICE).toBe("A$49/yr");
    expect(REPORT_YEARLY_VALUE_NOTE).toBe("about two months free");
  });
});

describe(unlockPricingNote, () => {
  it("includes yearly when configured", () => {
    expect(
      unlockPricingNote({ monthlyAvailable: true, yearlyAvailable: true })
    ).toContain("A$49/yr");
  });

  it("returns null when only once is sold", () => {
    expect(
      unlockPricingNote({ monthlyAvailable: false, yearlyAvailable: false })
    ).toBeNull();
  });
});

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
      entitlementKindFromCheckout({ subscriptionId: "sub_1" }, polarProducts)
    ).toBe("report_monthly");
  });

  it("uses monthly when the monthly product matches", () => {
    expect(
      entitlementKindFromCheckout({ productId: "prod_month" }, polarProducts)
    ).toBe("report_monthly");
  });

  it("uses monthly entitlement when the yearly product matches", () => {
    expect(
      entitlementKindFromCheckout({ productId: "prod_year" }, polarProducts)
    ).toBe("report_monthly");
  });

  it("uses monthly when metadata plan is monthly", () => {
    expect(
      entitlementKindFromCheckout(
        { metadata: { plan: "monthly" } },
        polarProducts
      )
    ).toBe("report_monthly");
  });

  it("uses monthly when metadata plan is yearly", () => {
    expect(
      entitlementKindFromCheckout(
        { metadata: { plan: "yearly" } },
        polarProducts
      )
    ).toBe("report_monthly");
  });

  it("defaults to one-time", () => {
    expect(
      entitlementKindFromCheckout({ productId: "prod_once" }, polarProducts)
    ).toBe("report_once");
  });

  it("maps analytics product ids", () => {
    expect(
      entitlementKindFromCheckout(
        { productId: "prod_analytics_100k", subscriptionId: "sub_a" },
        polarProducts
      )
    ).toBe("analytics_100k");
  });

  it("maps analytics plan metadata", () => {
    expect(
      entitlementKindFromCheckout(
        { metadata: { plan: "analytics_1m" }, subscriptionId: "sub_a" },
        polarProducts
      )
    ).toBe("analytics_1m");
  });
});

describe(checkoutReturnPathFromMetadata, () => {
  it("uses analytics return path from metadata", () => {
    expect(
      checkoutReturnPathFromMetadata(
        { returnPath: "/account/analytics/biz_1" },
        "biz_1"
      )
    ).toBe("/account/analytics/biz_1");
  });

  it("uses account return path from metadata", () => {
    expect(
      checkoutReturnPathFromMetadata({ returnPath: "/account" }, "biz_1")
    ).toBe("/account");
  });

  it("falls back to the report path", () => {
    expect(checkoutReturnPathFromMetadata({}, "biz_1")).toBe("/biz_1");
  });
});

describe(entitlementKindFromPolarData, () => {
  it("uses monthly when a subscription id is present", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", subscription_id: "sub_1" },
        polarProducts
      )
    ).toBe("report_monthly");
  });

  it("uses monthly when the product matches", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", product_id: "prod_month" },
        polarProducts
      )
    ).toBe("report_monthly");
  });

  it("uses monthly entitlement for yearly product id", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", product_id: "prod_year" },
        polarProducts
      )
    ).toBe("report_monthly");
  });

  it("defaults to one-time", () => {
    expect(
      entitlementKindFromPolarData(
        { id: "ord_1", product_id: "prod_once" },
        polarProducts
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
      polarCustomerId: undefined,
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
      polarCustomerId: undefined,
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

  it("reads the subscription id from a subscription event", () => {
    expect(
      polarSubscriptionIdFromEvent(
        event("subscription.active", {
          id: "sub_1",
          metadata: { businessId: "biz_1" },
        })
      )
    ).toBe("sub_1");
  });

  it("reads the subscription id from an order", () => {
    expect(
      polarSubscriptionIdFromEvent(
        event("order.paid", {
          id: "ord_1",
          subscription_id: "sub_1",
        })
      )
    ).toBe("sub_1");
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
        polarProducts
      )
    ).toStrictEqual({
      businessId: "biz_1",
      email: undefined,
      kind: "report_monthly",
      polarCustomerId: undefined,
      polarOrderId: undefined,
      polarSubscriptionId: "sub_1",
      type: "grant",
    });
  });

  it("grants monthly entitlement for a yearly product on order.paid", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("order.paid", {
          id: "ord_2",
          metadata: { businessId: "biz_1", plan: "yearly" },
          product_id: "prod_year",
        }),
        polarProducts
      )
    ).toStrictEqual({
      businessId: "biz_1",
      email: undefined,
      kind: "report_monthly",
      polarCustomerId: undefined,
      polarOrderId: "ord_2",
      polarSubscriptionId: undefined,
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

  it("keeps history when a subscription ends", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("subscription.revoked", {
          id: "sub_1",
          metadata: { businessId: "biz_1" },
        })
      )
    ).toStrictEqual({
      businessId: "biz_1",
      polarSubscriptionId: "sub_1",
      type: "lapse",
    });
  });

  it("revokes on subscription.paused", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("subscription.paused", {
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

  it("keeps the Polar customer id from a paid order", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("order.paid", {
          customer_id: "cus_1",
          id: "ord_1",
          metadata: { businessId: "biz_1" },
          product_id: "prod_once",
        })
      )
    ).toMatchObject({
      polarCustomerId: "cus_1",
      type: "grant",
    });
  });

  it("grants the subscription id when subscription.active omits subscription_id", () => {
    expect(
      entitlementActionFromPolarEvent(
        event("subscription.active", {
          id: "sub_year",
          metadata: { businessId: "biz_1", plan: "yearly" },
          product_id: "prod_year",
        }),
        polarProducts
      )
    ).toMatchObject({
      kind: "report_monthly",
      polarSubscriptionId: "sub_year",
      type: "grant",
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

describe(subscriptionIdsMatchingBusiness, () => {
  it("keeps open subscriptions for this business", () => {
    expect(
      subscriptionIdsMatchingBusiness(
        [
          {
            id: "sub_month",
            metadata: { businessId: "biz_1" },
            status: "active",
          },
          {
            id: "sub_cancel",
            metadata: { businessId: "biz_1" },
            status: "canceled",
          },
          {
            id: "sub_other",
            metadata: { businessId: "biz_2" },
            status: "active",
          },
          {
            id: "sub_done",
            metadata: { businessId: "biz_1" },
            status: "incomplete_expired",
          },
        ],
        "biz_1"
      )
    ).toStrictEqual(["sub_month", "sub_cancel"]);
  });

  it("can skip account analytics subscriptions on business removal", () => {
    expect(
      subscriptionIdsMatchingBusiness(
        [
          {
            id: "sub_month",
            metadata: { businessId: "biz_1", plan: "monthly" },
            status: "active",
          },
          {
            id: "sub_analytics",
            metadata: { businessId: "biz_1", plan: "analytics_10k" },
            status: "active",
          },
        ],
        "biz_1",
        { excludeAccountAnalytics: true }
      )
    ).toStrictEqual(["sub_month"]);
  });
});

describe(customerIdFromPolarData, () => {
  it("reads customer_id, then customerId, then customer.id", () => {
    expect(customerIdFromPolarData({ customer_id: "cus_webhook" })).toBe(
      "cus_webhook"
    );
    expect(
      customerIdFromPolarData({
        customer: { id: "cus_nested" },
        customerId: "cus_checkout",
      })
    ).toBe("cus_checkout");
    expect(customerIdFromPolarData({ customer: { id: "cus_nested" } })).toBe(
      "cus_nested"
    );
  });

  it("ignores a blank id", () => {
    expect(customerIdFromPolarData({ customer_id: "  " })).toBeUndefined();
    expect(customerIdFromPolarData({})).toBeUndefined();
  });
});

describe(deliveryCostEvent, () => {
  it("converts a DataForSEO charge of 12300 micros into 1.23 cents", () => {
    expect(
      deliveryCostEvent({
        businessExternalId: "biz_1",
        customerId: "cus_1",
        deltaUsdMicros: 12_300,
        kind: "organic_serp",
        observationId: "obs_1",
        settledUsdMicros: 12_300,
      })
    ).toStrictEqual({
      customerId: "cus_1",
      externalId: "obs_1:12300",
      metadata: {
        _cost: { amount: 1.23, currency: "usd" },
        businessExternalId: "biz_1",
        kind: "organic_serp",
      },
      name: "dataforseo.call",
    });
  });

  it("skips a zero charge and a business with no Polar customer", () => {
    const base = {
      businessExternalId: "biz_1",
      deltaUsdMicros: 0,
      kind: "organic_serp",
      observationId: "obs_1",
      settledUsdMicros: 0,
    };
    expect(deliveryCostEvent({ ...base, customerId: "cus_1" })).toBeNull();
    expect(
      deliveryCostEvent({
        ...base,
        customerId: null,
        deltaUsdMicros: 12_300,
        settledUsdMicros: 12_300,
      })
    ).toBeNull();
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

describe(customerNameFromPolarData, () => {
  it("reads the checkout customer name", () => {
    expect(customerNameFromPolarData({ customerName: "Ada Lovelace" })).toBe(
      "Ada Lovelace"
    );
    expect(customerNameFromPolarData({ customer_name: "Ada Lovelace" })).toBe(
      "Ada Lovelace"
    );
    expect(
      customerNameFromPolarData({ customer: { name: "Ada Lovelace" } })
    ).toBe("Ada Lovelace");
  });

  it("prefers the checkout name over the billing name", () => {
    expect(
      customerNameFromPolarData({
        customerBillingName: "Analytical Engines",
        customerName: "Ada Lovelace",
      })
    ).toBe("Ada Lovelace");
  });

  it("falls back to the billing name", () => {
    expect(
      customerNameFromPolarData({ customer_billing_name: "Ada Lovelace" })
    ).toBe("Ada Lovelace");
  });

  it("trims surrounding space and collapses gaps", () => {
    expect(
      customerNameFromPolarData({ customerName: "  Ada   Lovelace  " })
    ).toBe("Ada Lovelace");
  });

  it("ignores a blank name", () => {
    expect(customerNameFromPolarData({})).toBeUndefined();
    expect(customerNameFromPolarData()).toBeUndefined();
    expect(customerNameFromPolarData({ customerName: "   " })).toBeUndefined();
    expect(
      customerNameFromPolarData({
        customerBillingName: "Ada Lovelace",
        customerName: " ",
      })
    ).toBe("Ada Lovelace");
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
