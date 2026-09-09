import type * as AuditEngine from "@listwell/audit-engine";
import { runChecks } from "@listwell/audit-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDueScans } from "./scans";
import type { Business, ScanRow } from "./schema";

const {
  getBusiness,
  insertScan,
  listDueMonthlyEntitlements,
  setNextScanAt,
  updateScan,
} = vi.hoisted(() => ({
  getBusiness: vi.fn<() => Promise<Business | null>>(),
  insertScan:
    vi.fn<
      (input: {
        businessId: string;
        startedAt: string;
        status: ScanRow["status"];
        trigger: ScanRow["trigger"];
      }) => Promise<ScanRow>
    >(),
  listDueMonthlyEntitlements:
    vi.fn<
      (
        now: Date,
        limit: number
      ) => Promise<
        { businessId: string; id: string; nextScanAt: string | null }[]
      >
    >(),
  setNextScanAt: vi.fn<() => Promise<void>>(),
  updateScan:
    vi.fn<(scanId: string, patch: Partial<ScanRow>) => Promise<ScanRow>>(),
}));

vi.mock(import("@listwell/audit-engine"), async (importOriginal) => {
  const original = await importOriginal<typeof AuditEngine>();
  return {
    ...original,
    runChecks: vi.fn<typeof runChecks>(),
  };
});

vi.mock(import("./audit-env"), () => ({
  getAuditEngineEnv: vi.fn<() => Promise<Record<string, never>>>(() =>
    Promise.resolve({})
  ),
  getFetchWebsiteOptions: vi.fn<() => Promise<Record<string, never>>>(() =>
    Promise.resolve({})
  ),
  toBusinessSnapshot: vi.fn<(business: Business) => Business>(
    (business) => business
  ),
}));

vi.mock(import("./data"), () => ({
  getBusiness,
  insertScan,
  listDueMonthlyEntitlements,
  setNextScanAt,
  updateScan,
}));

const mockedRunChecks = vi.mocked(runChecks);

describe(runDueScans, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRunChecks.mockResolvedValue({
      website: { label: "Pass", type: "check", value: true },
    });
    getBusiness.mockResolvedValue({
      category: "food",
      createdAt: "2026-01-01T00:00:00.000Z",
      deliverooUrl: null,
      doorDashUrl: null,
      facebookUsername: null,
      id: "biz-scan-due",
      instagramUsername: null,
      linkedinUrl: null,
      locations: [],
      menulogUrl: null,
      name: "Due cafe",
      tiktokUsername: null,
      uberEatsUrl: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      userId: null,
      websiteUrl: null,
      xUsername: null,
      youtubeUrl: null,
    });
    insertScan.mockImplementation((input) =>
      Promise.resolve({
        businessId: input.businessId,
        createdAt: input.startedAt,
        error: null,
        errorCount: 0,
        failCount: 0,
        finishedAt: null,
        id: "scan-1",
        passCount: 1,
        results: null,
        score: 100,
        startedAt: input.startedAt,
        status: "running",
        trigger: input.trigger,
      })
    );
    updateScan.mockImplementation((_scanId, patch) =>
      Promise.resolve({
        businessId: "biz-scan-due",
        createdAt: "2026-09-02T02:00:00.000Z",
        error: patch.error ?? null,
        errorCount: patch.errorCount ?? 0,
        failCount: patch.failCount ?? 0,
        finishedAt: patch.finishedAt ?? null,
        id: "scan-1",
        passCount: patch.passCount ?? 1,
        results: patch.results ?? null,
        score: patch.score ?? 100,
        startedAt: "2026-09-02T02:00:00.000Z",
        status: patch.status ?? "complete",
        trigger: "schedule",
      })
    );
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
    expect(mockedRunChecks).toHaveBeenCalledOnce();
    expect(setNextScanAt).toHaveBeenCalledWith("ent-1", expect.any(String));
  });

  it("continues after a scan error", async () => {
    mockedRunChecks
      .mockRejectedValueOnce(new Error("scan failed"))
      .mockResolvedValueOnce({
        website: { label: "Fail", type: "check", value: false },
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
    expect(mockedRunChecks).toHaveBeenCalledTimes(2);
    expect(setNextScanAt).toHaveBeenCalledTimes(2);
  });
});
