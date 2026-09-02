import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuditEngineEnv } from "@/lib/audit-env";
import { lookupPlaces, lookupQuerySchema, lookupResponseSchema } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = lookupQuerySchema.parse({
      source: url.searchParams.get("source") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      id: url.searchParams.get("id") ?? undefined,
      near: url.searchParams.get("near") ?? undefined,
      lat: url.searchParams.get("lat") ?? undefined,
      lon: url.searchParams.get("lon") ?? undefined,
    });
    const env = await getAuditEngineEnv();
    const result = await lookupPlaces(parsed, env);
    return NextResponse.json(lookupResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid lookup request" }, { status: 400 });
    }
    return NextResponse.json({ candidates: [] });
  }
}
