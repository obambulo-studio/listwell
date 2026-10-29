import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { timingSafeEqual } from "@/lib/auth";
import { getPurchaseReceiptForOrder } from "@/lib/data";
import { sendPurchaseReceipt } from "@/lib/purchase-email";

export const dynamic = "force-dynamic";

const optionalSecret = z.string().min(1).optional();

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalSecret.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const getInternalSecret = async (): Promise<string | undefined> => {
  const workerEnv = await getCloudflareEnv();
  return (
    readSecret(workerEnv?.INTERNAL_API_SECRET) ??
    readSecret(process.env.INTERNAL_API_SECRET)
  );
};

const bearerToken = (request: Request): string | undefined => {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
};

const resendBodySchema = z
  .object({
    polarOrderId: z.string().trim().min(1),
  })
  .strict();

const jsonError = (error: string, status: number): NextResponse =>
  NextResponse.json({ error }, { status });

export const POST = async (request: Request): Promise<NextResponse> => {
  const secret = await getInternalSecret();
  const token = bearerToken(request);
  if (!secret || !token || !timingSafeEqual(token, secret)) {
    return jsonError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = resendBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid order id", 400);
  }

  const target = await getPurchaseReceiptForOrder(parsed.data.polarOrderId);
  if (!target) {
    return jsonError("No report purchase for that order", 404);
  }
  if (target.status !== "active") {
    return jsonError("Entitlement is not active", 409);
  }
  if (target.purchaseEmailSentAt) {
    return jsonError("Purchase receipt was already sent", 409);
  }
  if (!target.purchaserEmail) {
    return jsonError("Purchase has no email address", 422);
  }

  const result = await sendPurchaseReceipt({
    businessId: target.businessExternalId,
    email: target.purchaserEmail,
    kind: target.kind,
  });
  if (result.status === "sent") {
    return NextResponse.json({ ok: true });
  }
  if (result.status === "skipped" && result.reason === "already-sent") {
    return jsonError("Purchase receipt was already sent", 409);
  }
  if (result.status === "skipped" && result.reason === "invalid-email") {
    return jsonError("Purchase has no email address", 422);
  }
  if (result.status === "skipped" && result.reason === "usesend-unconfigured") {
    return jsonError("Email is not configured", 503);
  }
  return jsonError("Purchase receipt failed", 500);
};
