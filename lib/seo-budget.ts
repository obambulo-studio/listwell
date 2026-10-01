import type { FunctionArgs, FunctionReturnType } from "convex/server";

import { api, convexMutation, convexQuery } from "./convex/server";
import {
  normalisePhrase,
  researchPeriodStart,
  roundedCoordinateKey,
  SEO_ALLOWANCE_CAP_USD_MICROS,
  spendMonth,
  usdToMicros,
} from "./seo-schema";
import type { Coordinates } from "./seo-schema";

const CACHE_WAIT_ATTEMPTS = 10;
const CACHE_WAIT_INTERVAL_MS = 3000;

export type CacheClaim = FunctionReturnType<typeof api.seo.claimCache>;
export type CacheEntry = CacheClaim["entry"];
export type SpendReservation = FunctionReturnType<typeof api.seo.reserveSpend>;
export type SpendRefusal = Extract<SpendReservation, { ok: false }>["reason"];
type ReserveInput = Omit<FunctionArgs<typeof api.seo.reserveSpend>, "secret">;
type SettleInput = Omit<FunctionArgs<typeof api.seo.settleSpend>, "secret">;
type FinishCacheInput = Omit<
  FunctionArgs<typeof api.seo.finishCache>,
  "secret"
>;

/** Convex in production; tests pass an in-memory store. */
export interface ResearchStore {
  claimCache: (fingerprint: string) => Promise<CacheClaim>;
  finishCache: (input: FinishCacheInput) => Promise<void>;
  getCache: (cacheId: string) => Promise<CacheEntry | null>;
  latestCompleteCache: (fingerprint: string) => Promise<CacheEntry | null>;
  publishCache: (input: {
    costUsdMicros: number;
    fingerprint: string;
    payloadJson: string;
  }) => Promise<void>;
  reserveSpend: (input: ReserveInput) => Promise<SpendReservation>;
  settleSpend: (input: SettleInput) => Promise<void>;
}

export const convexResearchStore: ResearchStore = {
  claimCache: (fingerprint) =>
    convexMutation(api.seo.claimCache, { fingerprint }),
  finishCache: async (input) => {
    await convexMutation(api.seo.finishCache, input);
  },
  getCache: (cacheId) => convexQuery(api.seo.getCache, { cacheId }),
  latestCompleteCache: (fingerprint) =>
    convexQuery(api.seo.latestCompleteCache, { fingerprint }),
  publishCache: async (input) => {
    await convexMutation(api.seo.publishCache, input);
  },
  reserveSpend: (input) => convexMutation(api.seo.reserveSpend, input),
  settleSpend: async (input) => {
    await convexMutation(api.seo.settleSpend, input);
  },
};

export interface ResearchBudget {
  businessExternalId: string;
  capUsdMicros: number;
  ceilingUsdMicros: number;
  month: string;
  periodStart: string;
}

/** An unset ceiling is zero, so research is skipped until one is configured. */
export const researchBudget = (input: {
  businessExternalId: string;
  capUsdMicros?: number;
  monthlyCeilingUsd: number | undefined;
  nextScanAt: string;
  now?: Date;
}): ResearchBudget => ({
  businessExternalId: input.businessExternalId,
  capUsdMicros: input.capUsdMicros ?? SEO_ALLOWANCE_CAP_USD_MICROS,
  ceilingUsdMicros: usdToMicros(input.monthlyCeilingUsd ?? 0),
  month: spendMonth(input.now ?? new Date()),
  periodStart: researchPeriodStart(input.nextScanAt),
});

/** Cache entries are shared across businesses, so they are bucketed by calendar month. */
export const organicSerpFingerprint = (input: {
  locationCode: number;
  month: string;
  phrase: string;
}): string =>
  `seo:organic_serp:${input.month}:${input.locationCode}:${normalisePhrase(input.phrase)}`;

