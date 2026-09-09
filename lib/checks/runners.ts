import { CHECK_IDS, runCheck } from "@listwell/audit-engine";
import type { CheckId } from "@listwell/audit-engine";

import {
  getAuditEngineEnv,
  getFetchWebsiteOptions,
  toBusinessSnapshot,
} from "../audit-env";
import type { Business, CheckResult } from "../schema";
import type { CheckRunner } from "./types";

export { CHECK_IDS as PORTED_CHECK_IDS } from "@listwell/audit-engine";

export const runBusinessCheck = async (
  business: Business,
  checkId: CheckId
): Promise<CheckResult> => {
  const [env, options] = await Promise.all([
    getAuditEngineEnv(),
    getFetchWebsiteOptions(),
  ]);
  return runCheck(checkId, toBusinessSnapshot(business), { ...options, env });
};

export const runners: Record<string, CheckRunner> = Object.fromEntries(
  CHECK_IDS.map((id) => [
    id,
    (business: Business) => runBusinessCheck(business, id),
  ])
);
