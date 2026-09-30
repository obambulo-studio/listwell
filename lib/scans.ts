import { getLatestCompleteScan, listDueMonthlyEntitlements } from "./data";
import { runScanForBusiness } from "./run-business-scan";
import { runInSeries } from "./run-in-series";
import { runReservedMonthlyScan } from "./scheduled-scan-run";
import { scanSummarySchema } from "./schema";
import type { ScanRow, ScanSummary } from "./schema";

const BASELINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export { runScanForBusiness } from "./run-business-scan";

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

const processDueEntitlement = async (entitlement: {
  businessId: string;
  id: string;
}): Promise<"failed" | "ok"> => {
  try {
    const outcome = await runReservedMonthlyScan({
      businessId: entitlement.businessId,
      entitlementId: entitlement.id,
    });
    if (outcome.skipped) {
      return "ok";
    }
    if (!outcome.ok) {
      return "failed";
    }
    return outcome.scan.status === "error" ? "failed" : "ok";
  } catch {
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
  const limit = Math.min(input.limit ?? 2, 5);
  const due = await listDueMonthlyEntitlements(now, limit);

  const outcomes = await runInSeries(due, processDueEntitlement);

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
