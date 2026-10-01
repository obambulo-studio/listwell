import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireInternalSecret } from "./lib/internal";
import { RUNNING_CLAIM_WINDOW_MS } from "./lib/scanFreshness";
import {
  decideSpend,
  entitlementAllowsResearch,
  payloadByteLength,
  SEO_PAYLOAD_MAX_BYTES,
} from "./lib/seo";
import {
  seoCacheStatusValidator,
  seoObservationKindValidator,
  seoObservationStatusValidator,
  seoSkipReasonValidator,
} from "./lib/validators";

const RECENT_CACHE_LIMIT = 4;
const PERIOD_OBSERVATION_LIMIT = 200;
const KIND_OBSERVATION_LIMIT = 36;

const nowIso = (): string => new Date().toISOString();

const requireMicros = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number of micros`);
  }
};

const requirePayloadSize = (payloadJson: string | undefined): void => {
  if (payloadJson && payloadByteLength(payloadJson) > SEO_PAYLOAD_MAX_BYTES) {
    throw new Error("SEO payload is too large");
  }
};

const spendRefusalValidator = v.union(
  v.literal("allowance"),
  v.literal("ceiling"),
  v.literal("not_entitled")
);

const spendReservationValidator = v.union(
  v.object({ ok: v.literal(true), reservedUsdMicros: v.number() }),
  v.object({ ok: v.literal(false), reason: spendRefusalValidator })
);

type SpendReservation =
  | { ok: true; reservedUsdMicros: number }
  | { ok: false; reason: "allowance" | "ceiling" | "not_entitled" };

const findBudget = (
  ctx: Pick<QueryCtx, "db">,
  businessExternalId: string,
  periodStart: string
) =>
  ctx.db
    .query("seoBudgets")
    .withIndex("by_businessExternalId_and_periodStart", (q) =>
      q
        .eq("businessExternalId", businessExternalId)
        .eq("periodStart", periodStart)
    )
    .unique();

const findMonthSpend = (ctx: Pick<QueryCtx, "db">, month: string) =>
  ctx.db
    .query("seoSpend")
    .withIndex("by_month", (q) => q.eq("month", month))
    .unique();

const addBudgetSpend = async (
  ctx: MutationCtx,
  input: {
    businessExternalId: string;
    capUsdMicros: number;
    deltaUsdMicros: number;
    periodStart: string;
  }
): Promise<void> => {
  const timestamp = nowIso();
  const budget = await findBudget(
    ctx,
    input.businessExternalId,
    input.periodStart
  );
  if (budget) {
    await ctx.db.patch("seoBudgets", budget._id, {
      spentUsdMicros: Math.max(0, budget.spentUsdMicros + input.deltaUsdMicros),
      updatedAt: timestamp,
    });
    return;
  }
  await ctx.db.insert("seoBudgets", {
    businessExternalId: input.businessExternalId,
    capUsdMicros: input.capUsdMicros,
    periodStart: input.periodStart,
    spentUsdMicros: Math.max(0, input.deltaUsdMicros),
    updatedAt: timestamp,
  });
};

const addMonthSpend = async (
  ctx: MutationCtx,
  month: string,
  deltaUsdMicros: number
): Promise<void> => {
  const timestamp = nowIso();
  const spend = await findMonthSpend(ctx, month);
  if (spend) {
    await ctx.db.patch("seoSpend", spend._id, {
      spentUsdMicros: Math.max(0, spend.spentUsdMicros + deltaUsdMicros),
      updatedAt: timestamp,
    });
    return;
  }
  await ctx.db.insert("seoSpend", {
    month,
    spentUsdMicros: Math.max(0, deltaUsdMicros),
    updatedAt: timestamp,
  });
};

/**
 * Holds the estimate against the business cap and the global ceiling before a
 * DataForSEO call. Only an active `report_monthly` entitlement may spend.
 */
export const reserveSpend = mutation({
  args: {
    businessExternalId: v.string(),
    capUsdMicros: v.number(),
    ceilingUsdMicros: v.number(),
    estimateUsdMicros: v.number(),
    month: v.string(),
    periodStart: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args): Promise<SpendReservation> => {
    requireInternalSecret(args.secret);
    requireMicros(args.capUsdMicros, "capUsdMicros");
    requireMicros(args.ceilingUsdMicros, "ceilingUsdMicros");
    requireMicros(args.estimateUsdMicros, "estimateUsdMicros");

    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    if (!entitlementAllowsResearch(entitlements)) {
      return { ok: false, reason: "not_entitled" };
    }

    const [budget, spend] = await Promise.all([
      findBudget(ctx, args.businessExternalId, args.periodStart),
      findMonthSpend(ctx, args.month),
    ]);
    const capUsdMicros = budget?.capUsdMicros ?? args.capUsdMicros;
    const decision = decideSpend({
      capUsdMicros,
      ceilingUsdMicros: args.ceilingUsdMicros,
      estimateUsdMicros: args.estimateUsdMicros,
      monthSpentUsdMicros: spend?.spentUsdMicros ?? 0,
      spentUsdMicros: budget?.spentUsdMicros ?? 0,
    });
    if (!decision.ok) {
      return { ok: false, reason: decision.reason };
    }

    await addBudgetSpend(ctx, {
      businessExternalId: args.businessExternalId,
      capUsdMicros,
      deltaUsdMicros: args.estimateUsdMicros,
      periodStart: args.periodStart,
    });
    await addMonthSpend(ctx, args.month, args.estimateUsdMicros);
    return { ok: true, reservedUsdMicros: args.estimateUsdMicros };
  },
  returns: spendReservationValidator,
});

/** Replaces a reservation with the `cost` DataForSEO returned (0 when the call failed). */
export const settleSpend = mutation({
  args: {
    actualUsdMicros: v.number(),
    businessExternalId: v.string(),
    capUsdMicros: v.number(),
    month: v.string(),
    periodStart: v.string(),
    reservedUsdMicros: v.number(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    requireMicros(args.actualUsdMicros, "actualUsdMicros");
    requireMicros(args.reservedUsdMicros, "reservedUsdMicros");
    const delta = args.actualUsdMicros - args.reservedUsdMicros;
    if (delta === 0) {
      return null;
    }
    await addBudgetSpend(ctx, {
      businessExternalId: args.businessExternalId,
      capUsdMicros: args.capUsdMicros,
      deltaUsdMicros: delta,
      periodStart: args.periodStart,
    });
    await addMonthSpend(ctx, args.month, delta);
    return null;
  },
  returns: v.null(),
});

export const getBudget = query({
  args: {
    businessExternalId: v.string(),
    periodStart: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const budget = await findBudget(
      ctx,
      args.businessExternalId,
      args.periodStart
    );
    if (!budget) {
      return null;
    }
    return {
      capUsdMicros: budget.capUsdMicros,
      periodStart: budget.periodStart,
      spentUsdMicros: budget.spentUsdMicros,
      updatedAt: budget.updatedAt,
    };
  },
  returns: v.union(
    v.object({
      capUsdMicros: v.number(),
      periodStart: v.string(),
      spentUsdMicros: v.number(),
      updatedAt: v.string(),
    }),
    v.null()
  ),
});

export const getMonthSpend = query({
  args: { month: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const spend = await findMonthSpend(ctx, args.month);
    if (!spend) {
      return null;
    }
    return {
      month: spend.month,
      spentUsdMicros: spend.spentUsdMicros,
      updatedAt: spend.updatedAt,
    };
  },
  returns: v.union(
    v.object({
      month: v.string(),
      spentUsdMicros: v.number(),
      updatedAt: v.string(),
    }),
    v.null()
  ),
});

const observationRowValidator = v.object({
  businessExternalId: v.string(),
  costUsdMicros: v.number(),
  id: v.string(),
  kind: seoObservationKindValidator,
  observedAt: v.string(),
  payloadJson: v.union(v.string(), v.null()),
  periodStart: v.string(),
  phraseId: v.union(v.string(), v.null()),
  pinId: v.union(v.string(), v.null()),
  skipReason: v.union(seoSkipReasonValidator, v.null()),
  status: seoObservationStatusValidator,
});

interface ObservationDoc {
  _id: string;
  businessExternalId: string;
  costUsdMicros: number;
  kind: (typeof observationRowValidator.type)["kind"];
  observedAt: string;
  payloadJson?: string;
  periodStart: string;
  phraseId?: string;
  pinId?: string;
  skipReason?: (typeof observationRowValidator.type)["skipReason"];
  status: (typeof observationRowValidator.type)["status"];
}

const toObservationRow = (doc: ObservationDoc) => ({
  businessExternalId: doc.businessExternalId,
  costUsdMicros: doc.costUsdMicros,
  id: doc._id,
  kind: doc.kind,
  observedAt: doc.observedAt,
  payloadJson: doc.payloadJson ?? null,
  periodStart: doc.periodStart,
  phraseId: doc.phraseId ?? null,
  pinId: doc.pinId ?? null,
  skipReason: doc.skipReason ?? null,
  status: doc.status,
});

export const recordObservation = mutation({
  args: {
    businessExternalId: v.string(),
    costUsdMicros: v.number(),
    kind: seoObservationKindValidator,
    observedAt: v.optional(v.string()),
    payloadJson: v.optional(v.string()),
    periodStart: v.string(),
    phraseId: v.optional(v.string()),
    pinId: v.optional(v.string()),
    secret: v.string(),
    skipReason: v.optional(seoSkipReasonValidator),
    status: seoObservationStatusValidator,
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    requireMicros(args.costUsdMicros, "costUsdMicros");
    requirePayloadSize(args.payloadJson);
    const { secret: _secret, ...fields } = args;
    const id = await ctx.db.insert("seoObservations", {
      ...fields,
      observedAt: args.observedAt ?? nowIso(),
    });
    return id;
  },
  returns: v.id("seoObservations"),
});

export const updateObservation = mutation({
  args: {
    costUsdMicros: v.optional(v.number()),
    observationId: v.string(),
    payloadJson: v.optional(v.string()),
    secret: v.string(),
    skipReason: v.optional(seoSkipReasonValidator),
    status: seoObservationStatusValidator,
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    if (args.costUsdMicros !== undefined) {
      requireMicros(args.costUsdMicros, "costUsdMicros");
    }
    requirePayloadSize(args.payloadJson);
    const id = ctx.db.normalizeId("seoObservations", args.observationId);
    if (!id) {
      return null;
    }
    const existing = await ctx.db.get("seoObservations", id);
    if (!existing) {
      return null;
    }
    await ctx.db.patch("seoObservations", id, {
      costUsdMicros: args.costUsdMicros ?? existing.costUsdMicros,
      observedAt: nowIso(),
      payloadJson: args.payloadJson ?? existing.payloadJson,
      skipReason: args.skipReason,
      status: args.status,
    });
    const updated = await ctx.db.get("seoObservations", id);
    return updated ? toObservationRow(updated) : null;
  },
  returns: v.union(observationRowValidator, v.null()),
});

export const listObservationsForPeriod = query({
  args: {
    businessExternalId: v.string(),
    periodStart: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("seoObservations")
      .withIndex("by_business_and_period", (q) =>
        q
          .eq("businessExternalId", args.businessExternalId)
          .eq("periodStart", args.periodStart)
      )
      .take(PERIOD_OBSERVATION_LIMIT);
    return rows.map((row) => toObservationRow(row));
  },
  returns: v.array(observationRowValidator),
});

/** Newest first. `period_summary` rows feed the charts and the monthly email. */
export const listObservationsByKind = query({
  args: {
    businessExternalId: v.string(),
    kind: seoObservationKindValidator,
    limit: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit ?? KIND_OBSERVATION_LIMIT)),
      KIND_OBSERVATION_LIMIT
    );
    const rows = await ctx.db
      .query("seoObservations")
      .withIndex("by_business_and_kind", (q) =>
        q
          .eq("businessExternalId", args.businessExternalId)
          .eq("kind", args.kind)
      )
      .order("desc")
      .take(limit);
    return rows.map((row) => toObservationRow(row));
  },
  returns: v.array(observationRowValidator),
});

const cacheEntryValidator = v.object({
  cacheId: v.string(),
  costUsdMicros: v.number(),
  finishedAt: v.union(v.string(), v.null()),
  payloadJson: v.union(v.string(), v.null()),
  startedAt: v.string(),
  status: seoCacheStatusValidator,
});

interface CacheDoc {
  _id: string;
  costUsdMicros: number;
  finishedAt?: string;
  payloadJson?: string;
  startedAt: string;
  status: (typeof cacheEntryValidator.type)["status"];
}

const toCacheEntry = (doc: CacheDoc) => ({
  cacheId: doc._id,
  costUsdMicros: doc.costUsdMicros,
  finishedAt: doc.finishedAt ?? null,
  payloadJson: doc.payloadJson ?? null,
  startedAt: doc.startedAt,
  status: doc.status,
});

interface CacheClaim {
  action: "reuse" | "wait" | "run";
  entry: ReturnType<typeof toCacheEntry>;
}

const isLiveRunningClaim = (doc: CacheDoc, now: number): boolean => {
  if (doc.status !== "running") {
    return false;
  }
  const started = Date.parse(doc.startedAt);
  return !Number.isNaN(started) && now - started < RUNNING_CLAIM_WINDOW_MS;
};

const recentCacheRows = (ctx: Pick<QueryCtx, "db">, fingerprint: string) =>
  ctx.db
    .query("seoCache")
    .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
    .order("desc")
    .take(RECENT_CACHE_LIMIT);

/**
 * Fingerprints carry the period, so any complete row is reusable. A fresh
 * running claim makes the caller wait instead of paying twice.
 */
export const claimCache = mutation({
  args: { fingerprint: v.string(), secret: v.string() },
  handler: async (ctx, args): Promise<CacheClaim> => {
    requireInternalSecret(args.secret);
    const rows = await recentCacheRows(ctx, args.fingerprint);
    const complete = rows.find((row) => row.status === "complete");
    if (complete) {
      return { action: "reuse", entry: toCacheEntry(complete) };
    }
    const now = Date.now();
    const running = rows.find((row) => isLiveRunningClaim(row, now));
    if (running) {
      return { action: "wait", entry: toCacheEntry(running) };
    }
    const id = await ctx.db.insert("seoCache", {
      costUsdMicros: 0,
      fingerprint: args.fingerprint,
      startedAt: new Date(now).toISOString(),
      status: "running",
    });
    const inserted = await ctx.db.get("seoCache", id);
    if (!inserted) {
      throw new Error("Failed to claim SEO cache entry");
    }
    return { action: "run", entry: toCacheEntry(inserted) };
  },
  returns: v.object({
    action: v.union(v.literal("reuse"), v.literal("wait"), v.literal("run")),
    entry: cacheEntryValidator,
  }),
});

export const getCache = query({
  args: { cacheId: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const id = ctx.db.normalizeId("seoCache", args.cacheId);
    if (!id) {
      return null;
    }
    const doc = await ctx.db.get("seoCache", id);
    return doc ? toCacheEntry(doc) : null;
  },
  returns: v.union(cacheEntryValidator, v.null()),
});

export const latestCompleteCache = query({
  args: { fingerprint: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await recentCacheRows(ctx, args.fingerprint);
    const complete = rows.find((row) => row.status === "complete");
    return complete ? toCacheEntry(complete) : null;
  },
  returns: v.union(cacheEntryValidator, v.null()),
});

export const finishCache = mutation({
  args: {
    cacheId: v.string(),
    costUsdMicros: v.number(),
    payloadJson: v.optional(v.string()),
    secret: v.string(),
    status: v.union(v.literal("complete"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    requireMicros(args.costUsdMicros, "costUsdMicros");
    requirePayloadSize(args.payloadJson);
    const id = ctx.db.normalizeId("seoCache", args.cacheId);
    if (!id) {
      return null;
    }
    await ctx.db.patch("seoCache", id, {
      costUsdMicros: args.costUsdMicros,
      finishedAt: nowIso(),
      payloadJson: args.payloadJson,
      status: args.status,
    });
    return null;
  },
  returns: v.null(),
});

/** Queued results arrive by postback, so they are published without a claim. */
export const publishCache = mutation({
  args: {
    costUsdMicros: v.number(),
    fingerprint: v.string(),
    payloadJson: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    requireMicros(args.costUsdMicros, "costUsdMicros");
    requirePayloadSize(args.payloadJson);
    const timestamp = nowIso();
    await ctx.db.insert("seoCache", {
      costUsdMicros: args.costUsdMicros,
      fingerprint: args.fingerprint,
      finishedAt: timestamp,
      payloadJson: args.payloadJson,
      startedAt: timestamp,
      status: "complete",
    });
    return null;
  },
  returns: v.null(),
});
