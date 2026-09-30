import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { getBusiness } from "@/lib/data";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import {
  auditSummaryResultSchema,
  completedCheckSchema,
  resolveWorkersAiBinding,
  SUMMARY_CACHE_TTL_SECONDS,
  summarizeReport,
  summaryCacheKey,
} from "@/lib/summaries";
import type { AuditSummaryResult } from "@/lib/summaries";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const summaryRequestSchema = z.object({
  checks: z.array(completedCheckSchema),
});

interface SummaryMemory {
  entries: Map<string, { expiresAt: number; value: AuditSummaryResult }>;
}

declare global {
  var listwellSummaryCache: SummaryMemory | undefined;
}

const summaryMemory: SummaryMemory = globalThis.listwellSummaryCache ?? {
  entries: new Map(),
};
globalThis.listwellSummaryCache = summaryMemory;

const readSummaryCache = async (
  key: string
): Promise<AuditSummaryResult | null> => {
  const cached = summaryMemory.entries.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return null;
  }
  try {
    const raw = await env.AUDIT_KV.get(key, "json");
    const parsed = auditSummaryResultSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }
    summaryMemory.entries.set(key, {
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_SECONDS * 1000,
      value: parsed.data,
    });
    return parsed.data;
  } catch (error) {
    console.error("summary cache read failed", error);
    return null;
  }
};

const writeSummaryCache = async (
  key: string,
  value: AuditSummaryResult
): Promise<void> => {
  summaryMemory.entries.set(key, {
    expiresAt: Date.now() + SUMMARY_CACHE_TTL_SECONDS * 1000,
    value,
  });
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return;
  }
  await env.AUDIT_KV.put(key, JSON.stringify(value), {
    expirationTtl: SUMMARY_CACHE_TTL_SECONDS,
  });
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const body: unknown = await request.json();
  const parsed = summaryRequestSchema.parse(body);
  const cacheKey = await summaryCacheKey(business.id, parsed.checks);
  const cached = await readSummaryCache(cacheKey);
  if (cached) {
    return NextResponse.json(auditSummaryResultSchema.parse(cached));
  }

  const allowed = await consumeRateLimit({
    bucket: "summary",
    env: await getCloudflareEnv(),
    failClosed: false,
    maxRequests: 10,
    request,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again soon." },
      { status: 429 }
    );
  }

  const env = await getCloudflareEnv();
  const summary = await summarizeReport({
    ai: resolveWorkersAiBinding(env?.AI),
    businessName: business.name,
    checks: parsed.checks,
  });
  try {
    await writeSummaryCache(cacheKey, summary);
  } catch (error) {
    console.error("summary cache write failed", error);
  }

  return NextResponse.json(auditSummaryResultSchema.parse(summary));
};