export const keywordMetricsFingerprint = (input: {
  locationCode: number;
  month: string;
  phrases: readonly string[];
}): string =>
  `seo:keyword_metrics:${input.month}:${input.locationCode}:${input.phrases
    .map((phrase) => normalisePhrase(phrase))
    .toSorted()
    .join("|")}`;

export const rankGridCellFingerprint = (input: {
  cellIndex: number;
  center: Coordinates;
  month: string;
  phrase: string;
}): string =>
  `seo:rank_grid:${input.month}:${normalisePhrase(input.phrase)}:${roundedCoordinateKey(input.center)}:${input.cellIndex}`;

export interface ResearchCache<Value> {
  fingerprint: string;
  parse: (payloadJson: string) => Value;
  serialize: (value: Value) => string;
}

export interface ResearchOptions {
  store?: ResearchStore;
  waitAttempts?: number;
  waitIntervalMs?: number;
}

export type ResearchCallOutcome<Value> =
  | {
      costUsdMicros: number;
      fromCache: boolean;
      status: "complete";
      value: Value;
    }
  | { reason: SpendRefusal; status: "skipped" }
  | { costUsdMicros: number; error: Error; status: "error" };

export type QueuedResearchOutcome<Value> =
  | {
      costUsdMicros: 0;
      fromCache: true;
      status: "complete";
      value: Value;
    }
  | { costUsdMicros: number; status: "queued"; taskId: string; token: string }
  | { reason: SpendRefusal; status: "skipped" }
  | { costUsdMicros: number; error: Error; status: "error" };

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const errorCostUsdMicros = (error: unknown): number => {
  if (typeof error !== "object" || error === null) {
    return 0;
  }
  const cost: unknown = Reflect.get(error, "costUsdMicros");
  return typeof cost === "number" ? cost : 0;
};

const delay = (ms: number): Promise<void> =>
  // eslint-disable-next-line promise/avoid-new -- setTimeout has no promise form
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const reportRefusal = (budget: ResearchBudget, reason: SpendRefusal): void => {
  if (reason === "ceiling") {
    console.error("DataForSEO monthly ceiling reached; research skipped", {
      businessExternalId: budget.businessExternalId,
      ceilingUsdMicros: budget.ceilingUsdMicros,
      month: budget.month,
    });
  }
};

type SpendOutcome<Result> =
  | { costUsdMicros: number; result: Result; status: "complete" }
  | { reason: SpendRefusal; status: "skipped" }
  | { costUsdMicros: number; error: Error; status: "error" };

/**
 * Reserves the estimate, makes the call, then settles to the recorded cost.
 * A refused reservation never reaches the call.
 */
const spendOnce = async <Result extends { costUsdMicros: number }>(
  store: ResearchStore,
  budget: ResearchBudget,
  estimateUsdMicros: number,
  call: () => Promise<Result>
): Promise<SpendOutcome<Result>> => {
  const reservation = await store.reserveSpend({
    ...budget,
    estimateUsdMicros,
  });
  if (!reservation.ok) {
    reportRefusal(budget, reservation.reason);
    return { reason: reservation.reason, status: "skipped" };
  }
  const settle = (actualUsdMicros: number) =>
    store.settleSpend({
      actualUsdMicros,
      businessExternalId: budget.businessExternalId,
      capUsdMicros: budget.capUsdMicros,
      month: budget.month,
      periodStart: budget.periodStart,
      reservedUsdMicros: reservation.reservedUsdMicros,
    });
  try {
    const result = await call();
    await settle(result.costUsdMicros);
    return { costUsdMicros: result.costUsdMicros, result, status: "complete" };
  } catch (error) {
    const costUsdMicros = errorCostUsdMicros(error);
    await settle(costUsdMicros);
    return { costUsdMicros, error: toError(error), status: "error" };
  }
};

