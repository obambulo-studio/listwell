import { afterEach, describe, expect, it, vi } from "vitest";

import {
  keywordMetricsFingerprint,
  organicSerpFingerprint,
  rankGridCellFingerprint,
  researchBudget,
  runQueuedResearchCall,
  runResearchCall,
} from "./seo-budget";
import type { CacheEntry, ResearchStore } from "./seo-budget";
import { decideSpend } from "./seo-schema";

const budgetKey = (businessExternalId: string, periodStart: string) =>
  `${businessExternalId}:${periodStart}`;

const memoryStore = (entitled: readonly string[]) => {
  const budgets = new Map<string, number>();
  const months = new Map<string, number>();
  const cache: (CacheEntry & { fingerprint: string })[] = [];
  const addSpend = (
    input: { businessExternalId: string; month: string; periodStart: string },
    delta: number
  ) => {
    const key = budgetKey(input.businessExternalId, input.periodStart);
    budgets.set(key, Math.max(0, (budgets.get(key) ?? 0) + delta));
    months.set(
      input.month,
      Math.max(0, (months.get(input.month) ?? 0) + delta)
    );
  };
  const store: ResearchStore = {
    claimCache: (fingerprint) => {
      const rows = cache.filter((row) => row.fingerprint === fingerprint);
      const complete = rows.find((row) => row.status === "complete");
      if (complete) {
        return Promise.resolve({ action: "reuse", entry: complete });
      }
      const running = rows.find((row) => row.status === "running");
      if (running) {
        return Promise.resolve({ action: "wait", entry: running });
      }
      const entry: CacheEntry & { fingerprint: string } = {
        cacheId: `cache_${cache.length + 1}`,
        costUsdMicros: 0,
        fingerprint,
        finishedAt: null,
        payloadJson: null,
        startedAt: new Date().toISOString(),
        status: "running",
      };
      cache.push(entry);
      return Promise.resolve({ action: "run", entry });
    },
    finishCache: (input) => {
      const row = cache.find((entry) => entry.cacheId === input.cacheId);
      if (row) {
        row.costUsdMicros = input.costUsdMicros;
        row.payloadJson = input.payloadJson ?? null;
        row.status = input.status;
      }
      return Promise.resolve();
    },
    getCache: (cacheId) =>
      Promise.resolve(cache.find((entry) => entry.cacheId === cacheId) ?? null),
    latestCompleteCache: (fingerprint) =>
      Promise.resolve(
        cache.find(
          (entry) =>
            entry.fingerprint === fingerprint && entry.status === "complete"
        ) ?? null
      ),
    publishCache: (input) => {
      cache.push({
        cacheId: `cache_${cache.length + 1}`,
        costUsdMicros: input.costUsdMicros,
        fingerprint: input.fingerprint,
        finishedAt: new Date().toISOString(),
        payloadJson: input.payloadJson,
        startedAt: new Date().toISOString(),
        status: "complete",
      });
      return Promise.resolve();
    },
    reserveSpend: (input) => {
      if (!entitled.includes(input.businessExternalId)) {
        return Promise.resolve({ ok: false, reason: "not_entitled" });
      }
      const decision = decideSpend({
        capUsdMicros: input.capUsdMicros,
        ceilingUsdMicros: input.ceilingUsdMicros,
        estimateUsdMicros: input.estimateUsdMicros,
        monthSpentUsdMicros: months.get(input.month) ?? 0,
        spentUsdMicros:
          budgets.get(budgetKey(input.businessExternalId, input.periodStart)) ??
          0,
      });
      if (!decision.ok) {
        return Promise.resolve(decision);
      }
      addSpend(input, input.estimateUsdMicros);
      return Promise.resolve({
        ok: true,
        reservedUsdMicros: input.estimateUsdMicros,
      });
    },
    settleSpend: (input) => {
      addSpend(input, input.actualUsdMicros - input.reservedUsdMicros);
      return Promise.resolve();
    },
  };
  return {
    budgetSpent: (businessExternalId: string, periodStart: string) =>
      budgets.get(budgetKey(businessExternalId, periodStart)) ?? 0,
    monthSpent: (month: string) => months.get(month) ?? 0,
    seedSpend: addSpend,
    store,
  };
};

