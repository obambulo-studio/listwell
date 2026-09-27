import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import {
  createSiteGateCookieValue,
  readSitePassword,
  siteGateCookieHeader,
  siteGateSecureCookies,
} from "@/lib/site-gate";

export const dynamic = "force-dynamic";

const unlockBodySchema = z.object({
  password: z.string().min(1).max(256),
});

export const POST = async (request: Request) => {
  try {
    const env = await getCloudflareEnv();
    const sitePassword = readSitePassword(env);
    if (!sitePassword) {
      return NextResponse.json(
        { error: "Site gate is not enabled" },
        { status: 404 }
      );
    }

    const allowed = await consumeRateLimit({
      bucket: "site-gate-unlock",
      env,
      failClosed: Boolean(env?.AUDIT_KV),
      maxRequests: 20,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again soon." },
        { status: 429 }
      );
    }

    const body: unknown = await request.json();
    const { password } = unlockBodySchema.parse(body);
    if (password !== sitePassword) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      );
    }

    const cookieValue = await createSiteGateCookieValue(sitePassword);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
      "Set-Cookie",
      siteGateCookieHeader(cookieValue, siteGateSecureCookies(request))
    );
    return new NextResponse(JSON.stringify({ ok: true }), {
      headers,
      status: 200,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not unlock site" },
      { status: 500 }
    );
  }
};