const waitForCache = async (
  store: ResearchStore,
  cacheId: string,
  options: ResearchOptions,
  attempt = 0
): Promise<CacheEntry | null> => {
  if (attempt >= (options.waitAttempts ?? CACHE_WAIT_ATTEMPTS)) {
    return null;
  }
  await delay(options.waitIntervalMs ?? CACHE_WAIT_INTERVAL_MS);
  const entry = await store.getCache(cacheId);
  if (entry?.status === "complete") {
    return entry;
  }
  if (entry?.status !== "running") {
    return null;
  }
  return waitForCache(store, cacheId, options, attempt + 1);
};

/** Claims the shared entry, or returns the cached entry if another business already paid. */
const claimOrReuse = async (
  store: ResearchStore,
  fingerprint: string,
  options: ResearchOptions
): Promise<{ cacheId: string | null; reuse: CacheEntry | null }> => {
  const claim = await store.claimCache(fingerprint);
  if (claim.action === "reuse") {
    return { cacheId: null, reuse: claim.entry };
  }
  if (claim.action === "run") {
    return { cacheId: claim.entry.cacheId, reuse: null };
  }
  return {
    cacheId: null,
    reuse: await waitForCache(store, claim.entry.cacheId, options),
  };
};

/**
 * One live DataForSEO call under the business cap and the global ceiling. A
 * period-cache hit returns the shared value and costs this business nothing.
 */
export const runResearchCall = async <Value>(
  input: {
    budget: ResearchBudget;
    cache?: ResearchCache<Value>;
    call: () => Promise<{ costUsdMicros: number; value: Value }>;
    estimateUsdMicros: number;
  },
  options: ResearchOptions = {}
): Promise<ResearchCallOutcome<Value>> => {
  const store = options.store ?? convexResearchStore;
  const claimed = input.cache
    ? await claimOrReuse(store, input.cache.fingerprint, options)
    : { cacheId: null, reuse: null };
  if (input.cache && claimed.reuse?.payloadJson) {
    return {
      costUsdMicros: 0,
      fromCache: true,
      status: "complete",
      value: input.cache.parse(claimed.reuse.payloadJson),
    };
  }

  const outcome = await spendOnce(
    store,
    input.budget,
    input.estimateUsdMicros,
    input.call
  );
  const { cacheId } = claimed;
  if (cacheId && input.cache) {
    await store.finishCache(
      outcome.status === "complete"
        ? {
            cacheId,
            costUsdMicros: outcome.costUsdMicros,
            payloadJson: input.cache.serialize(outcome.result.value),
            status: "complete",
          }
        : { cacheId, costUsdMicros: 0, status: "error" }
    );
  }
  if (outcome.status !== "complete") {
    return outcome;
  }
  return {
    costUsdMicros: outcome.costUsdMicros,
    fromCache: false,
    status: "complete",
    value: outcome.result.value,
  };
};

/**
 * Queued variant for scheduled runs. The result arrives at the postback route,
 * which publishes it to the period cache.
 */
export const runQueuedResearchCall = async <Value>(
  input: {
    budget: ResearchBudget;
    cache?: Pick<ResearchCache<Value>, "fingerprint" | "parse">;
    estimateUsdMicros: number;
    post: () => Promise<{
      costUsdMicros: number;
      taskId: string;
      token: string;
    }>;
  },
  options: ResearchOptions = {}
): Promise<QueuedResearchOutcome<Value>> => {
  const store = options.store ?? convexResearchStore;
  if (input.cache) {
    const cached = await store.latestCompleteCache(input.cache.fingerprint);
    if (cached?.payloadJson) {
      return {
        costUsdMicros: 0,
        fromCache: true,
        status: "complete",
        value: input.cache.parse(cached.payloadJson),
      };
    }
  }
  const outcome = await spendOnce(
    store,
    input.budget,
    input.estimateUsdMicros,
    input.post
  );
  if (outcome.status !== "complete") {
    return outcome;
  }
  return {
    costUsdMicros: outcome.costUsdMicros,
    status: "queued",
    taskId: outcome.result.taskId,
    token: outcome.result.token,
  };
};
