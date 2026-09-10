import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { wwwToApexHref } from "@/lib/www-redirect";

export const middleware = (request: NextRequest): NextResponse => {
  const destination = wwwToApexHref(request.url);

  if (destination) {
    return NextResponse.redirect(destination, 301);
  }

  return NextResponse.next();
};
