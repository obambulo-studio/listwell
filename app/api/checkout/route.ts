import { NextResponse } from "next/server";

import { getBusiness } from "@/lib/data";
import {
  createPolarCheckout,
  customerIpAddress,
  getPolarConfig,
  publicOrigin,
} from "@/lib/polar-server";
import { checkoutRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
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
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
};
