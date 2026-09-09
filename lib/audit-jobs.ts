import {
  checkIdSchema,
  runChecks,
  splitQueuedChecks,
} from "@listwell/audit-engine";
import type {
  AuditJob,
  BusinessSnapshot,
  CheckId,
  CheckResult,
  FetchWebsiteOptions,
} from "@listwell/audit-engine";
import { z } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getExecutionContext,
  getFetchWebsiteOptions,
  toBusinessSnapshot,
} from "./audit-env";
import { checksForCategory } from "./checks/registry";
import { checkResultSchema } from "./schema";
import type { Business, CheckResult as AppCheckResult } from "./schema";

/** Zod v4 schema — do not compose audit-engine's Zod v3 checkIdSchema into z.record. */
const auditJobStorageSchema = z.object({
  checkIds: z.array(z.string()),
  createdAt: z.number(),
  error: z.string().optional(),
  id: z.string(),
  results: z.record(z.string(), checkResultSchema),
  status: z.enum(["queued", "running", "complete", "error"]),
  updatedAt: z.number(),
});

export const auditJobSchema = auditJobStorageSchema;

const parseAuditJob = (raw: unknown): AuditJob => {
  const stored = auditJobStorageSchema.parse(raw);
  const checkIds = stored.checkIds.map((id) => checkIdSchema.parse(id));
  const results: Partial<Record<CheckId, CheckResult>> = {};
  for (const [key, value] of Object.entries(stored.results)) {
    const checkId = checkIdSchema.parse(key);
    results[checkId] = {
      label: value.label,
      type: "check",
      value: value.value,
    };
  }
  return {
    checkIds,
    createdAt: stored.createdAt,
    error: stored.error,
    id: stored.id,
    results,
    status: stored.status,
    updatedAt: stored.updatedAt,
  };
};

const serializeAuditJob = (
  job: AuditJob
): z.infer<typeof auditJobStorageSchema> => {
  const results: Record<string, z.infer<typeof checkResultSchema>> = {};
  for (const [key, value] of Object.entries(job.results)) {
    if (!value) {
      continue;
    }
    results[key] = checkResultSchema.parse(value);
  }
  return auditJobStorageSchema.parse({
    checkIds: job.checkIds,
    createdAt: job.createdAt,
    error: job.error,
    id: job.id,
    results,
    status: job.status,
    updatedAt: job.updatedAt,
  });
};

const jobKey = (id: string): string => `job:${id}`;

const latestKey = (businessId: string, checkId: CheckId): string =>
  `latest:${businessId}:${checkId}`;

interface JobMemory {
  jobs: Map<string, AuditJob>;
  latest: Map<string, string>;
}

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

export const newJobId = (): string => crypto.randomUUID();

export const readAuditJob = async (id: string): Promise<AuditJob | null> => {
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return memoryJobs.get(id) ?? null;
  }
  const raw = await env.AUDIT_KV.get(jobKey(id), "json");
  const parsed = auditJobStorageSchema.safeParse(raw);
  return parsed.success ? parseAuditJob(parsed.data) : null;
};

export const readLatestCheckJob = async (
  businessId: string,
  checkId: CheckId
): Promise<AuditJob | null> => {
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    const jobId = memoryLatest.get(latestKey(businessId, checkId));
    return jobId ? (memoryJobs.get(jobId) ?? null) : null;
  }
  const jobId = await env.AUDIT_KV.get(latestKey(businessId, checkId));
  if (typeof jobId !== "string" || jobId.length === 0) {
    return null;
  }
  return readAuditJob(jobId);
};

export const writeAuditJob = async (
  job: AuditJob,
  businessId?: string
): Promise<void> => {
  const parsed = parseAuditJob(serializeAuditJob(job));
  memoryJobs.set(parsed.id, parsed);
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    await env.AUDIT_KV.put(
      jobKey(parsed.id),
      JSON.stringify(serializeAuditJob(parsed)),
      {
        expirationTtl: 60 * 60 * 24,
      }
    );
  }
  if (!businessId) {
    return;
  }
  await Promise.all(
    parsed.checkIds.map(async (checkId) => {
      memoryLatest.set(latestKey(businessId, checkId), parsed.id);
      if (env?.AUDIT_KV) {
        await env.AUDIT_KV.put(latestKey(businessId, checkId), parsed.id, {
          expirationTtl: 60 * 60 * 24,
        });
      }
    })
  );
};

export const runQueuedChecks = async (
  business: BusinessSnapshot,
  checkIds: CheckId[],
  options: FetchWebsiteOptions
): Promise<Partial<Record<CheckId, CheckResult>>> => {
  const engineEnv = await getAuditEngineEnv();
  return runChecks(business, checkIds, {
    ...options,
    env: engineEnv,
    includeQueued: true,
  });
};

