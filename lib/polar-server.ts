import { Polar } from "@polar-sh/sdk";
import { z } from "zod";

import { getExecutionContext, getCloudflareEnv } from "./audit-env";
import {
  cookiesFromAuthResponse,
  getSessionUser,
  isAuthEnabled,
  maskEmail,
} from "./auth";
import { api, convexAction } from "./convex/server";
import {
  findUserIdByEmail,
  getActiveEntitlementOwner,
  grantEntitlement,
  revokeEntitlements,
} from "./data";
import {
  businessIdFromMetadata,
  customerEmailFromPolarData,
  entitlementActionFromPolarEvent,
  entitlementKindFromCheckout,
  polarCheckoutSchema,
} from "./polar";
import type { PolarWebhookEvent } from "./polar";
import { startBaselineScan } from "./scans";
import { checkoutPlanSchema, entitlementStateSchema } from "./schema";
import type { CheckoutPlan, EntitlementKind, EntitlementState } from "./schema";

const optionalString = z.string().min(1).optional();
const polarServerSchema = z.enum(["sandbox", "production"]);

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalString.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export interface PolarConfig {
  accessToken: string;
  webhookSecret: string | undefined;
  productReportOnce: string;
  productReportMonthly: string | undefined;
  server: z.infer<typeof polarServerSchema>;
}

export const getPolarConfig = async (): Promise<PolarConfig | null> => {
  const workerEnv = await getCloudflareEnv();
  const accessToken =
    readSecret(workerEnv?.POLAR_ACCESS_TOKEN) ??
    readSecret(process.env.POLAR_ACCESS_TOKEN);
  const productReportOnce =
    readSecret(workerEnv?.POLAR_PRODUCT_REPORT_ONCE) ??
    readSecret(process.env.POLAR_PRODUCT_REPORT_ONCE);
  if (!accessToken || !productReportOnce) {
    return null;
  }

  const serverValue =
    readSecret(workerEnv?.POLAR_SERVER) ??
    readSecret(process.env.POLAR_SERVER) ??
    "sandbox";
  const serverParsed = polarServerSchema.safeParse(serverValue);
  const server = serverParsed.success ? serverParsed.data : "sandbox";

  return {
    accessToken,
    productReportMonthly:
      readSecret(workerEnv?.POLAR_PRODUCT_REPORT_MONTHLY) ??
      readSecret(process.env.POLAR_PRODUCT_REPORT_MONTHLY),
    productReportOnce,
    server,
    webhookSecret:
      readSecret(workerEnv?.POLAR_WEBHOOK_SECRET) ??
      readSecret(process.env.POLAR_WEBHOOK_SECRET),
  };
};

export const getReportAccess = async (
  businessId: string
): Promise<EntitlementState> => {
  const [config, authEnabled, sessionUser, owner] = await Promise.all([
    getPolarConfig(),
    isAuthEnabled(),
    getSessionUser(),
    getActiveEntitlementOwner(businessId),
  ]);
  const maskedEmail = owner.ownerEmail ? maskEmail(owner.ownerEmail) : null;
  const sessionRequired = Boolean(
    authEnabled &&
    owner.unlocked &&
    owner.ownerUserId &&
    sessionUser?.id !== owner.ownerUserId
  );
  const monthlyAvailable = Boolean(config?.productReportMonthly);

  if (!config) {
    return entitlementStateSchema.parse({
      authEnabled,
      kind: null,
      maskedEmail,
      monthlyAvailable: false,
      paymentsEnabled: false,
      sessionRequired: false,
      unlocked: false,
    });
  }

  return entitlementStateSchema.parse({
    authEnabled,
    kind: owner.kind,
    maskedEmail,
    monthlyAvailable,
    paymentsEnabled: true,
    sessionRequired,
    unlocked: owner.unlocked,
  });
};

export const polarCheckoutConfirmSchema = z.object({
  businessId: z.string().optional(),
  cookies: z.array(z.string()).default([]),
  email: z.string().optional(),
  granted: z.boolean(),
  userId: z.string().optional(),
});
export type PolarCheckoutConfirm = z.infer<typeof polarCheckoutConfirmSchema>;

const afterMonthlyGrant = async (businessId: string): Promise<void> => {
  await startBaselineScan(businessId);
};

const scheduleMonthlyBaseline = async (businessId: string): Promise<void> => {
  const execution = await getExecutionContext();
  const run = afterMonthlyGrant(businessId);
  if (execution) {
    execution.waitUntil(run);
    return;
  }
  await run;
};

