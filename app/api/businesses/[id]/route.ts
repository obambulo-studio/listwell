import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusiness, updateBusiness } from "@/lib/db";
import { updateBusinessRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  return NextResponse.json(business);
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await context.params);
  const existing = await getBusiness(id);
  if (!existing) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const body: unknown = await request.json();
  const parsed = updateBusinessRequestSchema.parse(body);
  const business = await updateBusiness(id, parsed);
  return NextResponse.json(business);
}
