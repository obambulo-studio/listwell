import { v } from "convex/values";

import {
  analyticsEntitlementKindSchema,
  analyticsEventDecision,
  analyticsMonthlyAllowance,
  highestAnalyticsEntitlementKind,
} from "../lib/analytics-pricing";
import type { AnalyticsEntitlementKind } from "../lib/analytics-pricing";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { analyticsMonthUtc } from "./lib/analyticsMonth";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { requireInternalSecret } from "./lib/internal";

const isAnalyticsKind = (kind: string): kind is AnalyticsEntitlementKind =>
  analyticsEntitlementKindSchema.safeParse(kind).success;

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

const siteCountsTowardAccount = (site: { enabled?: boolean } | null): boolean =>
  site !== null && site.enabled !== false;

const accountAnalyticsKind = async (
  ctx: QueryCtx | MutationCtx,
  userId: string
): Promise<AnalyticsEntitlementKind | null> => {
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const kinds: AnalyticsEntitlementKind[] = [];
  for (const row of rows) {
    if (row.status === "active" && isAnalyticsKind(row.kind)) {
      kinds.push(row.kind);
    }
  }
  return highestAnalyticsEntitlementKind(kinds);
};

const accountEventCount = async (
  ctx: QueryCtx | MutationCtx,
  userId: string,
  month: string
): Promise<number> => {
  const row = await ctx.db
    .query("webAnalyticsUsage")
    .withIndex("by_userId_and_month", (q) =>
      q.eq("userId", userId).eq("month", month)
    )
    .unique();
  return row?.eventCount ?? 0;
};

const siteForBusiness = async (
  ctx: QueryCtx | MutationCtx,
  businessExternalId: string
) =>
  await ctx.db
    .query("webAnalyticsSites")
    .withIndex("by_businessExternalId_and_ingestKey", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .first();

const accountAnalyticsValidator = v.object({
  activeKind: v.union(
    v.literal("analytics_10k"),
    v.literal("analytics_100k"),
    v.literal("analytics_1m"),
    v.null()
  ),
  allowance: v.number(),
  enabled: v.boolean(),
  eventsThisMonth: v.number(),
  ingestKey: v.union(v.string(), v.null()),
  month: v.string(),
});

const accountStateForOwner = async (
  ctx: QueryCtx | MutationCtx,
  businessExternalId: string,
  userId: string
) => {
  const month = analyticsMonthUtc();
  const [site, kind, eventsThisMonth] = await Promise.all([
    siteForBusiness(ctx, businessExternalId),
    accountAnalyticsKind(ctx, userId),
    accountEventCount(ctx, userId, month),
  ]);
  return {
    activeKind: kind,
    allowance: analyticsMonthlyAllowance(kind),
    enabled: siteCountsTowardAccount(site),
    eventsThisMonth,
    ingestKey: site?.ingestKey ?? null,
    month,
  };
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

    const business = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", args.businessExternalId)
      )
      .unique();
    const userId = business?.userId;
    if (!userId) {
      return { accepted: false as const, reason: "disabled" as const };
    }

    const month = analyticsMonthUtc();
    const [kind, eventCount] = await Promise.all([
      accountAnalyticsKind(ctx, userId),
      accountEventCount(ctx, userId, month),
    ]);
    const decision = analyticsEventDecision({
      enabled: siteCountsTowardAccount(site),
      eventCount,
      kind,
    });
    if (decision === "disabled") {
      return { accepted: false as const, reason: "disabled" as const };
    }
    if (decision === "over_quota") {
      return { accepted: false as const, reason: "over_quota" as const };
    }

    const existing = await ctx.db
      .query("webAnalyticsUsage")
      .withIndex("by_userId_and_month", (q) =>
        q.eq("userId", userId).eq("month", month)
      )
      .unique();
    const timestamp = nowIso();
    await (existing
      ? ctx.db.patch("webAnalyticsUsage", existing._id, {
          eventCount: existing.eventCount + 1,
          updatedAt: timestamp,
        })
      : ctx.db.insert("webAnalyticsUsage", {
          eventCount: 1,
          month,
          updatedAt: timestamp,
          userId,
        }));

    return { accepted: true as const, reason: null };
  },
  returns: v.object({
    accepted: v.boolean(),
    reason: v.union(
      v.literal("invalid_key"),
      v.literal("disabled"),
      v.literal("over_quota"),
      v.null()
    ),
  }),
});

export const getUsageForMonth = query({
  args: {
    month: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    return await accountEventCount(ctx, args.userId, args.month);
  },
  returns: v.number(),
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
    return await accountStateForOwner(
      ctx,
      args.businessExternalId,
      ctx.user._id
    );
  },
  returns: v.union(accountAnalyticsValidator, v.null()),
});

export const setSiteEnabled = authedMutation({
  args: {
    businessExternalId: v.string(),
    enabled: v.boolean(),
  },
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

    const existing = await siteForBusiness(ctx, args.businessExternalId);
    const timestamp = nowIso();
    if (existing) {
      await ctx.db.patch("webAnalyticsSites", existing._id, {
        enabled: args.enabled,
        updatedAt: timestamp,
      });
    } else if (args.enabled) {
      await ctx.db.insert("webAnalyticsSites", {
        businessExternalId: args.businessExternalId,
        createdAt: timestamp,
        enabled: true,
        ingestKey: randomIngestKey(),
        updatedAt: timestamp,
      });
    }

    return await accountStateForOwner(
      ctx,
      args.businessExternalId,
      ctx.user._id
    );
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
    const existing = await siteForBusiness(ctx, args.businessExternalId);
    const timestamp = nowIso();
    if (existing) {
      await ctx.db.patch("webAnalyticsSites", existing._id, {
        enabled: true,
        updatedAt: timestamp,
      });
      return existing.ingestKey;
    }
    const ingestKey = randomIngestKey();
    await ctx.db.insert("webAnalyticsSites", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      enabled: true,
      ingestKey,
      updatedAt: timestamp,
    });
    return ingestKey;
  },
  returns: v.string(),
});
