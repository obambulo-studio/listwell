import { Polar } from "@polar-sh/sdk";
import { AlreadyCanceledSubscription } from "@polar-sh/sdk/models/errors/alreadycanceledsubscription";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { ResourceNotFound } from "@polar-sh/sdk/models/errors/resourcenotfound";
import { z } from "zod";

import { isAnalyticsEntitlementKind } from "./analytics-pricing";
import { getExecutionContext, getCloudflareEnv } from "./audit-env";
import {
  cookiesFromAuthResponse,
  getSessionUser,
  isAuthEnabled,
  maskEmail,
  normalizeEmail,
} from "./auth";
import { fetchAuthMutation } from "./auth-server";
import { clearsSessionRequiredForGuest } from "./business-guest-access";
import { checkoutCreateFailureLog } from "./checkout-create-error";
import { CheckoutGrantError } from "./checkout-grant-error";
import { CheckoutResponseShapeError } from "./checkout-response-shape-error";
import {
  api,
  convexAction,
  convexMutation,
  convexQuery,
} from "./convex/server";
import {
  findUserIdByEmail,
  getActiveEntitlementOwner,
  grantEntitlement,
  revokeEntitlements,
} from "./data";
import {
  entitlementIsPurchaserBound,
  fixStepsWithoutPayment,
  isPaymentsIntentionallyDisabled,
  reportSessionRequired,
  sharedViewerEntitlementState,
} from "./entitlements-access";
import {
  businessIdFromMetadata,
  checkoutCustomerIp,
  checkoutReturnPathFromMetadata,
  customerEmailFromPolarData,
  customerIdFromPolarData,
  customerNameFromPolarData,
  deliveryCostEvent,
  entitlementActionFromPolarEvent,
  entitlementKindFromCheckout,
  parsePolarCustomerPortalUrl,
  polarCheckoutSchema,
} from "./polar";
import type { PolarProductIds, PolarWebhookEvent } from "./polar";
import { resolveCheckoutProduct } from "./polar-checkout-plan";
import { schedulePurchaseReceipt } from "./purchase-email";
import { startBaselineScan } from "./scans";
import { checkoutPlanSchema, entitlementStateSchema } from "./schema";
import type { CheckoutPlan, EntitlementKind, EntitlementState } from "./schema";
import { ensureSuggestedSearchPhrases } from "./suggest-search-phrases";

const optionalString = z.string().min(1).optional();
const polarServerSchema = z.enum(["sandbox", "production"]);

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalString.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

export interface PolarConfig {
  accessToken: string;
  webhookSecret: string | undefined;
  productAnalytics10k: string | undefined;
  productAnalytics100k: string | undefined;
  productAnalytics1m: string | undefined;
  productReportOnce: string;
  productReportMonthly: string | undefined;
  productReportYearly: string | undefined;
  server: z.infer<typeof polarServerSchema>;
}

const polarProductIdsFromConfig = (config: PolarConfig): PolarProductIds => ({
  analytics100kProductId: config.productAnalytics100k,
  analytics10kProductId: config.productAnalytics10k,
  analytics1mProductId: config.productAnalytics1m,
  monthlyProductId: config.productReportMonthly,
  onceProductId: config.productReportOnce,
  yearlyProductId: config.productReportYearly,
});

const optionalPolarSecret = (
  workerEnv: Awaited<ReturnType<typeof getCloudflareEnv>>,
  workerKey: keyof NonNullable<Awaited<ReturnType<typeof getCloudflareEnv>>>,
  processKey: string
): string | undefined =>
  readSecret(workerEnv?.[workerKey]) ?? readSecret(process.env[processKey]);

const polarAnalyticsProducts = (
  workerEnv: Awaited<ReturnType<typeof getCloudflareEnv>>
): Pick<
  PolarConfig,
  "productAnalytics100k" | "productAnalytics10k" | "productAnalytics1m"
