import { checkIdSchema, runChecks, splitQueuedChecks } from "@listwell/audit-engine";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuditEngineEnv, getFetchWebsiteOptions, toBusinessSnapshot } from "@/lib/audit-env";
import { enqueueQueuedChecks, readAuditJob } from "@/lib/audit-jobs";
import { checksForCategory } from "@/lib/checks/registry";
import { getBusiness } from "@/lib/db";
import { checkBatchResponseSchema } from "@/lib/schema";

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

  const checkIds = checksForCategory(business.category).map((definition) => checkIdSchema.parse(definition.id));
  const { immediate, queued } = splitQueuedChecks(checkIds);
  const snapshot = toBusinessSnapshot(business);
  const env = await getAuditEngineEnv();
  const options = await getFetchWebsiteOptions();
  const results = await runChecks(snapshot, immediate, {
    ...options,
    env,
    includeQueued: false,
  });

  if (queued.length === 0) {
    return NextResponse.json(checkBatchResponseSchema.parse({ results, pending: [] }));
  }

  const job = await enqueueQueuedChecks({
    business: snapshot,
    checkIds: queued,
    immediateResults: results,
  });
  const finished = await readAuditJob(job.jobId);
  if (finished?.status === "complete") {
    return NextResponse.json(
      checkBatchResponseSchema.parse({
        results: { ...results, ...finished.results },
        pending: [],
        jobId: job.jobId,
      }),
    );
  }

  return NextResponse.json(
    checkBatchResponseSchema.parse({
      results,
      pending: job.pending,
      jobId: job.jobId,
    }),
  );
}
