import { z } from "zod";

import {
  ANALYTICS_BANDS,
  analyticsEntitlementKindSchema,
  isAnalyticsCheckoutPlan,
} from "./analytics-pricing";
import { CONTINUED_REPORT_COPY } from "./research-report";
import {
  apiErrorSchema,
  checkoutRequestSchema,
  checkoutResponseSchema,
  entitlementKindSchema,
  entitlementStateSchema,
} from "./schema";
import type { CheckoutPlan, EntitlementKind, EntitlementState } from "./schema";

export const polarWebhookHeadersSchema = z.object({
  id: z.string().min(1),
  signature: z.string().min(1),
  timestamp: z.string().min(1),
});
export type PolarWebhookHeaders = z.infer<typeof polarWebhookHeadersSchema>;

const polarMetadataSchema = z.record(z.string(), z.unknown());

const polarCustomerSchema = z
  .object({
    email: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
  })
  .passthrough();

/** Matches the profile name field so a checkout name can be saved as-is. */
const ACCOUNT_NAME_MAX_LENGTH = 80;

export const polarWebhookEventSchema = z.object({
  data: z
    .object({
      billing_reason: z.string().optional(),
      checkout_id: z.string().nullable().optional(),
      customer: polarCustomerSchema.optional().nullable(),
      customerEmail: z.string().optional().nullable(),
      customer_email: z.string().optional().nullable(),
      id: z.string(),
      metadata: polarMetadataSchema.optional(),
      product_id: z.string().optional(),
      status: z.string().optional(),
      subscription_id: z.string().nullable().optional(),
    })
    .passthrough(),
  type: z.string(),
});
export type PolarWebhookEvent = z.infer<typeof polarWebhookEventSchema>;

const polarPortalHost = (hostname: string): boolean =>
  hostname === "polar.sh" || hostname === "sandbox.polar.sh";

/** Polar customer-portal URLs only. Rejects other hosts before a redirect. */
export const parsePolarCustomerPortalUrl = (value: string): string => {
  const parsed = z.url().safeParse(value);
  if (!parsed.success) {
    throw new Error("Unexpected billing portal address");
  }
  const url = new URL(parsed.data);
  if (url.protocol !== "https:" || !polarPortalHost(url.hostname)) {
    throw new Error("Unexpected billing portal address");
  }
  return url.toString();
};

export const polarCheckoutSchema = z.object({
  customer: polarCustomerSchema.optional().nullable(),
  customerBillingName: z.string().optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  customerId: z.string().min(1).nullable().optional(),
  customerName: z.string().optional().nullable(),
  id: z.string(),
  metadata: polarMetadataSchema.optional(),
  productId: z.string().optional(),
  status: z.string(),
  subscriptionId: z.string().nullable().optional(),
  url: z.string().min(1),
});

export const REPORT_ONCE_PRICE = "A$9.99";
export const REPORT_MONTHLY_PRICE = "A$4.99/mo per business";
export const REPORT_YEARLY_PRICE = "A$49/yr";
export const REPORT_YEARLY_VALUE_NOTE = "about two months free";

export const MONTHLY_SCANS_UPGRADE_COPY = `Listwell re-runs your local and website visibility check about every 30 days and emails you when the report is ready. You keep the full report with fix steps. ${CONTINUED_REPORT_COPY}`;

export const unlockPricingNote = (access: {
  monthlyAvailable: boolean;
  yearlyAvailable: boolean;
}): string | null => {
  if (access.yearlyAvailable) {
    return `Unlock with ${REPORT_ONCE_PRICE} once, ${REPORT_YEARLY_PRICE} (${REPORT_YEARLY_VALUE_NOTE}), or ${REPORT_MONTHLY_PRICE}.`;
  }
  if (access.monthlyAvailable) {
    return `Unlock with ${REPORT_ONCE_PRICE} once or ${REPORT_MONTHLY_PRICE}.`;
  }
  return null;
};

