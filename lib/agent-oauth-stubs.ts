import { NextResponse } from "next/server";

import { listwellSiteUrl } from "@/lib/site-metadata";

const registrationDisabledBody = (origin = listwellSiteUrl()) =>
  ({
    error: "registration_disabled",
    error_description: `Listwell is not accepting agent registrations. Humans sign in at ${origin}/sign-in. Use the public chat at ${origin}/chat for listing audits.`,
  }) as const;

export const agentOAuthStubJsonResponse = (
  origin = listwellSiteUrl()
): NextResponse =>
  NextResponse.json(registrationDisabledBody(origin), {
    headers: {
      "Cache-Control": "no-store",
    },
    status: 403,
  });

export const agentOAuthStubPost = (request: Request): NextResponse => {
  const { origin } = new URL(request.url);
  return agentOAuthStubJsonResponse(origin);
};