export const enqueueQueuedChecks = async (input: {
  business: BusinessSnapshot;
  checkIds: CheckId[];
  immediateResults: Partial<Record<CheckId, CheckResult>>;
}): Promise<{ jobId: string; pending: CheckId[] }> => {
  const options = await getFetchWebsiteOptions();
  const job: AuditJob = {
    checkIds: input.checkIds,
    createdAt: Date.now(),
    id: newJobId(),
    results: input.immediateResults,
    status: "queued",
    updatedAt: Date.now(),
  };
  await writeAuditJob(job, input.business.id);

  const run = async () => {
    const current = (await readAuditJob(job.id)) ?? job;
    current.status = "running";
    current.updatedAt = Date.now();
    await writeAuditJob(current, input.business.id);
    try {
      const results = await runQueuedChecks(
        input.business,
        input.checkIds,
        options
      );
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
};

const missingCheckResult = checkResultSchema.parse({
  label: "This check could not run",
  type: "check",
  value: null,
});

const toAppCheckResult = (result: {
  type: "check";
  value: boolean | null;
  label?: string;
}): AppCheckResult =>
  checkResultSchema.parse({
    label: result.label,
    type: "check",
    value: result.value,
  });

const queuedPlaceholder = (jobId?: string): AppCheckResult =>
  checkResultSchema.parse({
    queued: true,
    type: "check",
    value: null,
    ...(jobId ? { jobId } : {}),
  });

const collectStoredResults = async (
  businessId: string,
  queuedIds: CheckId[]
): Promise<Record<string, AppCheckResult>> => {
  const stored: Record<string, AppCheckResult> = {};
  const seen = new Set<string>();
  const jobs = await Promise.all(
    queuedIds.map((checkId) => readLatestCheckJob(businessId, checkId))
  );
  for (const job of jobs) {
    if (!job || seen.has(job.id)) {
      continue;
    }
    seen.add(job.id);
    const queuedSet = new Set<string>(queuedIds);
    for (const [id, result] of Object.entries(job.results)) {
      if (!result || !queuedSet.has(id)) {
        continue;
      }
      stored[id] = toAppCheckResult(result);
    }
  }
  return stored;
};

const latestInFlightJob = async (
  businessId: string,
  queuedIds: CheckId[]
): Promise<AuditJob | null> => {
  const jobs = await Promise.all(
    queuedIds.map((checkId) => readLatestCheckJob(businessId, checkId))
  );
  for (const job of jobs) {
    if (job && (job.status === "queued" || job.status === "running")) {
      return job;
    }
  }
  return null;
};

const fillCheckResults = (
  checkIds: CheckId[],
  results: Record<string, AppCheckResult>,
  pending: string[],
  jobId?: string
): Record<string, AppCheckResult> => {
  const pendingSet = new Set(pending);
  const filled: Record<string, AppCheckResult> = { ...results };
  for (const id of checkIds) {
    if (filled[id]) {
      continue;
    }
    filled[id] = pendingSet.has(id)
      ? queuedPlaceholder(jobId)
      : missingCheckResult;
  }
  return filled;
};

const settleQueuedJob = async (
  checkIds: CheckId[],
  results: Record<string, AppCheckResult>,
  job: { jobId: string; pending: CheckId[] }
): Promise<{
  jobId?: string;
  pending: string[];
  results: Record<string, AppCheckResult>;
}> => {
  const finished = await readAuditJob(job.jobId);
  if (finished?.status !== "complete") {
    return {
      jobId: job.jobId,
      pending: job.pending,
      results: fillCheckResults(checkIds, results, job.pending, job.jobId),
    };
  }
  for (const [id, result] of Object.entries(finished.results)) {
    if (result) {
      results[id] = toAppCheckResult(result);
    }
  }
  return {
    jobId: job.jobId,
    pending: [],
    results: fillCheckResults(checkIds, results, []),
  };
};

export const runBusinessCheckBatch = async (
  business: Business,
  options: { reuseStoredQueued?: boolean } = {}
): Promise<{
  jobId?: string;
  pending: string[];
  results: Record<string, AppCheckResult>;
}> => {
  const checkIds = checksForCategory(business.category).map((definition) =>
    checkIdSchema.parse(definition.id)
  );
  const { immediate, queued } = splitQueuedChecks(checkIds);
  const snapshot = toBusinessSnapshot(business);
  const [env, fetchOptions] = await Promise.all([
    getAuditEngineEnv(),
    getFetchWebsiteOptions(),
  ]);
  const computed = await runChecks(snapshot, immediate, {
    ...fetchOptions,
    env,
    includeQueued: false,
  });

  const results: Record<string, AppCheckResult> = {};
  for (const [id, result] of Object.entries(computed)) {
    if (result) {
      results[id] = toAppCheckResult(result);
    }
  }

  if (queued.length === 0) {
    return {
      pending: [],
      results: fillCheckResults(checkIds, results, []),
    };
  }

  if (options.reuseStoredQueued) {
    const stored = await collectStoredResults(business.id, queued);
    for (const [id, result] of Object.entries(stored)) {
      results[id] = result;
    }
    const inFlight = await latestInFlightJob(business.id, queued);
    const missingQueued = queued.filter((id) => results[id] === undefined);
    if (inFlight) {
      return {
        jobId: inFlight.id,
        pending: missingQueued,
        results: fillCheckResults(
          checkIds,
          results,
          missingQueued,
          inFlight.id
        ),
      };
    }
    if (missingQueued.length === 0) {
      return {
        pending: [],
        results: fillCheckResults(checkIds, results, []),
      };
    }
    return settleQueuedJob(
      checkIds,
      results,
      await enqueueQueuedChecks({
        business: snapshot,
        checkIds: missingQueued,
        immediateResults: computed,
      })
    );
  }

  return settleQueuedJob(
    checkIds,
    results,
    await enqueueQueuedChecks({
      business: snapshot,
      checkIds: queued,
      immediateResults: computed,
    })
  );
};
