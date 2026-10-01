import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { createPolarCustomerPortalUrl, publicOrigin } from "@/lib/polar-server";

export const dynamic = "force-dynamic";

const noticeRedirect = (
  origin: string,
  notice: "unconfigured" | "missing" | "error"
) => {
  const url = new URL("/account", origin);
  url.searchParams.set("billing", notice);
  return NextResponse.redirect(url);
};

export const GET = async (request: Request) => {
  const origin = publicOrigin(request);
  const user = await getSessionUser();
  if (!user) {
    const signIn = new URL("/sign-in", origin);
    signIn.searchParams.set("return", "/api/account/billing");
    return NextResponse.redirect(signIn);
  }

  try {
    const portal = await createPolarCustomerPortalUrl({
      email: user.email,
      returnUrl: `${origin}/account`,
    });
    if (portal.status === "ready") {
      return NextResponse.redirect(portal.url);
    }
    return noticeRedirect(origin, portal.status);
  } catch {
    return noticeRedirect(origin, "error");
  }
};
