import { NextResponse } from "next/server";
import { z } from "zod";

import { getBusiness, listScansForBusiness } from "@/lib/data";
import { getReportAccess } from "@/lib/polar-server";
import { scanSummarySchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const scansResponseSchema = z.object({
  scans: z.array(scanSummarySchema),
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
  if (!access.unlocked || access.sessionRequired) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await listScansForBusiness(id);
  return NextResponse.json(scansResponseSchema.parse({ scans: rows }));
};