> => ({
  productAnalytics100k: optionalPolarSecret(
    workerEnv,
    "POLAR_PRODUCT_ANALYTICS_100K",
    "POLAR_PRODUCT_ANALYTICS_100K"
  ),
  productAnalytics10k: optionalPolarSecret(
    workerEnv,
    "POLAR_PRODUCT_ANALYTICS_10K",
    "POLAR_PRODUCT_ANALYTICS_10K"
  ),
  productAnalytics1m: optionalPolarSecret(
    workerEnv,
    "POLAR_PRODUCT_ANALYTICS_1M",
    "POLAR_PRODUCT_ANALYTICS_1M"
  ),
});

export const getPolarConfig = async (): Promise<PolarConfig | null> => {
  const workerEnv = await getCloudflareEnv();
  const accessToken = optionalPolarSecret(
    workerEnv,
    "POLAR_ACCESS_TOKEN",
    "POLAR_ACCESS_TOKEN"
  );
  const productReportOnce = optionalPolarSecret(
    workerEnv,
    "POLAR_PRODUCT_REPORT_ONCE",
    "POLAR_PRODUCT_REPORT_ONCE"
  );
  if (!accessToken || !productReportOnce) {
    return null;
  }

  const serverValue =
    optionalPolarSecret(workerEnv, "POLAR_SERVER", "POLAR_SERVER") ?? "sandbox";
  const serverParsed = polarServerSchema.safeParse(serverValue);
  const server = serverParsed.success ? serverParsed.data : "sandbox";

  return {
    accessToken,
    ...polarAnalyticsProducts(workerEnv),
    productReportMonthly: optionalPolarSecret(
      workerEnv,
      "POLAR_PRODUCT_REPORT_MONTHLY",
      "POLAR_PRODUCT_REPORT_MONTHLY"
    ),
    productReportOnce,
    productReportYearly: optionalPolarSecret(
      workerEnv,
      "POLAR_PRODUCT_REPORT_YEARLY",
      "POLAR_PRODUCT_REPORT_YEARLY"
    ),
    server,
    webhookSecret: optionalPolarSecret(
      workerEnv,
      "POLAR_WEBHOOK_SECRET",
      "POLAR_WEBHOOK_SECRET"
    ),
  };
};

const readPaymentsDisabledFlag = async (): Promise<boolean> => {
  const workerEnv = await getCloudflareEnv();
  const fromWorker = readSecret(workerEnv?.LISTWELL_PAYMENTS_DISABLED);
  const fromProcess = readSecret(process.env.LISTWELL_PAYMENTS_DISABLED);
  return isPaymentsIntentionallyDisabled({
    listwellPaymentsDisabled: fromWorker ?? fromProcess,
  });
};

export const getSharedReportViewerAccess =
  async (): Promise<EntitlementState> => {
    const [config, authEnabled, paymentsDisabledFlag] = await Promise.all([
      getPolarConfig(),
      isAuthEnabled(),
      readPaymentsDisabledFlag(),
    ]);
    const polarConfigured = Boolean(config);
    const waived = fixStepsWithoutPayment({
      intentionallyDisabled: paymentsDisabledFlag,
      nodeEnv: process.env.NODE_ENV ?? "development",
      polarConfigured,
    });

    if (!config) {
      return sharedViewerEntitlementState(
        entitlementStateSchema.parse({
          authEnabled,
          backendAvailable: true,
          fixStepsWithoutPayment: waived,
          kind: null,
          maskedEmail: null,
          monthlyAvailable: false,
          paymentsEnabled: false,
          sessionRequired: false,
          unlocked: false,
        })
      );
    }

    return sharedViewerEntitlementState(
      entitlementStateSchema.parse({
        authEnabled,
        backendAvailable: true,
        fixStepsWithoutPayment: waived,
        kind: null,
        maskedEmail: null,
        monthlyAvailable: Boolean(config.productReportMonthly),
        paymentsEnabled: true,
        sessionRequired: false,
        unlocked: false,
      })
    );
  };

