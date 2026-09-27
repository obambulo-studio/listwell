import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDueScans } from "./scans";
import type { ScanRow } from "./schema";

const { listDueMonthlyEntitlements, runReservedMonthlyScan } = vi.hoisted(() => ({
  listDueMonthlyEntitlements:
    vi.fn<
      (
        now: Date,
        limit: number
      ) => Promise<
        { businessId: string; id: string; nextScanAt: string | null }[]
      >
    >(),
  runReservedMonthlyScan:
    vi.fn<
      () => Promise<
        | { ok: true; skipped: true }
        | { ok: true; skipped: false; scan: ScanRow }
        | { ok: false; skipped: false; scan: ScanRow | null; error: string }
      >
    >(),
}));

vi.mock(import("./scheduled-scan-run"), () => ({
  runReservedMonthlyScan,
}));

vi.mock(import("./data"), () => ({
  listDueMonthlyEntitlements,
}));

describe(runDueScans, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runReservedMonthlyScan.mockResolvedValue({
      ok: true,
      scan: {
        businessId: "biz-scan-due",
        createdAt: "2026-09-02T02:00:00.000Z",
        error: null,
        errorCount: 0,
        failCount: 0,
        finishedAt: "2026-09-02T02:05:00.000Z",
        id: "scan-1",
        passCount: 1,
        results: null,
        score: 100,
        startedAt: "2026-09-02T02:00:00.000Z",
        status: "complete",
        trigger: "schedule",
      },
      skipped: false,
    });
  });

  it("runs only due active monthly entitlements and rolls nextScanAt forward", async () => {
    const now = new Date("2026-09-02T02:00:00.000Z");
    listDueMonthlyEntitlements.mockResolvedValue([
      {
        businessId: "biz-scan-due",
        id: "ent-1",
        nextScanAt: now.toISOString(),
      },
    ]);

    const result = await runDueScans({ limit: 5, now });
    expect(result.ran).toBe(1);
    expect(result.failed).toBe(0);
    expect(runReservedMonthlyScan).toHaveBeenCalledOnce();
  });

  it("continues after a scan error", async () => {
    runReservedMonthlyScan
      .mockResolvedValueOnce({
        error: "scan failed",
        ok: false,
        scan: null,
        skipped: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        scan: {
          businessId: "biz-scan-error-2",
          createdAt: "2026-09-02T03:00:00.000Z",
          error: null,
          errorCount: 0,
          failCount: 1,
          finishedAt: "2026-09-02T03:05:00.000Z",
          id: "scan-2",
          passCount: 1,
          results: null,
          score: 50,
          startedAt: "2026-09-02T03:00:00.000Z",
          status: "complete",
          trigger: "schedule",
        },
        skipped: false,
      });

    const now = new Date("2026-09-02T03:00:00.000Z");
    listDueMonthlyEntitlements.mockResolvedValue([
      {
        businessId: "biz-scan-error-1",
        id: "ent-1",
        nextScanAt: now.toISOString(),
      },
      {
        businessId: "biz-scan-error-2",
        id: "ent-2",
        nextScanAt: now.toISOString(),
      },
    ]);

    const result = await runDueScans({ limit: 5, now });
    expect(result.ran).toBe(2);
    expect(result.failed).toBe(1);
    expect(runReservedMonthlyScan).toHaveBeenCalledTimes(2);
  });
});
