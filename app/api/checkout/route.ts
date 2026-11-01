import { NextResponse } from "next/server";

import { getCloudflareEnv } from "@/lib/audit-env";
import { checkoutCreateHttpError } from "@/lib/checkout-create-error";
import { getBusiness } from "@/lib/data";
import {
  createPolarCheckout,
  customerIpAddress,
  getPolarConfig,
  publicOrigin,
} from "@/lib/polar-server";
import { evaluateRateLimit, rateLimitHttpError } from "@/lib/rate-limit-kv";
import { checkoutRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const CHECKOUT_UNAVAILABLE_ERROR = "Checkout is not available right now.";

export const POST = async (request: Request) => {
  const decision = await evaluateRateLimit({
    bucket: "checkout",
    env: await getCloudflareEnv(),
    failClosed: true,
    maxRequests: 10,
    request,
  });
  const blocked = rateLimitHttpError(decision, CHECKOUT_UNAVAILABLE_ERROR);
  if (blocked) {
    return NextResponse.json(
      { error: blocked.error },
      { status: blocked.status }
    );
  }
  const config = await getPolarConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Payment is not configured" },
      { status: 503 }
    );
  }

  const body: unknown = await request.json();
  const parsed = checkoutRequestSchema.parse(body);
  const business = await getBusiness(parsed.businessId);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  try {
    const checkout = await createPolarCheckout({
      businessId: parsed.businessId,
      customerIpAddress: customerIpAddress(request),
      origin: publicOrigin(request),
      plan: parsed.plan,
      returnTo: parsed.returnTo,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const { message, status } = checkoutCreateHttpError(error);
    return NextResponse.json({ error: message }, { status });
  }
};
