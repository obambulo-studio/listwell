import { checkIdSchema, isQueuedCheck } from "@listwell/audit-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv, toBusinessSnapshot } from "@/lib/audit-env";
import { enqueueQueuedChecks, readLatestCheckJob } from "@/lib/audit-jobs";
import { readReusableCheckPayload } from "@/lib/check-snapshots";
import { getCheckDefinition } from "@/lib/checks/registry";
import { runBusinessCheck } from "@/lib/checks/runners";
import { appliesToCategory } from "@/lib/checks/types";
import { getBusiness } from "@/lib/data";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import { checkResultSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  checkId: z.string(),
  id: z.string(),
});

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string; checkId: string }> }
) => {
  const allowed = await consumeRateLimit({
    bucket: "checks",
    env: await getCloudflareEnv(),
    failClosed: false,
    maxRequests: 20,
    request,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again soon." },
      { status: 429 }
    );
  }

  const { id, checkId } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const parsedId = checkIdSchema.safeParse(checkId);
  const definition = getCheckDefinition(checkId);
  if (
    !parsedId.success ||
    !definition ||
    !appliesToCategory(definition, business.category)
  ) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  const shared = await readReusableCheckPayload(business);
  if (shared) {
    const sharedResult = shared.results[parsedId.data];
    if (sharedResult) {
      return NextResponse.json(checkResultSchema.parse(sharedResult));
    }
    const waiting = shared.pending.includes(parsedId.data);
    return NextResponse.json(
      checkResultSchema.parse({
        label: waiting ? "Queued" : "This check could not run",
        queued: waiting,
        type: "check",
        value: null,
        ...(waiting && shared.jobId ? { jobId: shared.jobId } : {}),
      })
    );
  }

  if (isQueuedCheck(parsedId.data)) {
    const existing = await readLatestCheckJob(business.id, parsedId.data);
    const cached = existing?.results[parsedId.data];
    if (cached) {
      return NextResponse.json(checkResultSchema.parse(cached));
    }
    if (
      existing &&
      (existing.status === "queued" || existing.status === "running")
    ) {
      return NextResponse.json(
        checkResultSchema.parse({
          jobId: existing.id,
          label: "Queued",
          queued: true,
          type: "check",
          value: null,
        })
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
        jobId: queued.jobId,
        label: "Queued",
        queued: true,
        type: "check",
        value: null,
      })
    );
  }

  const result = checkResultSchema.parse(
    await runBusinessCheck(business, parsedId.data)
  );
  return NextResponse.json(result);
};
