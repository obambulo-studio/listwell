import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
} from "@/lib/audit-env";
import { discoverBusiness, discoverRequestSchema } from "@/lib/discover";
import { evaluateRateLimit, rateLimitHttpError } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const DISCOVER_UNAVAILABLE_ERROR = "Listing search is not available right now.";

export const POST = async (request: Request) => {
  try {
    const decision = await evaluateRateLimit({
      bucket: "discover",
      env: await getCloudflareEnv(),
      failClosed: true,
      maxRequests: 20,
      request,
    });
    const blocked = rateLimitHttpError(decision, DISCOVER_UNAVAILABLE_ERROR);
    if (blocked) {
      return NextResponse.json(
        { error: blocked.error },
        { status: blocked.status }
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
