import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
} from "@/lib/audit-env";
import { discoverBusiness, discoverRequestSchema } from "@/lib/discover";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "discover",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 20,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again soon." },
        { status: 429 }
      );
    }
    const body: unknown = await request.json();
    const parsed = discoverRequestSchema.parse(body);
    const env = await getAuditEngineEnv();
    const options = await getFetchWebsiteOptions();
    const result = await discoverBusiness(parsed, env, options);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid discover request" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Could not search listings" },
      { status: 500 }
    );
  }
};
