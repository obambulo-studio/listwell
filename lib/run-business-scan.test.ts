import { beforeEach, describe, expect, it, vi } from "vitest";

import { businessFromCreateRequest } from "./data";
import { runScanForBusiness } from "./run-business-scan";
import { scanRowSchema } from "./schema";
import type { Business, ScanRow } from "./schema";

const {
  getBusiness,
  insertScan,
  publishSharedCheckRun,
  runBusinessResearch,
  runChecks,
  updateScan,
} = vi.hoisted(() => ({
  getBusiness: vi.fn<() => Promise<Business | null>>(),
  insertScan: vi.fn<() => Promise<ScanRow>>(),
  publishSharedCheckRun: vi.fn<() => Promise<void>>(),
  runBusinessResearch: vi.fn<() => Promise<void>>(),
  runChecks:
    vi.fn<() => Promise<Record<string, { type: "check"; value: boolean }>>>(),
  updateScan:
    vi.fn<(scanId: string, patch: Partial<ScanRow>) => Promise<ScanRow>>(),
}));

vi.mock(import("./data"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getBusiness,
    insertScan,
    updateScan,
  };
});

vi.mock(import("./check-snapshots"), () => ({
  publishSharedCheckRun,
}));

vi.mock(import("./research-runner"), () => ({
  runBusinessResearch,
}));

vi.mock(import("@listwell/audit-engine"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runChecks,
  };
});

const business = businessFromCreateRequest({
  category: "food",
  id: "biz-scan",
  locations: [{ name: "King Street Cafe" }],
  name: "King Street Cafe",
});

const runningScan = scanRowSchema.parse({
  businessId: business.id,
  createdAt: "2026-10-01T00:00:00.000Z",
  error: null,
  errorCount: 0,
  failCount: 0,
  finishedAt: null,
  id: "scan-1",
  passCount: 0,
  results: null,
  score: null,
  startedAt: "2026-10-01T00:00:00.000Z",
  status: "running",
  trigger: "baseline",
});

describe(runScanForBusiness, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusiness.mockResolvedValue(business);
    insertScan.mockResolvedValue(runningScan);
    updateScan.mockImplementation((_id, patch) =>
      Promise.resolve(
        scanRowSchema.parse({
          ...runningScan,
          finishedAt: "2026-10-01T00:01:00.000Z",
          ...patch,
        })
      )
    );
    publishSharedCheckRun.mockResolvedValue();
    runChecks.mockResolvedValue({
      "google-listing": { type: "check", value: true },
    });
  });

  it("stays complete when research throws", async () => {
    runBusinessResearch.mockRejectedValue(new Error("vendor down"));
    const scan = await runScanForBusiness(business.id, "baseline");
    expect(scan.status).toBe("complete");
    expect(runBusinessResearch).toHaveBeenCalledOnce();
  });

  it("does not run research on a rescan", async () => {
    runBusinessResearch.mockResolvedValue();
    const scan = await runScanForBusiness(business.id, "rescan");
    expect(scan.status).toBe("complete");
    expect(runBusinessResearch).not.toHaveBeenCalled();
  });
});
