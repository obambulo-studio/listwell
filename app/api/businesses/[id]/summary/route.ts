import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareEnv } from "@/lib/audit-env";
import { getBusiness } from "@/lib/db";
import {
  auditSummaryResultSchema,
  completedCheckSchema,
  resolveWorkersAiBinding,
  summarizeReport,
} from "@/lib/summaries";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const summaryRequestSchema = z.object({
  checks: z.array(completedCheckSchema),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const body: unknown = await request.json();
  const parsed = summaryRequestSchema.parse(body);
  const env = await getCloudflareEnv();
  const summary = await summarizeReport({
    businessName: business.name,
    checks: parsed.checks,
    ai: resolveWorkersAiBinding(env?.AI),
  });

  return NextResponse.json(auditSummaryResultSchema.parse(summary));
}