const attachUnlockedPurchase = async (
  businessId: string,
  sessionUserId: string | undefined
): Promise<Awaited<ReturnType<typeof getActiveEntitlementOwner>>> => {
  const owner = await getActiveEntitlementOwner(businessId);
  const unlockedWithoutOwner =
    sessionUserId !== undefined &&
    owner.backendAvailable &&
    owner.unlocked &&
    owner.ownerUserId === null;
  if (!unlockedWithoutOwner) {
    return owner;
  }
  try {
    await fetchAuthMutation(api.entitlements.attachPurchasesForCurrentUser, {});
  } catch {
    return owner;
  }
  return await getActiveEntitlementOwner(businessId);
};

const loadReportAccessContext = async (businessId: string) => {
  const sessionUser = await getSessionUser();
  const [config, authEnabled, owner, paymentsDisabledFlag] = await Promise.all([
    getPolarConfig(),
    isAuthEnabled(),
    attachUnlockedPurchase(businessId, sessionUser?.id),
    readPaymentsDisabledFlag(),
  ]);

  const { backendAvailable } = owner;
  const unlocked = backendAvailable ? owner.unlocked : false;
  const kind = backendAvailable ? owner.kind : null;
  const ownerEmail = backendAvailable ? owner.ownerEmail : null;
  const ownerUserId = backendAvailable ? owner.ownerUserId : null;
  const polarOrderId = backendAvailable ? owner.polarOrderId : null;
  const purchaserEmail = backendAvailable ? owner.purchaserEmail : null;
  const purchaserBound = entitlementIsPurchaserBound({
    polarOrderId,
    purchaserEmail,
    userId: ownerUserId,
  });
  const emailToMask =
    ownerEmail ??
    (purchaserEmail !== null && purchaserEmail.length > 0
      ? purchaserEmail
      : null);
  const maskedEmail = emailToMask ? maskEmail(emailToMask) : null;
  const sessionRequired = await clearsSessionRequiredForGuest({
    businessId,
    sessionRequired: reportSessionRequired({
      authEnabled,
      ownerUserId,
      purchaserBound,
      sessionUserId: sessionUser?.id ?? null,
      unlocked,
    }),
    sessionUserId: sessionUser?.id ?? null,
  });
  const polarConfigured = Boolean(config);
  const waived = fixStepsWithoutPayment({
    intentionallyDisabled: paymentsDisabledFlag,
    nodeEnv: process.env.NODE_ENV ?? "development",
    polarConfigured,
  });

  return {
    authEnabled,
    backendAvailable,
    config,
    kind,
    maskedEmail,
    monthlyAvailable: Boolean(config?.productReportMonthly),
    purchaserBound,
    sessionRequired,
    unlocked,
    waived,
    yearlyAvailable: Boolean(config?.productReportYearly),
  };
};

export const getReportAccess = async (
  businessId: string
): Promise<EntitlementState> => {
  const context = await loadReportAccessContext(businessId);

  if (!context.config) {
    return entitlementStateSchema.parse({
      authEnabled: context.authEnabled,
      backendAvailable: context.backendAvailable,
      fixStepsWithoutPayment: context.waived,
      kind: context.kind,
      maskedEmail: context.maskedEmail,
      monthlyAvailable: false,
      paymentsEnabled: false,
      sessionRequired: context.purchaserBound ? context.sessionRequired : false,
      unlocked: context.unlocked,
      yearlyAvailable: false,
    });
  }

  return entitlementStateSchema.parse({
    authEnabled: context.authEnabled,
    backendAvailable: context.backendAvailable,
    fixStepsWithoutPayment: context.waived,
    kind: context.kind,
    maskedEmail: context.maskedEmail,
    monthlyAvailable: context.monthlyAvailable,
    paymentsEnabled: true,
    sessionRequired: context.sessionRequired,
    unlocked: context.unlocked,
    yearlyAvailable: context.yearlyAvailable,
  });
};

