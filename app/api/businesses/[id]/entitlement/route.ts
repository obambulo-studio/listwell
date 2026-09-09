import { NextResponse } from "next/server";
import { z } from "zod";

import { getBusiness } from "@/lib/data";
import { getReportAccess } from "@/lib/polar-server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const access = await getReportAccess(id);
  return NextResponse.json(access);
};
