import { NextResponse } from "next/server";
import { createBusiness, idListQuerySchema, listBusinesses } from "@/lib/db";
import { createBusinessRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = idListQuerySchema.parse({
    ids: url.searchParams.get("ids") ?? undefined,
  });
  if (!query.ids) {
    return NextResponse.json([]);
  }
  const ids = query.ids.split(",").map((id) => id.trim()).filter(Boolean);
  const businesses = await listBusinesses(ids);
  return NextResponse.json(businesses);
}

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const parsed = createBusinessRequestSchema.parse(body);
  const business = await createBusiness(parsed);
  return NextResponse.json(business);
}