const LOOPBACK_CUSTOMER_IP =
  /^(?:::1|0:0:0:0:0:0:0:1|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/u;

/** A loopback address is not the customer's network address. */
export const checkoutCustomerIp = (
  ip: string | undefined
): string | undefined => {
  const trimmed = ip?.trim();
  if (!trimmed || LOOPBACK_CUSTOMER_IP.test(trimmed)) {
    return undefined;
  }
  return trimmed;
};

export interface PolarProductIds {
  analytics10kProductId?: string;
  analytics100kProductId?: string;
  analytics1mProductId?: string;
  monthlyProductId?: string;
  onceProductId?: string;
  yearlyProductId?: string;
}

const analyticsProductMap = (
  products: PolarProductIds
): ReadonlyMap<string, EntitlementKind> => {
  const envByKind: Record<string, string | undefined> = {
    analytics_10k: products.analytics10kProductId,
    analytics_100k: products.analytics100kProductId,
    analytics_1m: products.analytics1mProductId,
  };
  const map = new Map<string, EntitlementKind>();
  for (const band of ANALYTICS_BANDS) {
    const productId = envByKind[band.entitlementKind];
    if (productId) {
      map.set(productId, entitlementKindSchema.parse(band.entitlementKind));
    }
  }
  return map;
};

const kindFromProductId = (
  productId: string | undefined,
  products: PolarProductIds
): EntitlementKind | undefined => {
  if (!productId) {
    return undefined;
  }
  const analytics = analyticsProductMap(products).get(productId);
  if (analytics) {
    return analytics;
  }
  if (products.onceProductId && productId === products.onceProductId) {
    return entitlementKindSchema.parse("report_once");
  }
  if (products.monthlyProductId && productId === products.monthlyProductId) {
    return entitlementKindSchema.parse("report_monthly");
  }
  if (products.yearlyProductId && productId === products.yearlyProductId) {
    return entitlementKindSchema.parse("report_monthly");
  }
  return undefined;
};

const WEBHOOK_TOLERANCE_SECONDS = 300;

const checkoutReturnIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);

export const checkoutReturnPath = (businessId?: string): string => {
  const parsed = checkoutReturnIdSchema.safeParse(businessId);
  return parsed.success ? `/${parsed.data}` : "/";
};

export const businessIdFromMetadata = (
  metadata?: Record<string, unknown>
): string | undefined => {
  if (!metadata) {
    return undefined;
  }
  const raw = metadata.businessId ?? metadata.business_id;
  const parsed = z.string().min(1).safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

const polarEmailSourceSchema = z
  .object({
    customer: polarCustomerSchema.optional().nullable(),
    customerEmail: z.string().optional().nullable(),
    customer_email: z.string().optional().nullable(),
  })
  .passthrough();

const emailSchema = z.string().email();

export const normalizePolarEmail = (value: string): string | undefined => {
  const parsed = emailSchema.safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : undefined;
};

const polarCustomerIdSourceSchema = z
  .object({
    customer: z
      .object({
        id: z.string().optional().nullable(),
      })
      .passthrough()
      .optional()
      .nullable(),
    customerId: z.string().optional().nullable(),
    customer_id: z.string().optional().nullable(),
  })
  .passthrough();

/** Polar customer id from a checkout or webhook payload. */
export const customerIdFromPolarData = (data?: unknown): string | undefined => {
  const parsed = polarCustomerIdSourceSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }
  const raw =
    parsed.data.customer_id ??
    parsed.data.customerId ??
    parsed.data.customer?.id;
  if (typeof raw !== "string") {
    return undefined;
  }
  const id = raw.trim();
  return id.length > 0 ? id : undefined;
};

/** One USD cent per 10,000 micros. Polar cost amounts are cents. */
const usdMicrosToCostCents = (usdMicros: number): number => usdMicros / 10_000;

