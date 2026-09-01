import {
  checkIdSchema,
  checkResultSchema,
  runChecks,
  type AuditJob,
  type BusinessSnapshot,
  type CheckId,
  type CheckResult,
  type FetchWebsiteOptions,
} from "@listwell/audit-engine";
import { z } from "zod";
import { getAuditEngineEnv, getCloudflareEnv, getExecutionContext, getFetchWebsiteOptions } from "./audit-env";

const auditJobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "complete", "error"]),
  checkIds: z.array(checkIdSchema),
  results: z.record(checkIdSchema, checkResultSchema),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

function jobKey(id: string): string {
  return `job:${id}`;
}

function latestKey(businessId: string, checkId: CheckId): string {
  return `latest:${businessId}:${checkId}`;
}

type JobMemory = {
  jobs: Map<string, AuditJob>;
  latest: Map<string, string>;
};

declare global {
  var listwellAuditJobs: JobMemory | undefined;
}

const jobMemory: JobMemory = globalThis.listwellAuditJobs ?? {
  jobs: new Map<string, AuditJob>(),
  latest: new Map<string, string>(),
};
globalThis.listwellAuditJobs = jobMemory;

const memoryJobs = jobMemory.jobs;
const memoryLatest = jobMemory.latest;

export function newJobId(): string {
  return crypto.randomUUID();
}

export async function readAuditJob(id: string): Promise<AuditJob | null> {
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return memoryJobs.get(id) ?? null;
  }
  const raw = await env.AUDIT_KV.get(jobKey(id), "json");
  const parsed = auditJobSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function readLatestCheckJob(businessId: string, checkId: CheckId): Promise<AuditJob | null> {
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    const jobId = memoryLatest.get(latestKey(businessId, checkId));
    return jobId ? (memoryJobs.get(jobId) ?? null) : null;
  }
  const jobId = await env.AUDIT_KV.get(latestKey(businessId, checkId));
  if (!jobId) {
    return null;
  }
  return readAuditJob(jobId);
}

export async function writeAuditJob(job: AuditJob, businessId?: string): Promise<void> {
  const parsed = auditJobSchema.parse(job);
  memoryJobs.set(parsed.id, parsed);
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    await env.AUDIT_KV.put(jobKey(parsed.id), JSON.stringify(parsed), {
      expirationTtl: 60 * 60 * 24,
    });
  }
  if (!businessId) {
    return;
  }
  for (const checkId of parsed.checkIds) {
    memoryLatest.set(latestKey(businessId, checkId), parsed.id);
    if (env?.AUDIT_KV) {
      await env.AUDIT_KV.put(latestKey(businessId, checkId), parsed.id, {
        expirationTtl: 60 * 60 * 24,
      });
    }
  }
}

export async function runQueuedChecks(
  business: BusinessSnapshot,
  checkIds: CheckId[],
  options: FetchWebsiteOptions,
): Promise<Partial<Record<CheckId, CheckResult>>> {
  const engineEnv = await getAuditEngineEnv();
  return runChecks(business, checkIds, {
    ...options,
    env: engineEnv,
    includeQueued: true,
  });
}

export async function enqueueQueuedChecks(input: {
  business: BusinessSnapshot;
  checkIds: CheckId[];
  immediateResults: Partial<Record<CheckId, CheckResult>>;
}): Promise<{ jobId: string; pending: CheckId[] }> {
  const options = await getFetchWebsiteOptions();
  const job: AuditJob = {
    id: newJobId(),
    status: "queued",
    checkIds: input.checkIds,
    results: input.immediateResults,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await writeAuditJob(job, input.business.id);

  const run = async () => {
    const current = (await readAuditJob(job.id)) ?? job;
    current.status = "running";
    current.updatedAt = Date.now();
    await writeAuditJob(current, input.business.id);
    try {
      const results = await runQueuedChecks(input.business, input.checkIds, options);
      current.results = { ...current.results, ...results };
      current.status = "complete";
      current.updatedAt = Date.now();
      await writeAuditJob(current, input.business.id);
    } catch (error) {
      current.status = "error";
      current.error = error instanceof Error ? error.message : "Unknown error";
      current.updatedAt = Date.now();
      await writeAuditJob(current, input.business.id);
    }
  };

  const execution = await getExecutionContext();
  if (execution) {
    execution.waitUntil(run());
  } else {
    await run();
  }

  return { jobId: job.id, pending: input.checkIds };
}

export { auditJobSchema };
