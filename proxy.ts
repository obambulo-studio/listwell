import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  agentReadyResponse,
  appendAcceptVary,
  appendAgentLinkHeaders,
  isApiPath,
} from "@/lib/agent-discovery";
import {
  hasSiteGateAccess,
  isSiteGateExemptPath,
  readSitePassword,
} from "@/lib/site-gate";
import { wwwToApexHref } from "@/lib/www-redirect";

const readWorkerEnv = async (): Promise<CloudflareEnv | null> => {
  try {
    const { env } = await import("cloudflare:workers");
    return env;
  } catch {
    return null;
  }
};

const readSitePasswordForMiddleware = async (): Promise<string | undefined> => {
  const env = await readWorkerEnv();
  return readSitePassword(env);
};

const applySiteGate = async (
  request: NextRequest
): Promise<NextResponse | null> => {
  const sitePassword = await readSitePasswordForMiddleware();
  if (sitePassword) {
    const { pathname, search } = request.nextUrl;
    if (
      !isSiteGateExemptPath(pathname) &&
      !(await hasSiteGateAccess(request, sitePassword))
    ) {
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = "/gate";
      const nextTarget = `${pathname}${search}`;
      if (nextTarget === "/") {
        gateUrl.searchParams.delete("next");
      } else {
        gateUrl.searchParams.set("next", nextTarget);
      }

      if (pathname === "/") {
        return NextResponse.rewrite(gateUrl);
      }

      return NextResponse.redirect(gateUrl);
    }
  }

  return null;
};

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webp|avif|css|js|map)).*)",
  ],
};

export const proxy = async (request: NextRequest): Promise<NextResponse> => {
  const destination = wwwToApexHref(request.url);

  if (destination) {
    return NextResponse.redirect(destination, 301);
  }

  const agentResponse = await agentReadyResponse(request);
  if (agentResponse) {
    return new NextResponse(agentResponse.body, {
      headers: agentResponse.headers,
      status: agentResponse.status,
    });
  }

  const gateResponse = await applySiteGate(request);
  if (gateResponse) {
    return gateResponse;
  }

  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  if (!isApiPath(pathname)) {
    appendAgentLinkHeaders(response.headers, request.nextUrl.origin);
    appendAcceptVary(response.headers);
  }
  return response;
};
