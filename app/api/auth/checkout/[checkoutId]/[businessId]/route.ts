import { NextResponse } from "next/server";
import { z } from "zod";

import { copyAuthCookies } from "@/lib/auth";
import { checkoutReturnPath } from "@/lib/polar";
import { confirmPolarCheckout, publicOrigin } from "@/lib/polar-server";

export const dynamic = "force-dynamic";

const checkoutReturnParamsSchema = z.object({
  businessId: z.string().min(1),
  checkoutId: z.string().min(1),
});

export const GET = async (
  request: Request,
  context: { params: Promise<{ checkoutId: string; businessId: string }> }
) => {
  const params = checkoutReturnParamsSchema.parse(await context.params);

  let { businessId } = params;
  let cookies: string[] = [];

  try {
    const confirmed = await confirmPolarCheckout(params.checkoutId, request);
    const { businessId: confirmedBusinessId, cookies: confirmedCookies } =
      confirmed;
    if (confirmedBusinessId) {
      businessId = confirmedBusinessId;
    }
    cookies = confirmedCookies;
  } catch {
    // Webhook can still grant access if Polar confirm is slow or fails.
  }

  const response = NextResponse.redirect(
    new URL(checkoutReturnPath(businessId), `${publicOrigin(request)}/`)
  );
  copyAuthCookies(cookies, response.headers);
  return response;
};
