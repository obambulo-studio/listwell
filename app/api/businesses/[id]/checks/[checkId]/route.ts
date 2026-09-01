import { checkIdSchema, isQueuedCheck } from "@listwell/audit-engine";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueQueuedChecks, readLatestCheckJob } from "@/lib/audit-jobs";
import { toBusinessSnapshot } from "@/lib/audit-env";
import { getCheckDefinition } from "@/lib/checks/registry";
import { runBusinessCheck } from "@/lib/checks/runners";
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

  const parsedId = checkIdSchema.safeParse(checkId);
  const definition = getCheckDefinition(checkId);
  if (!parsedId.success || !definition || !appliesToCategory(definition, business.category)) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  if (isQueuedCheck(parsedId.data)) {
    const existing = await readLatestCheckJob(business.id, parsedId.data);
    const cached = existing?.results[parsedId.data];
    if (cached) {
      return NextResponse.json(checkResultSchema.parse(cached));
    }
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return NextResponse.json(
        checkResultSchema.parse({
          type: "check",
          value: null,
          label: "Queued",
          queued: true,
          jobId: existing.id,
        }),
      );
    }

    const queued = await enqueueQueuedChecks({
      business: toBusinessSnapshot(business),
      checkIds: [parsedId.data],
      immediateResults: {},
    });
    const finished = await readLatestCheckJob(business.id, parsedId.data);
    const finishedResult = finished?.results[parsedId.data];
    if (finishedResult) {
      return NextResponse.json(checkResultSchema.parse(finishedResult));
    }
    return NextResponse.json(
      checkResultSchema.parse({
        type: "check",
        value: null,
        label: "Queued",
        queued: true,
        jobId: queued.jobId,
      }),
    );
  }

  const result = checkResultSchema.parse(await runBusinessCheck(business, parsedId.data));
  return NextResponse.json(result);
}
