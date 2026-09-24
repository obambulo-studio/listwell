import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  agentReadyResponse,
  appendAcceptVary,
  appendAgentLinkHeaders,
  isApiPath,
} from "@/lib/agent-discovery";
import { wwwToApexHref } from "@/lib/www-redirect";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webp|avif|css|js|map)).*)",
  ],
};

export const middleware = async (
  request: NextRequest
): Promise<NextResponse> => {
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

  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  if (!isApiPath(pathname)) {
    appendAgentLinkHeaders(response.headers, request.nextUrl.origin);
    appendAcceptVary(response.headers);
  }
  return response;
};
