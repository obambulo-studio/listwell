import { z } from "zod";

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
  })
  .passthrough();

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

export const polarCheckoutSchema = z.object({
  customer: polarCustomerSchema.optional().nullable(),
  customerEmail: z.string().optional().nullable(),
  id: z.string(),
  metadata: polarMetadataSchema.optional(),
  productId: z.string().optional(),
  status: z.string(),
  subscriptionId: z.string().nullable().optional(),
  url: z.string().min(1),
});

export const REPORT_ONCE_PRICE = "$5";
export const REPORT_MONTHLY_PRICE = "$9/mo";

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

export const entitlementKindFromCheckout = (
  checkout: {
    productId?: string;
    subscriptionId?: string | null;
    metadata?: Record<string, unknown>;
  },
  monthlyProductId: string | undefined
): EntitlementKind => {
  if (checkout.subscriptionId) {
    return entitlementKindSchema.parse("report_monthly");
  }
  if (monthlyProductId && checkout.productId === monthlyProductId) {
    return entitlementKindSchema.parse("report_monthly");
  }
  const plan = checkout.metadata?.plan;
  if (plan === "monthly") {
    return entitlementKindSchema.parse("report_monthly");
  }
  return entitlementKindSchema.parse("report_once");
};

export const entitlementKindFromPolarData = (
  data: PolarWebhookEvent["data"],
  monthlyProductId: string | undefined
): EntitlementKind =>
  entitlementKindFromCheckout(
    {
      metadata: data.metadata,
      productId: data.product_id,
      subscriptionId: data.subscription_id,
    },
    monthlyProductId
  );

export type PolarEntitlementAction =
  | {
      type: "grant";
      businessId: string;
      kind: EntitlementKind;
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
  monthlyProductId?: string
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
      kind: entitlementKindFromPolarData(event.data, monthlyProductId),
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
};
