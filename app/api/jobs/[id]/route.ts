import { NextResponse } from "next/server";
import { z } from "zod";
import { auditJobSchema, readAuditJob } from "@/lib/audit-jobs";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await context.params);
  const job = await readAuditJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(auditJobSchema.parse(job));
}
