import { CHECK_IDS, runCheck, type CheckId } from "@listwell/audit-engine";
import { getAuditEngineEnv, getFetchWebsiteOptions, toBusinessSnapshot } from "../audit-env";
import type { Business, CheckResult } from "../schema";
import type { CheckRunner } from "./types";

export async function runBusinessCheck(business: Business, checkId: CheckId): Promise<CheckResult> {
  const env = await getAuditEngineEnv();
  const options = await getFetchWebsiteOptions();
  return runCheck(checkId, toBusinessSnapshot(business), { ...options, env });
}

export const runners: Record<string, CheckRunner> = Object.fromEntries(
  CHECK_IDS.map((id) => [
    id,
    async (business: Business) => runBusinessCheck(business, id),
  ]),
);

export const PORTED_CHECK_IDS = CHECK_IDS;
