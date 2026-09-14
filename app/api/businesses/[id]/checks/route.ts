import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { runBusinessCheckBatch } from "@/lib/audit-jobs";
import { getBusiness } from "@/lib/data";
import { checkBatchResponseSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const business = await getBusiness(id);
    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }

    const batch = await runBusinessCheckBatch(business);
    return NextResponse.json(
      checkBatchResponseSchema.parse({
        jobId: batch.jobId,
        pending: batch.pending,
        results: batch.results,
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not run checks for this audit" },
      { status: 500 }
    );
  }
};