export const deliveryCostEvent = (input: {
  businessExternalId: string;
  customerId: string | null;
  deltaUsdMicros: number;
  kind: string;
  observationId: string;
  settledUsdMicros: number;
}): {
  customerId: string;
  externalId: string;
  metadata: {
    _cost: { amount: number; currency: "usd" };
    businessExternalId: string;
    kind: string;
  };
  name: "dataforseo.call";
} | null => {
  if (input.deltaUsdMicros <= 0 || !input.customerId) {
    return null;
  }
  return {
    customerId: input.customerId,
    externalId: `${input.observationId}:${input.settledUsdMicros}`,
    metadata: {
      _cost: {
        amount: usdMicrosToCostCents(input.deltaUsdMicros),
        currency: "usd",
      },
      businessExternalId: input.businessExternalId,
      kind: input.kind,
    },
    name: "dataforseo.call",
  };
};

export const customerEmailFromPolarData = (
  data?: unknown
): string | undefined => {
  const parsed = polarEmailSourceSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }
  const raw =
    parsed.data.customer?.email ??
    parsed.data.customer_email ??
    parsed.data.customerEmail;
  if (typeof raw !== "string") {
    return undefined;
  }
  return normalizePolarEmail(raw);
};

const polarNameSourceSchema = z
  .object({
    customer: polarCustomerSchema.optional().nullable(),
    customerBillingName: z.string().optional().nullable(),
    customerName: z.string().optional().nullable(),
    customer_billing_name: z.string().optional().nullable(),
    customer_name: z.string().optional().nullable(),
  })
  .passthrough();

const accountNameFromRaw = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const name = value.trim().replaceAll(/\s+/gu, " ");
  if (name.length === 0) {
    return undefined;
  }
  if (name.length <= ACCOUNT_NAME_MAX_LENGTH) {
    return name;
  }
  return name.slice(0, ACCOUNT_NAME_MAX_LENGTH).trim();
};

/** Name the customer entered on Polar checkout, for a new Listwell account. */
export const customerNameFromPolarData = (
  data?: unknown
): string | undefined => {
  const parsed = polarNameSourceSchema.safeParse(data);
  if (!parsed.success) {
    return undefined;
  }
  const candidates = [
    parsed.data.customerName,
    parsed.data.customer_name,
    parsed.data.customer?.name,
    parsed.data.customerBillingName,
    parsed.data.customer_billing_name,
  ];
  for (const candidate of candidates) {
    const name = accountNameFromRaw(candidate);
    if (name) {
      return name;
    }
  }
  return undefined;
};

export const entitlementKindFromCheckout = (
  checkout: {
    productId?: string;
    subscriptionId?: string | null;
    metadata?: Record<string, unknown>;
  },
  products: PolarProductIds
): EntitlementKind => {
  const fromProduct = kindFromProductId(checkout.productId, products);
  if (fromProduct) {
    return fromProduct;
  }
  const plan = checkout.metadata?.plan;
  if (typeof plan === "string" && isAnalyticsCheckoutPlan(plan)) {
    return analyticsEntitlementKindSchema.parse(plan);
  }
  if (checkout.subscriptionId) {
    return entitlementKindSchema.parse("report_monthly");
  }
  if (plan === "monthly" || plan === "yearly") {
    return entitlementKindSchema.parse("report_monthly");
  }
  return entitlementKindSchema.parse("report_once");
};

export const checkoutReturnPathFromMetadata = (
  metadata?: Record<string, unknown>,
  businessId?: string
): string => {
  const raw = metadata?.returnPath;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      trimmed.startsWith("/account/analytics/") &&
      !trimmed.includes("//") &&
      trimmed.length <= 256
    ) {
      return trimmed;
    }
  }
  return checkoutReturnPath(businessId);
};

export const entitlementKindFromPolarData = (
  data: PolarWebhookEvent["data"],
  products: PolarProductIds
): EntitlementKind =>
  entitlementKindFromCheckout(
    {
      metadata: data.metadata,
      productId: data.product_id,
      subscriptionId: data.subscription_id,
    },
    products
  );

