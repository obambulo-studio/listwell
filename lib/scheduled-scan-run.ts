import type { Id } from "../convex/_generated/dataModel";
import {
  getBusiness,
  getLatestCompleteScanDetails,
  reserveDueMonthlyScan,
} from "./data";
import { runScanForBusiness } from "./run-business-scan";
import { notifyScheduledScanComplete } from "./scheduled-scan-notify";
import type { ScanRow } from "./schema";

const readSiteUrl = (): string | null => {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return url ? url.replace(/\/$/u, "") : null;
};

export const runReservedMonthlyScan = async (input: {
  businessId: string;
  entitlementId: string;
  now?: Date;
}): Promise<
  | { ok: true; scan: ScanRow; skipped: false }
  | { ok: false; scan: ScanRow | null; skipped: false; error: string }
  | { ok: true; skipped: true }
> => {
  const now = input.now ?? new Date();
  const reserved = await reserveDueMonthlyScan(
    input.entitlementId as Id<"entitlements">,
    now
  );
  if (!reserved.reserved) {
    return { ok: true, skipped: true };
  }

  const businessId = reserved.businessExternalId ?? input.businessId;
  const business = await getBusiness(businessId);
  if (!business) {
    return {
      error: "Business not found",
      ok: false,
      scan: null,
      skipped: false,
    };
  }

  const previousComplete = await getLatestCompleteScanDetails(businessId);

  let scan: ScanRow;
  try {
    scan = await runScanForBusiness(businessId, "schedule");
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Scan failed",
      ok: false,
      scan: null,
      skipped: false,
    };
  }

  const siteUrl = readSiteUrl();
  if (siteUrl && scan.status === "complete") {
    try {
      await notifyScheduledScanComplete({
        businessId,
        businessName: business.name,
        previousComplete: previousComplete
          ? {
              results: previousComplete.results,
              score: previousComplete.score,
            }
          : null,
        scan,
        siteUrl,
      });
    } catch (error) {
      console.error("runReservedMonthlyScan: notification failed", error);
    }
  }

  if (scan.status === "error") {
    return {
      error: scan.error ?? "Scan failed",
      ok: false,
      scan,
      skipped: false,
    };
  }
  return { ok: true, scan, skipped: false };
};
