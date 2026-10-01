import type { Id } from "../convex/_generated/dataModel";
import {
  getBusiness,
  getLatestCompleteScan,
  reserveDueMonthlyScan,
} from "./data";
import { runScanForBusiness } from "./run-business-scan";
import { prepareScanEmailNotification } from "./scheduled-scan-notify";
import type { PendingScanEmail } from "./scheduled-scan-notify";
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
  | {
      ok: true;
      scan: ScanRow;
      scanEmailNotification: PendingScanEmail | null;
      skipped: false;
    }
  | { ok: false; scan: ScanRow | null; skipped: false; error: string }
  | { ok: true; skipped: true; scanEmailNotification: null }
> => {
  const now = input.now ?? new Date();
  const reserved = await reserveDueMonthlyScan(
    input.entitlementId as Id<"entitlements">,
    now
  );
  if (!reserved.reserved) {
    return { ok: true, scanEmailNotification: null, skipped: true };
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

  let previousScore: number | null = null;
  try {
    const prior = await getLatestCompleteScan(businessId);
    previousScore = prior?.score ?? null;
  } catch (error) {
    console.error("runReservedMonthlyScan: prior score lookup failed", error);
  }

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

  let scanEmailNotification: PendingScanEmail | null = null;
  const siteUrl = readSiteUrl();
  if (siteUrl && scan.status === "complete") {
    try {
      scanEmailNotification = await prepareScanEmailNotification({
        businessId,
        businessName: business.name,
        finishedAt: scan.finishedAt,
        previousScore,
        score: scan.score,
        siteUrl,
      });
    } catch (error) {
      console.error("runReservedMonthlyScan: notification prep failed", error);
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
  return { ok: true, scan, scanEmailNotification, skipped: false };
};
