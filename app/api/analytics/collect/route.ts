import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv, getExecutionContext } from "@/lib/audit-env";
import { api, getConvexClient } from "@/lib/convex/server";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export const OPTIONS = () =>
  new NextResponse(null, { headers: corsHeaders, status: 204 });

const collectQuerySchema = z.object({
  k: z.string().min(16),
  s: z.string().min(1),
});

const recordPageview = async (
  businessExternalId: string,
  ingestKey: string
): Promise<boolean> => {
  const result = await getConvexClient().mutation(api.webAnalytics.recordEvent, {
    businessExternalId,
    ingestKey,
  });
  return result.accepted;
};

export const GET = async (request: Request) => {
  const allowed = await consumeRateLimit({
    bucket: "analytics-collect",
    env: await getCloudflareEnv(),
    failClosed: false,
    maxRequests: 120,
    request,
  });
  if (!allowed) {
    return new NextResponse(null, { headers: corsHeaders, status: 429 });
  }

  const url = new URL(request.url);
  const parsed = collectQuerySchema.safeParse({
    k: url.searchParams.get("k") ?? "",
    s: url.searchParams.get("s") ?? "",
  });
  if (!parsed.success) {
    return new NextResponse(null, { headers: corsHeaders, status: 400 });
  }

  const run = recordPageview(parsed.data.s, parsed.data.k);
  const execution = await getExecutionContext();
  if (execution) {
    execution.waitUntil(run);
  } else {
    await run;
  }

  return new NextResponse(null, {
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
    },
    status: 204,
  });
};

export const POST = async (request: Request) => {
  const allowed = await consumeRateLimit({
    bucket: "analytics-collect",
    env: await getCloudflareEnv(),
    failClosed: false,
    maxRequests: 120,
    request,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { headers: corsHeaders, status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const parsed = z
    .object({
      ingestKey: z.string().min(16),
      site: z.string().min(1),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const accepted = await recordPageview(parsed.data.site, parsed.data.ingestKey);
  return NextResponse.json({ ok: accepted }, { status: accepted ? 200 : 403 });
};
