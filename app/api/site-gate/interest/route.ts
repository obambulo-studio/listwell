import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import { saveSiteInterest, siteInterestInputSchema } from "@/lib/site-interest";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  try {
    const env = await getCloudflareEnv();
    if (!env?.AUDIT_KV) {
      return NextResponse.json(
        { error: "Interest sign-ups are not available right now." },
        { status: 503 }
      );
    }

    const allowed = await consumeRateLimit({
      bucket: "site-interest",
      env,
      failClosed: true,
      maxRequests: 8,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again soon." },
        { status: 429 }
      );
    }

    const body: unknown = await request.json();
    const payload = siteInterestInputSchema.parse(body);

    const result = await saveSiteInterest({ env, payload });
    return NextResponse.json({
      created: result.created,
      message: result.created
        ? "Thanks. We will be in touch."
        : "You are already on the list.",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Could not save your details." },
      { status: 500 }
    );
  }
};