export const polarCheckoutConfirmSchema = z.object({
  businessId: z.string().optional(),
  cookies: z.array(z.string()).default([]),
  email: z.string().optional(),
  granted: z.boolean(),
  returnPath: z.string().optional(),
  userId: z.string().optional(),
});
export type PolarCheckoutConfirm = z.infer<typeof polarCheckoutConfirmSchema>;

const afterMonthlyGrant = async (businessId: string): Promise<void> => {
  try {
    await ensureSuggestedSearchPhrases(businessId);
  } catch (error) {
    console.error("Search phrase suggestions failed", error);
  }
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

const convexSiteUrl = (): string | undefined => {
  const url = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return url ? url.replace(/\/$/u, "") : undefined;
};

export const betterAuthSendVerificationOtpPath =
  "/api/auth/email-otp/send-verification-otp";

const sendPostPaymentSignInCode = async (email: string): Promise<void> => {
  const convexSite = convexSiteUrl();
  const siteUrl =
    convexSite ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "http://localhost:3000";
  try {
    const response = await fetch(
      `${siteUrl.replace(/\/$/u, "")}${betterAuthSendVerificationOtpPath}`,
      {
        body: JSON.stringify({ email, type: "sign-in" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    if (!response.ok) {
      console.error("Post-payment OTP send failed", {
        email,
        status: response.status,
      });
    }
  } catch (sendError) {
    console.error("Post-payment OTP send failed", {
      email,
      error:
        sendError instanceof Error ? sendError.message : "Unknown send error",
    });
  }
};

const grantPaidAccess = async (input: {
  businessId: string;
  kind: EntitlementKind;
  polarCustomerId?: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  email?: string;
}): Promise<{ id: string; email: string } | null> => {
  const userId = input.email ? await findUserIdByEmail(input.email) : null;
  await grantEntitlement({
    businessId: input.businessId,
    kind: input.kind,
    polarCustomerId: input.polarCustomerId,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
    purchaserEmail: input.email,
    userId: userId ?? undefined,
  });
  if (input.kind === "report_monthly") {
    await scheduleMonthlyBaseline(input.businessId);
  }
  if (isAnalyticsEntitlementKind(input.kind)) {
    await convexMutation(api.webAnalytics.provisionAfterGrant, {
      businessExternalId: input.businessId,
    });
  }
  if (input.email && !isAnalyticsEntitlementKind(input.kind)) {
    await schedulePurchaseReceipt({
      businessId: input.businessId,
      email: input.email,
      kind: input.kind,
    });
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

export class SubscriptionRevokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionRevokeError";
  }
}

const subscriptionAlreadyRevoked = (error: unknown): boolean => {
  if (error instanceof AlreadyCanceledSubscription) {
    return true;
  }
  if (error instanceof ResourceNotFound) {
    return true;
  }
  return error instanceof PolarError && error.statusCode === 404;
};

/** Cancels billing that this removal will delete. Does nothing when there is no subscription. */
export const revokeSubscriptionsForBusinessRemoval = async (
  subscriptionIds: readonly string[]
): Promise<void> => {
  if (subscriptionIds.length === 0) {
    return;
  }
  const config = await getPolarConfig();
  if (!config) {
    throw new SubscriptionRevokeError(
      "Billing is not configured, so this business cannot be removed"
    );
  }
  const client = polarClient(config);
  await Promise.all(
    subscriptionIds.map(async (id) => {
      try {
        await client.subscriptions.revoke({ id });
      } catch (error) {
        if (subscriptionAlreadyRevoked(error)) {
          return;
        }
        throw new SubscriptionRevokeError(
          "Could not cancel billing for this business"
        );
      }
    })
  );
};

const allowedOrigins = (): string[] => {
  const values = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    "https://listwell.dev",
    "http://localhost:3000",
  ];
  const allowlist: string[] = [];
  for (const value of values) {
    if (value) {
      allowlist.push(value.replace(/\/$/u, ""));
    }
  }
  return allowlist;
};

export const publicOrigin = (request: Request): string => {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol === "https:" ? "https" : "http");
  const candidates: string[] = [];
  if (forwardedHost) {
    candidates.push(forwardedHost);
  }
  if (hostHeader) {
    candidates.push(hostHeader);
  }
  const allowlist = new Set(allowedOrigins());
  for (const candidate of candidates) {
    const origin = `${proto}://${candidate}`;
    if (allowlist.has(origin)) {
      return origin;
    }
  }
  // Fall back to the configured site URL in production; never trust an
  // arbitrary forwarded host for checkout return URLs.
  if (process.env.NODE_ENV === "production") {
    const [first] = allowlist;
    return first ?? `${url.protocol}//${url.host}`;
  }
  const host = candidates[0] ?? url.host;
  return `${proto}://${host}`;
};

const signInWithEmailOtp = async (
  request: Request,
  email: string,
  otp: string,
  name: string | undefined
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
  const fallbackName = at > 0 ? email.slice(0, at) : email;

  const response = await fetch(`${siteUrl}/api/auth/sign-in/email-otp`, {
    body: JSON.stringify({ email, name: name ?? fallbackName, otp }),
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
  email: string,
  name: string | undefined
): Promise<string[]> => {
  try {
    const otp = await convexAction(api.users.createSignInOtp, { email });
    const cookies = await signInWithEmailOtp(request, email, otp, name);
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
  const cf = checkoutCustomerIp(
    request.headers.get("CF-Connecting-IP") ?? undefined
  );
  if (cf) {
    return cf;
  }
  return checkoutCustomerIp(
    request.headers.get("x-forwarded-for")?.split(",")[0]
  );
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
  const { productId, returnPath } = resolveCheckoutProduct(
    config,
    plan,
    input.businessId
  );

  const logContext = { businessId: input.businessId, plan };

  let created;
  try {
    created = await polarClient(config).checkouts.create({
      customerIpAddress: input.customerIpAddress,
      metadata: { businessId: input.businessId, plan, returnPath },
      products: [productId],
      returnUrl: `${input.origin}${returnPath}`,
      successUrl: `${input.origin}/api/auth/checkout/{CHECKOUT_ID}/${input.businessId}`,
    });
  } catch (error) {
    checkoutCreateFailureLog(error, logContext);
    throw error;
  }

  const parsedCheckout = polarCheckoutSchema.safeParse({
    customerId: created.customerId,
    id: created.id,
    metadata: created.metadata,
    productId: created.productId,
    status: created.status,
    subscriptionId: created.subscriptionId,
    url: created.url,
  });
  if (!parsedCheckout.success) {
    const shapeError = new CheckoutResponseShapeError(parsedCheckout.error);
    checkoutCreateFailureLog(shapeError, logContext);
    throw shapeError;
  }

  return { url: parsedCheckout.data.url };
};

export type PolarCustomerPortal =
  | { status: "ready"; url: string }
  | { status: "unconfigured" }
  | { status: "missing" };

const polarCustomerIdSchema = z.object({
  id: z.string().min(1),
});

const polarCustomerListSchema = z.object({
  result: z.object({
    items: z.array(polarCustomerIdSchema),
  }),
});

const polarCustomerIdByEmail = async (
  config: PolarConfig,
  email: string
): Promise<string | null> => {
  const page = await polarClient(config).customers.list({
    email,
    limit: 1,
  });
  const listed = polarCustomerListSchema.safeParse(page);
  if (!listed.success) {
    throw new Error("Unexpected billing customer list");
  }
  return listed.data.result.items[0]?.id ?? null;
};

export const createPolarCustomerPortalUrl = async (input: {
  email: string;
  returnUrl: string;
}): Promise<PolarCustomerPortal> => {
  const config = await getPolarConfig();
  if (!config) {
    return { status: "unconfigured" };
  }

  const email = normalizeEmail(input.email);
  const returnUrl = z.url().safeParse(input.returnUrl);
  if (!email || !returnUrl.success) {
    return { status: "missing" };
  }

  const customerId = await polarCustomerIdByEmail(config, email);
  if (!customerId) {
    return { status: "missing" };
  }

  const session = await polarClient(config).customerSessions.create({
    customerId,
    returnUrl: returnUrl.data,
  });
  return {
    status: "ready",
    url: parsePolarCustomerPortalUrl(session.customerPortalUrl),
  };
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
    customerBillingName: checkout.customerBillingName,
    customerEmail: checkout.customerEmail,
    customerId: checkout.customerId,
    customerName: checkout.customerName,
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

  const products = polarProductIdsFromConfig(config);
  const kind = entitlementKindFromCheckout(
    {
      metadata: parsed.metadata,
      productId: parsed.productId,
      subscriptionId: parsed.subscriptionId,
    },
    products
  );
  const returnPath = checkoutReturnPathFromMetadata(
    parsed.metadata,
    businessId
  );

  const email = customerEmailFromPolarData(parsed);
  const name = customerNameFromPolarData(parsed);
  const cookies = email ? await signInPaidCustomer(request, email, name) : [];

  try {
    const user = await grantPaidAccess({
      businessId,
      email,
      kind,
      polarCustomerId: customerIdFromPolarData(parsed),
    });
    return polarCheckoutConfirmSchema.parse({
      businessId,
      cookies,
      email,
      granted: true,
      returnPath,
      userId: user?.id,
    });
  } catch (grantError) {
    console.error("Polar checkout grant failed", {
      businessId,
      checkoutId,
      error:
        grantError instanceof Error
          ? grantError.message
          : "Unknown grant error",
    });
    throw new CheckoutGrantError(businessId, checkoutId, grantError);
  }
};

const polarCustomerForBusinessSchema = z.object({
  polarCustomerId: z.string().nullable(),
  purchaserEmail: z.string().nullable(),
});

/** Sends the increased DataForSEO cost for one observation to Polar. */
export const reportBusinessDeliveryCost = async (input: {
  businessExternalId: string;
  deltaUsdMicros: number;
  kind: string;
  observationId: string;
  settledUsdMicros: number;
}): Promise<void> => {
  const config = await getPolarConfig();
  if (!config || input.deltaUsdMicros <= 0) {
    return;
  }
  const row = await convexQuery(api.entitlements.getActiveForBusiness, {
    businessExternalId: input.businessExternalId,
  });
  if (!row) {
    return;
  }
  const billing = polarCustomerForBusinessSchema.parse(row);
  let customerId = billing.polarCustomerId;
  if (!customerId && billing.purchaserEmail) {
    const email = normalizeEmail(billing.purchaserEmail);
    customerId = email ? await polarCustomerIdByEmail(config, email) : null;
    if (customerId) {
      await convexMutation(api.entitlements.rememberPolarCustomer, {
        businessExternalId: input.businessExternalId,
        polarCustomerId: customerId,
      });
    }
  }
  const event = deliveryCostEvent({
    businessExternalId: input.businessExternalId,
    customerId,
    deltaUsdMicros: input.deltaUsdMicros,
    kind: input.kind,
    observationId: input.observationId,
    settledUsdMicros: input.settledUsdMicros,
  });
  if (!event) {
    return;
  }
  await polarClient(config).events.ingest({ events: [event] });
};

export const applyPolarWebhookEvent = async (
  event: PolarWebhookEvent
): Promise<void> => {
  const config = await getPolarConfig();
  const action = entitlementActionFromPolarEvent(
    event,
    config ? polarProductIdsFromConfig(config) : {}
  );
  if (action.type === "ignore") {
    return;
  }
  if (action.type === "grant") {
    await grantPaidAccess({
      businessId: action.businessId,
      email: action.email,
      kind: action.kind,
      polarCustomerId: action.polarCustomerId,
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
