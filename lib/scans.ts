import { checkIdSchema, runChecks } from "@listwell/audit-engine";

import {
  getAuditEngineEnv,
  getFetchWebsiteOptions,
  toBusinessSnapshot,
} from "./audit-env";
import { scorePercent, statusFromResult } from "./chat-onboarding";
import { checksForCategory } from "./checks/registry";
import {
  getBusiness,
  getLatestCompleteScan,
  insertScan,
  listDueMonthlyEntitlements,
  setNextScanAt,
  updateScan,
} from "./data";
import { checkResultSchema, nextScanAtFrom, scanSummarySchema } from "./schema";
import type { ScanRow, ScanSummary, ScanTrigger } from "./schema";

const BASELINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const countsFromResults = (
  results: Record<string, { value: boolean | null; queued?: boolean }>
) => {
  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  for (const result of Object.values(results)) {
    const status = statusFromResult(result);
    if (status === "pass") {
      passCount += 1;
    } else if (status === "fail") {
      failCount += 1;
    } else if (status === "error") {
      errorCount += 1;
    }
  }
  return {
    errorCount,
    failCount,
    passCount,
    score: scorePercent({ fail: failCount, pass: passCount }),
  };
};

export const toScanSummary = (row: ScanRow): ScanSummary =>
  scanSummarySchema.parse({
    errorCount: row.errorCount,
    failCount: row.failCount,
    finishedAt: row.finishedAt,
    id: row.id,
    passCount: row.passCount,
    score: row.score,
    startedAt: row.startedAt,
    status: row.status,
    trigger: row.trigger,
  });

export const runScanForBusiness = async (
  businessId: string,
  trigger: ScanTrigger
): Promise<ScanRow> => {
  const business = await getBusiness(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const startedAt = new Date().toISOString();
  const scan = await insertScan({
    businessId,
    startedAt,
    status: "running",
    trigger,
  });

  try {
    const checkIds = checksForCategory(business.category).map((definition) =>
      checkIdSchema.parse(definition.id)
    );
    const snapshot = toBusinessSnapshot(business);
    const rawResults = await runChecks(snapshot, checkIds, {
      ...(await getFetchWebsiteOptions()),
      env: await getAuditEngineEnv(),
      includeQueued: true,
    });

    const results: Record<
      string,
      ReturnType<typeof checkResultSchema.parse>
    > = {};
    for (const [id, result] of Object.entries(rawResults)) {
      if (!result) {
        continue;
      }
      results[id] = checkResultSchema.parse(result);
    }

    const counts = countsFromResults(results);
    return updateScan(scan.id, {
      ...counts,
      finishedAt: new Date().toISOString(),
      results,
      status: "complete",
    });
  } catch (error) {
    return updateScan(scan.id, {
      error: error instanceof Error ? error.message : "Scan failed",
      finishedAt: new Date().toISOString(),
      status: "error",
    });
  }
};

const processDueEntitlement = async (
  entitlement: { businessId: string; id: string },
  now: Date
): Promise<"failed" | "ok"> => {
  try {
    const scan = await runScanForBusiness(entitlement.businessId, "schedule");
    await setNextScanAt(entitlement.id, nextScanAtFrom(now));
    return scan.status === "error" ? "failed" : "ok";
  } catch {
    await setNextScanAt(entitlement.id, nextScanAtFrom(now));
    return "failed";
  }
};

export const runDueScans = async (
  input: {
    now?: Date;
    limit?: number;
  } = {}
): Promise<{ ran: number; failed: number }> => {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 5;
  const due = await listDueMonthlyEntitlements(now, limit);

  const outcomes = await Promise.all(
    due.map((entitlement) => processDueEntitlement(entitlement, now))
  );

  return {
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    ran: outcomes.length,
  };
};

export const startBaselineScan = async (
  businessId: string
): Promise<ScanRow | null> => {
  const latest = await getLatestCompleteScan(businessId);
  if (latest?.finishedAt) {
    const finished = Date.parse(latest.finishedAt);
    if (
      !Number.isNaN(finished) &&
      Date.now() - finished < BASELINE_COOLDOWN_MS
    ) {
      return null;
    }
  }
  return runScanForBusiness(businessId, "baseline");
};