const sendPostPaymentSignInCode = async (email: string): Promise<void> => {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "http://localhost:3000";
  try {
    await fetch(
      `${siteUrl.replace(/\/$/u, "")}/api/auth/email-otp/send-verification-otp`,
      {
        body: JSON.stringify({ email, type: "sign-in" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
  } catch {
    // Best-effort post-checkout sign-in prompt.
  }
};

const grantPaidAccess = async (input: {
  businessId: string;
  kind: EntitlementKind;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  email?: string;
}): Promise<{ id: string; email: string } | null> => {
  const userId = input.email ? await findUserIdByEmail(input.email) : null;
  await grantEntitlement({
    businessId: input.businessId,
    kind: input.kind,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
    userId: userId ?? undefined,
  });
  if (input.kind === "report_monthly") {
    await scheduleMonthlyBaseline(input.businessId);
  }
  if (userId && input.email) {
    return { email: input.email, id: userId };
  }
  return null;
};

const polarClient = (config: PolarConfig): Polar =>
  new Polar({
    accessToken: config.accessToken,
    server: config.server,
  });

export const publicOrigin = (request: Request): string => {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
};

const convexSiteUrl = (): string | undefined => {
  const url = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return url ? url.replace(/\/$/u, "") : undefined;
};

const signInWithEmailOtp = async (
  request: Request,
  email: string,
  otp: string
): Promise<string[]> => {
  const siteUrl = convexSiteUrl();
  if (!siteUrl) {
    return [];
  }

  const origin = publicOrigin(request);
  const requestUrl = new URL(origin);
  const headers = new Headers({
    "Content-Type": "application/json",
    "accept-encoding": "application/json",
    host: new URL(siteUrl).host,
    origin,
    "x-better-auth-forwarded-host": requestUrl.host,
    "x-better-auth-forwarded-proto": requestUrl.protocol.replace(/:$/u, ""),
    "x-forwarded-host": requestUrl.host,
    "x-forwarded-proto": requestUrl.protocol.replace(/:$/u, ""),
  });
  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const at = email.indexOf("@");
  const name = at > 0 ? email.slice(0, at) : email;

  const response = await fetch(`${siteUrl}/api/auth/sign-in/email-otp`, {
    body: JSON.stringify({ email, name, otp }),
    headers,
    method: "POST",
    redirect: "manual",
  });
  if (!response.ok) {
    return [];
  }
  return cookiesFromAuthResponse(response);
};

const signInPaidCustomer = async (
  request: Request,
  email: string
): Promise<string[]> => {
  try {
    const otp = await convexAction(api.users.createSignInOtp, { email });
    const cookies = await signInWithEmailOtp(request, email, otp);
    if (cookies.length === 0) {
      await sendPostPaymentSignInCode(email);
    }
    return cookies;
  } catch {
    await sendPostPaymentSignInCode(email);
    return [];
  }
};

export const customerIpAddress = (request: Request): string | undefined => {
  const cf = request.headers.get("CF-Connecting-IP")?.trim();
  if (cf) {
    return cf;
  }
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || undefined;
};

export const createPolarCheckout = async (input: {
  businessId: string;
  plan: CheckoutPlan;
  origin: string;
  customerIpAddress?: string;
}): Promise<{ url: string }> => {
  const config = await getPolarConfig();
  if (!config) {
    throw new Error("Payment is not configured");
  }

  const plan = checkoutPlanSchema.parse(input.plan);
  const productId =
    plan === "monthly" ? config.productReportMonthly : config.productReportOnce;
  if (plan === "monthly" && !productId) {
    throw new Error("Monthly plan is not configured");
  }

  const created = await polarClient(config).checkouts.create({
    customerIpAddress: input.customerIpAddress,
    metadata: { businessId: input.businessId, plan },
    products: [productId ?? config.productReportOnce],
    returnUrl: `${input.origin}/${input.businessId}`,
    successUrl: `${input.origin}/api/auth/checkout/{CHECKOUT_ID}/${input.businessId}`,
  });

  return polarCheckoutSchema.parse({
    id: created.id,
    metadata: created.metadata,
    productId: created.productId,
    status: created.status,
    subscriptionId: created.subscriptionId,
    url: created.url,
  });
};

export const confirmPolarCheckout = async (
  checkoutId: string,
  request: Request
): Promise<PolarCheckoutConfirm> => {
  const denied = polarCheckoutConfirmSchema.parse({ granted: false });
  const config = await getPolarConfig();
  if (!config) {
    return denied;
  }

  const checkout = await polarClient(config).checkouts.get({ id: checkoutId });
  const parsed = polarCheckoutSchema.parse({
    customerEmail: checkout.customerEmail,
    id: checkout.id,
    metadata: checkout.metadata,
    productId: checkout.productId,
    status: checkout.status,
    subscriptionId: checkout.subscriptionId,
    url: checkout.url,
  });
  if (parsed.status !== "succeeded") {
    return denied;
  }

  const businessId = businessIdFromMetadata(parsed.metadata);
  if (!businessId) {
    return denied;
  }

  const kind = entitlementKindFromCheckout(
    {
      metadata: parsed.metadata,
      productId: parsed.productId,
      subscriptionId: parsed.subscriptionId,
    },
    config.productReportMonthly
  );

  const email = customerEmailFromPolarData(parsed);
  const cookies = email ? await signInPaidCustomer(request, email) : [];

  const user = await grantPaidAccess({
    businessId,
    email,
    kind,
  });
  return polarCheckoutConfirmSchema.parse({
    businessId,
    cookies,
    email,
    granted: true,
    userId: user?.id,
  });
};

export const applyPolarWebhookEvent = async (
  event: PolarWebhookEvent
): Promise<void> => {
  const config = await getPolarConfig();
  const action = entitlementActionFromPolarEvent(
    event,
    config?.productReportMonthly
  );
  if (action.type === "ignore") {
    return;
  }
  if (action.type === "grant") {
    await grantPaidAccess({
      businessId: action.businessId,
      email: action.email,
      kind: action.kind,
      polarOrderId: action.polarOrderId,
      polarSubscriptionId: action.polarSubscriptionId,
    });
    return;
  }
  await revokeEntitlements({
    businessId: action.businessId,
    polarOrderId: action.polarOrderId,
    polarSubscriptionId: action.polarSubscriptionId,
  });
};
