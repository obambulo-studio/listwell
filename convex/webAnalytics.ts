import { v } from "convex/values";

import { analyticsMonthUtc } from "./lib/analyticsMonth";
import { authedQuery } from "./lib/customFunctions";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireInternalSecret } from "./lib/internal";

const analyticsEntitlementKinds = [
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
] as const;

type AnalyticsEntitlementKind = (typeof analyticsEntitlementKinds)[number];

const isAnalyticsKind = (
  kind: string
): kind is AnalyticsEntitlementKind =>
  (analyticsEntitlementKinds as readonly string[]).includes(kind);

const nowIso = (): string => new Date().toISOString();

const randomIngestKey = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const activeAnalyticsKind = async (
  ctx: QueryCtx | MutationCtx,
  businessExternalId: string
): Promise<AnalyticsEntitlementKind | null> => {
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();
  const active = rows.find(
    (row) => row.status === "active" && isAnalyticsKind(row.kind)
  );
  return active && isAnalyticsKind(active.kind) ? active.kind : null;
};

export const recordEvent = mutation({
  args: {
    businessExternalId: v.string(),
    ingestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const site = await ctx.db
      .query("webAnalyticsSites")
      .withIndex("by_businessExternalId_and_ingestKey", (q) =>
        q
          .eq("businessExternalId", args.businessExternalId)
          .eq("ingestKey", args.ingestKey)
      )
      .unique();
    if (!site) {
      return { accepted: false as const, reason: "invalid_key" as const };
    }

    const kind = await activeAnalyticsKind(ctx, args.businessExternalId);
    if (!kind) {
      return { accepted: false as const, reason: "not_subscribed" as const };
    }

    const month = analyticsMonthUtc();
    const existing = await ctx.db
      .query("webAnalyticsUsage")
      .withIndex("by_businessExternalId_and_month", (q) =>
        q.eq("businessExternalId", args.businessExternalId).eq("month", month)
      )
      .unique();

    const timestamp = nowIso();
    await (existing
      ? ctx.db.patch("webAnalyticsUsage", existing._id, {
          eventCount: existing.eventCount + 1,
          updatedAt: timestamp,
        })
      : ctx.db.insert("webAnalyticsUsage", {
          businessExternalId: args.businessExternalId,
          eventCount: 1,
          month,
          updatedAt: timestamp,
        }));

    return { accepted: true as const, reason: null };
  },
  returns: v.object({
    accepted: v.boolean(),
    reason: v.union(
      v.literal("invalid_key"),
      v.literal("not_subscribed"),
      v.null()
    ),
  }),
});

export const getUsageForMonth = query({
  args: {
    businessExternalId: v.string(),
    month: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await ctx.db
      .query("webAnalyticsUsage")
      .withIndex("by_businessExternalId_and_month", (q) =>
        q.eq("businessExternalId", args.businessExternalId).eq("month", args.month)
      )
      .unique();
    return row?.eventCount ?? 0;
  },
  returns: v.number(),
});

const accountAnalyticsValidator = v.object({
  activeKind: v.union(
    v.literal("analytics_10k"),
    v.literal("analytics_100k"),
    v.literal("analytics_1m"),
    v.null()
  ),
  eventsThisMonth: v.number(),
  ingestKey: v.union(v.string(), v.null()),
  month: v.string(),
});

export const getAccountState = authedQuery({
  args: { businessExternalId: v.string() },
  handler: async (ctx, args) => {
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", args.businessExternalId)
      )
      .unique();
    if (!business || business.userId !== ctx.user._id) {
      return null;
    }

    const month = analyticsMonthUtc();
    const usage = await ctx.db
      .query("webAnalyticsUsage")
      .withIndex("by_businessExternalId_and_month", (q) =>
        q.eq("businessExternalId", args.businessExternalId).eq("month", month)
      )
      .unique();

    const site = await ctx.db
      .query("webAnalyticsSites")
      .withIndex("by_businessExternalId_and_ingestKey", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .first();

    const kind = await activeAnalyticsKind(ctx, args.businessExternalId);

    return {
      activeKind: kind,
      eventsThisMonth: usage?.eventCount ?? 0,
      ingestKey: site?.ingestKey ?? null,
      month,
    };
  },
  returns: v.union(accountAnalyticsValidator, v.null()),
});

export const provisionAfterGrant = mutation({
  args: {
    businessExternalId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const existing = await ctx.db
      .query("webAnalyticsSites")
      .withIndex("by_businessExternalId_and_ingestKey", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .first();
    if (existing) {
      return existing.ingestKey;
    }
    const timestamp = nowIso();
    const ingestKey = randomIngestKey();
    await ctx.db.insert("webAnalyticsSites", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      ingestKey,
      updatedAt: timestamp,
    });
    return ingestKey;
  },
  returns: v.string(),
});