export type PolarEntitlementAction =
  | {
      type: "grant";
      businessId: string;
      kind: EntitlementKind;
      polarCustomerId: string | undefined;
      polarOrderId: string | undefined;
      polarSubscriptionId: string | undefined;
      email: string | undefined;
    }
  | {
      type: "revoke";
      businessId: string | undefined;
      polarOrderId: string | undefined;
      polarSubscriptionId: string | undefined;
    }
  | { type: "ignore" };

export const entitlementActionFromPolarEvent = (
  event: PolarWebhookEvent,
  products: PolarProductIds = {}
): PolarEntitlementAction => {
  const businessId = businessIdFromMetadata(event.data.metadata);
  const polarSubscriptionId = event.data.subscription_id ?? undefined;
  const polarOrderId = event.type.startsWith("order.")
    ? event.data.id
    : undefined;
  const email = customerEmailFromPolarData(event.data);

  if (event.type === "order.paid" || event.type === "subscription.active") {
    if (!businessId) {
      return { type: "ignore" };
    }
    return {
      businessId,
      email,
      kind: entitlementKindFromPolarData(event.data, products),
      polarCustomerId: customerIdFromPolarData(event.data),
      polarOrderId,
      polarSubscriptionId,
      type: "grant",
    };
  }

  if (
    event.type === "order.refunded" ||
    event.type === "subscription.revoked" ||
    event.type === "subscription.paused"
  ) {
    return {
      businessId,
      polarOrderId,
      polarSubscriptionId: event.type.startsWith("subscription.")
        ? event.data.id
        : polarSubscriptionId,
      type: "revoke",
    };
  }

  return { type: "ignore" };
};

const bytesToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

const timingSafeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  for (let index = 0; index < leftBytes.length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return false;
    }
  }
  return true;
};

const hmacSha256Base64 = async (
  secret: string,
  message: string
): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToBase64(digest);
};

export const signPolarWebhook = async (
  body: string,
  secret: string,
  headers: PolarWebhookHeaders
): Promise<string> => {
  const expected = await hmacSha256Base64(
    secret,
    `${headers.id}.${headers.timestamp}.${body}`
  );
  return `v1,${expected}`;
};

export const verifyPolarSignature = async (
  body: string,
  headers: PolarWebhookHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> => {
  const timestamp = Number(headers.timestamp);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = await hmacSha256Base64(
    secret,
    `${headers.id}.${headers.timestamp}.${body}`
  );
  const signatures = headers.signature.split(" ");
  return signatures.some((part) => {
    const [version, value] = part.split(",", 2);
    return (
      version === "v1" &&
      value !== undefined &&
      timingSafeEqual(value, expected)
    );
  });
};

export const requestCheckoutUrl = async (
  businessId: string,
  plan: CheckoutPlan = "once"
): Promise<string> => {
  const response = await fetch("/api/checkout", {
    body: JSON.stringify(checkoutRequestSchema.parse({ businessId, plan })),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error : "Checkout failed");
  }
  return checkoutResponseSchema.parse(payload).url;
};

export const fetchEntitlement = async (
  businessId: string
): Promise<EntitlementState> => {
  const response = await fetch(`/api/businesses/${businessId}/entitlement`, {
    credentials: "same-origin",
  });
  const payload: unknown = await response.json();
  return entitlementStateSchema.parse(payload);
};

export const requestSignInCode = async (email: string): Promise<void> => {
  const { authClient } = await import("./auth-client");
  const result = await authClient.emailOtp.sendVerificationOtp({
    email,
    type: "sign-in",
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Could not send a code");
  }
};

export const verifySignInCode = async (
  email: string,
  code: string
): Promise<void> => {
  const { authClient } = await import("./auth-client");
  const result = await authClient.signIn.emailOtp({
    email,
    otp: code.replaceAll(/\s/gu, ""),
  });
  if (result.error) {
    throw new Error(result.error.message ?? "Invalid code");
  }
  try {
    await fetch("/api/businesses/claim", {
      body: JSON.stringify({ ids: [] }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // The report page links the purchase again after reload.
  }
};
