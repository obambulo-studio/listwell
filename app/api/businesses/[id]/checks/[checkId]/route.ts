import { NextResponse } from "next/server";
import { z } from "zod";
import { getCheckDefinition } from "@/lib/checks/registry";
import { runners } from "@/lib/checks/runners";
import { appliesToCategory } from "@/lib/checks/types";
import { getBusiness } from "@/lib/db";
import { checkResultSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
  checkId: z.string(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const definition = getCheckDefinition(checkId);
  const runner = runners[checkId];
  if (!definition || !runner || !appliesToCategory(definition, business.category)) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  const result = checkResultSchema.parse(await runner(business));
  return NextResponse.json(result);
}
