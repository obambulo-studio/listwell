import { NextResponse } from "next/server";
import { z } from "zod";

import { copyAuthCookies } from "@/lib/auth";
import { CheckoutGrantError } from "@/lib/checkout-grant-error";
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
  let purchasePending = false;

  try {
    const confirmed = await confirmPolarCheckout(params.checkoutId, request);
    const { businessId: confirmedBusinessId, cookies: confirmedCookies } =
      confirmed;
    if (confirmedBusinessId) {
      businessId = confirmedBusinessId;
    }
    cookies = confirmedCookies;
  } catch (error) {
    if (error instanceof CheckoutGrantError) {
      const {
        businessId: failedBusinessId,
        checkoutId: failedCheckoutId,
        message,
      } = error;
      businessId = failedBusinessId;
      purchasePending = true;
      console.error("Checkout return could not grant entitlement", {
        businessId: failedBusinessId,
        checkoutId: failedCheckoutId,
        message,
      });
    } else {
      console.error("Checkout return confirmation failed", {
        businessId: params.businessId,
        checkoutId: params.checkoutId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const returnPath = checkoutReturnPath(businessId);
  const redirectUrl = new URL(returnPath, `${publicOrigin(request)}/`);
  if (purchasePending) {
    redirectUrl.searchParams.set("purchase_pending", "1");
    redirectUrl.searchParams.set("checkout_retry", params.checkoutId);
  } else {
    redirectUrl.searchParams.set("checkout_returned", "1");
  }

  const response = NextResponse.redirect(redirectUrl);
  copyAuthCookies(cookies, response.headers);
  return response;
};
