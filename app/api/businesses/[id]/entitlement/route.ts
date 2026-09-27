import { NextResponse } from "next/server";
import { z } from "zod";

import { getBusiness, getOnceRescanStatus } from "@/lib/data";
import { getReportAccess } from "@/lib/polar-server";
import { entitlementStateSchema } from "@/lib/schema";

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
  if (
    access.unlocked &&
    !access.sessionRequired &&
    access.kind === "report_once"
  ) {
    try {
      const onceRescan = await getOnceRescanStatus(id, new Date());
      return NextResponse.json(
        entitlementStateSchema.parse({ ...access, onceRescan })
      );
    } catch (error) {
      console.error("entitlement: once rescan status unavailable", error);
    }
  }
  return NextResponse.json(access);
};
