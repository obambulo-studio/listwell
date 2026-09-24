import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  lookupProvidersFromEnv,
} from "@/lib/audit-env";
import {
  lookupPlaces,
  lookupQuerySchema,
  lookupResponseSchema,
} from "@/lib/discover";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "lookups",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 30,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again soon." },
        { status: 429 }
      );
    }
    const url = new URL(request.url);
    const parsed = lookupQuerySchema.parse({
      id: url.searchParams.get("id") ?? undefined,
      lat: url.searchParams.get("lat") ?? undefined,
      lon: url.searchParams.get("lon") ?? undefined,
      near: url.searchParams.get("near") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
    });
    const env = await getAuditEngineEnv();
    const result = await lookupPlaces(parsed, env);
    return NextResponse.json(lookupResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid lookup request" },
        { status: 400 }
      );
    }
    const env = await getAuditEngineEnv();
    return NextResponse.json(
      lookupResponseSchema.parse({
        candidates: [],
        providers: lookupProvidersFromEnv(env),
      })
    );
  }
};