type TextCall = () => Promise<{ costUsdMicros: number; value: string }>;
type QueuedPost = () => Promise<{
  costUsdMicros: number;
  taskId: string;
  token: string;
}>;

const now = new Date("2026-10-05T00:00:00.000Z");

const gridKey = (latitude: number) =>
  rankGridCellFingerprint({
    cellIndex: 4,
    center: { latitude, longitude: 144.9631 },
    month: "2026-10",
    phrase: "Cafe",
  });

const budgetFor = (businessExternalId: string, monthlyCeilingUsd = 50) =>
  researchBudget({
    businessExternalId,
    monthlyCeilingUsd,
    nextScanAt: "2026-10-31T00:00:00.000Z",
    now,
  });

const textCache = (fingerprint: string) => ({
  fingerprint,
  parse: (payloadJson: string) => String(JSON.parse(payloadJson)),
  serialize: (value: string) => JSON.stringify(value),
});

describe("research budget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives the period, month, cap, and ceiling", () => {
    expect(budgetFor("biz_a")).toStrictEqual({
      businessExternalId: "biz_a",
      capUsdMicros: 750_000,
      ceilingUsdMicros: 50_000_000,
      month: "2026-10",
      periodStart: "2026-10-01T00:00:00.000Z",
    });
  });

  it("stops before a call that would pass the business cap", async () => {
    const memory = memoryStore(["biz_a"]);
    const budget = budgetFor("biz_a");
    memory.seedSpend(budget, 740_000);
    const call = vi.fn<TextCall>(() =>
      Promise.resolve({ costUsdMicros: 20_000, value: "result" })
    );
    const outcome = await runResearchCall(
      { budget, call, estimateUsdMicros: 20_000 },
      { store: memory.store }
    );
    expect(outcome).toStrictEqual({ reason: "allowance", status: "skipped" });
    expect(call).not.toHaveBeenCalled();
    expect(memory.budgetSpent("biz_a", budget.periodStart)).toBe(740_000);
  });

  it("skips research at the global ceiling and logs an error", async () => {
    const memory = memoryStore(["biz_a", "biz_b"]);
    memory.seedSpend(budgetFor("biz_b"), 9_990_000);
    const error = vi.spyOn(console, "error").mockReturnValue();
    const call = vi.fn<TextCall>(() =>
      Promise.resolve({ costUsdMicros: 20_000, value: "result" })
    );
    const outcome = await runResearchCall(
      { budget: budgetFor("biz_a", 10), call, estimateUsdMicros: 20_000 },
      { store: memory.store }
    );
    expect(outcome).toStrictEqual({ reason: "ceiling", status: "skipped" });
    expect(call).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it("treats an unset ceiling as zero", async () => {
    const memory = memoryStore(["biz_a"]);
    vi.spyOn(console, "error").mockReturnValue();
    const budget = researchBudget({
      businessExternalId: "biz_a",
      monthlyCeilingUsd: undefined,
      nextScanAt: "2026-10-31T00:00:00.000Z",
      now,
    });
    const outcome = await runResearchCall(
      {
        budget,
        call: () => Promise.resolve({ costUsdMicros: 1, value: "x" }),
        estimateUsdMicros: 1,
      },
      { store: memory.store }
    );
    expect(outcome).toStrictEqual({ reason: "ceiling", status: "skipped" });
  });

  it("refuses a business without an active monthly report", async () => {
    const memory = memoryStore([]);
    const call = vi.fn<TextCall>(() =>
      Promise.resolve({ costUsdMicros: 0, value: "" })
    );
    const outcome = await runResearchCall(
      { budget: budgetFor("biz_a"), call, estimateUsdMicros: 0 },
      { store: memory.store }
    );
    expect(outcome).toStrictEqual({
      reason: "not_entitled",
      status: "skipped",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("settles the reservation to the recorded cost", async () => {
    const memory = memoryStore(["biz_a"]);
    const budget = budgetFor("biz_a");
    const outcome = await runResearchCall(
      {
        budget,
        call: () => Promise.resolve({ costUsdMicros: 1500, value: "ok" }),
        estimateUsdMicros: 6000,
      },
      { store: memory.store }
    );
    expect(outcome).toMatchObject({ costUsdMicros: 1500, status: "complete" });
    expect(memory.budgetSpent("biz_a", budget.periodStart)).toBe(1500);
    expect(memory.monthSpent("2026-10")).toBe(1500);
  });

  it("returns the reservation when the call fails", async () => {
    const memory = memoryStore(["biz_a"]);
    const budget = budgetFor("biz_a");
    const outcome = await runResearchCall(
      {
        budget,
        cache: textCache("seo:test"),
        call: () => Promise.reject(new Error("vendor down")),
        estimateUsdMicros: 6000,
      },
      { store: memory.store }
    );
    expect(outcome).toMatchObject({ costUsdMicros: 0, status: "error" });
    expect(memory.budgetSpent("biz_a", budget.periodStart)).toBe(0);
    const retry = await memory.store.claimCache("seo:test");
    expect(retry.action).toBe("run");
  });
});

describe("period cache", () => {
  it("charges the second business with the same phrase and location nothing", async () => {
    const memory = memoryStore(["biz_a", "biz_b"]);
    const fingerprint = organicSerpFingerprint({
      locationCode: 2036,
      month: "2026-10",
      phrase: "Cafe Fitzroy",
    });
    const call = vi.fn<TextCall>(() =>
      Promise.resolve({ costUsdMicros: 6000, value: "serp" })
    );

    const first = await runResearchCall(
      {
        budget: budgetFor("biz_a"),
        cache: textCache(fingerprint),
        call,
        estimateUsdMicros: 6000,
      },
      { store: memory.store }
    );
    // Second call must see the cache row written by the first.
    // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
    const second = await runResearchCall(
      {
        budget: budgetFor("biz_b"),
        cache: textCache(
          organicSerpFingerprint({
            locationCode: 2036,
            month: "2026-10",
            phrase: "  cafe fitzroy",
          })
        ),
        call,
        estimateUsdMicros: 6000,
      },
      { store: memory.store }
    );

    expect(first).toMatchObject({ costUsdMicros: 6000, fromCache: false });
    expect(second).toStrictEqual({
      costUsdMicros: 0,
      fromCache: true,
      status: "complete",
      value: "serp",
    });
    expect(call).toHaveBeenCalledOnce();
    expect(memory.budgetSpent("biz_b", "2026-10-01T00:00:00.000Z")).toBe(0);
  });

  it("reuses a queued result published by the postback", async () => {
    const memory = memoryStore(["biz_a"]);
    const fingerprint = keywordMetricsFingerprint({
      locationCode: 2036,
      month: "2026-10",
      phrases: ["b", "a"],
    });
    await memory.store.publishCache({
      costUsdMicros: 600,
      fingerprint,
      payloadJson: JSON.stringify("rows"),
    });
    const post = vi.fn<QueuedPost>(() =>
      Promise.resolve({ costUsdMicros: 600, taskId: "t", token: "k" })
    );
    const outcome = await runQueuedResearchCall(
      {
        budget: budgetFor("biz_a"),
        cache: textCache(fingerprint),
        estimateUsdMicros: 600,
        post,
      },
      { store: memory.store }
    );
    expect(outcome).toMatchObject({ costUsdMicros: 0, fromCache: true });
    expect(post).not.toHaveBeenCalled();
  });

  it("charges the posting cost for a new queued task", async () => {
    const memory = memoryStore(["biz_a"]);
    const outcome = await runQueuedResearchCall(
      {
        budget: budgetFor("biz_a"),
        estimateUsdMicros: 600,
        post: () =>
          Promise.resolve({ costUsdMicros: 600, taskId: "t", token: "k" }),
      },
      { store: memory.store }
    );
    expect(outcome).toStrictEqual({
      costUsdMicros: 600,
      status: "queued",
      taskId: "t",
      token: "k",
    });
  });

  it("keys the grid by phrase, rounded pin, and cell", () => {
    expect(gridKey(-37.81361)).toBe(gridKey(-37.81364));
    expect(gridKey(-37.8136)).not.toBe(gridKey(-37.8146));
    expect(
      keywordMetricsFingerprint({
        locationCode: 2036,
        month: "2026-10",
        phrases: ["b", "a"],
      })
    ).toBe("seo:keyword_metrics:2026-10:2036:a|b");
  });
});
