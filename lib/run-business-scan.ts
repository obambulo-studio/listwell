import { checkIdSchema, runChecks } from "@listwell/audit-engine";

import {
  getAuditEngineEnv,
  getFetchWebsiteOptions,
  toBusinessSnapshot,
} from "./audit-env";
import { scorePercent, statusFromResult } from "./chat-onboarding";
import { publishSharedCheckRun } from "./check-snapshots";
import { checksForCategory } from "./checks/registry";
import { getBusiness, insertScan, updateScan } from "./data";
import { checkResultSchema } from "./schema";
import type { ScanRow, ScanTrigger } from "./schema";

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
    const completed = await updateScan(scan.id, {
      ...counts,
      finishedAt: new Date().toISOString(),
      results,
      status: "complete",
    });
    await publishSharedCheckRun(business, results);
    return completed;
  } catch (error) {
    return updateScan(scan.id, {
      error: error instanceof Error ? error.message : "Scan failed",
      finishedAt: new Date().toISOString(),
      status: "error",
    });
  }
};
