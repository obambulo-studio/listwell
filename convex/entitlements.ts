import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { requireInternalSecret } from "./lib/internal";
import { entitlementKindValidator } from "./lib/validators";

const SCAN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

const nowIso = (): string => new Date().toISOString();

const nextScanAtFrom = (date: Date): string =>
  new Date(date.getTime() + SCAN_INTERVAL_MS).toISOString();

const toEntitlementResponse = (doc: {
  _id: string;
  businessExternalId: string;
  userId?: string;
  kind: "report_once" | "report_monthly";
  status: "active" | "revoked";
  polarOrderId?: string;
  polarSubscriptionId?: string;
  nextScanAt?: string;
  createdAt: string;
  updatedAt: string;
}) => ({
  businessId: doc.businessExternalId,
  createdAt: doc.createdAt,
  id: doc._id,
  kind: doc.kind,
  nextScanAt: doc.nextScanAt ?? null,
  polarOrderId: doc.polarOrderId ?? null,
  polarSubscriptionId: doc.polarSubscriptionId ?? null,
  status: doc.status,
  updatedAt: doc.updatedAt,
  userId: doc.userId ?? null,
});

const claimBusiness = async (
  ctx: { db: MutationCtx["db"] },
  businessExternalId: string,
  userId: string
) => {
  const doc = await ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", businessExternalId))
    .unique();
  if (doc && !doc.userId) {
    await ctx.db.patch("businesses", doc._id, { updatedAt: nowIso(), userId });
  }
};

const maskEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  return `${email.charAt(0)}***@${email.slice(at + 1)}`;
};

const activeOwnerResponse = v.object({
  kind: v.union(entitlementKindValidator, v.null()),
  ownerEmail: v.union(v.string(), v.null()),
  ownerUserId: v.union(v.string(), v.null()),
  unlocked: v.boolean(),
});

export const getActiveOwner = query({
  args: { businessExternalId: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();

    const active = entitlements.find((row) => row.status === "active");
    if (!active) {
      return {
        kind: null,
        ownerEmail: null,
        ownerUserId: null,
        unlocked: false,
      };
    }

    let ownerEmail: string | null = null;
    if (active.userId) {
      const user = await authComponent.getAnyUserById(ctx, active.userId);
      ownerEmail = user?.email ? maskEmail(user.email) : null;
    }

    return {
      kind: active.kind,
      ownerEmail,
      ownerUserId: active.userId ?? null,
      unlocked: true,
    };
  },
  returns: activeOwnerResponse,
});

export const hasActive = query({
  args: { businessExternalId: v.string() },
  handler: async (ctx, args) => {
    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    return entitlements.some((row) => row.status === "active");
  },
});

export const grant = mutation({
  args: {
    businessExternalId: v.string(),
    kind: entitlementKindValidator,
    polarOrderId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    secret: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const timestamp = nowIso();
    const nextScanAt =
      args.kind === "report_monthly"
        ? nextScanAtFrom(new Date(timestamp))
        : undefined;

    if (args.userId) {
      await claimBusiness(ctx, args.businessExternalId, args.userId);
    }

    const existingRows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();

    const existing = existingRows.find((row) => {
      if (row.kind === args.kind) {
        return true;
      }
      if (args.polarOrderId && row.polarOrderId === args.polarOrderId) {
        return true;
      }
      if (
        args.polarSubscriptionId &&
        row.polarSubscriptionId === args.polarSubscriptionId
      ) {
        return true;
      }
      return false;
    });

    if (existing) {
      await ctx.db.patch("entitlements", existing._id, {
        kind: args.kind,
        nextScanAt:
          args.kind === "report_monthly"
            ? (existing.nextScanAt ?? nextScanAt)
            : undefined,
        polarOrderId: args.polarOrderId ?? existing.polarOrderId,
        polarSubscriptionId:
          args.polarSubscriptionId ?? existing.polarSubscriptionId,
        status: "active",
        updatedAt: timestamp,
        userId: args.userId ?? existing.userId,
      });
      const updated = await ctx.db.get("entitlements", existing._id);
      if (!updated) {
        throw new Error("Failed to load entitlement");
      }
      return toEntitlementResponse(updated);
    }

    const id = await ctx.db.insert("entitlements", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      kind: args.kind,
      nextScanAt,
      polarOrderId: args.polarOrderId,
      polarSubscriptionId: args.polarSubscriptionId,
      status: "active",
      updatedAt: timestamp,
      userId: args.userId,
    });

    const inserted = await ctx.db.get("entitlements", id);
    if (!inserted) {
      throw new Error("Failed to grant entitlement");
    }
    return toEntitlementResponse(inserted);
  },
});

export const revoke = mutation({
  args: {
    businessExternalId: v.optional(v.string()),
    polarOrderId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    if (
      !args.businessExternalId &&
      !args.polarOrderId &&
      !args.polarSubscriptionId
    ) {
      return;
    }

    const timestamp = nowIso();
    const rows = await ctx.db.query("entitlements").collect();
    const matchingRows = rows.filter(
      (row) =>
        (args.businessExternalId &&
          row.businessExternalId === args.businessExternalId) ||
        (args.polarOrderId && row.polarOrderId === args.polarOrderId) ||
        (args.polarSubscriptionId &&
          row.polarSubscriptionId === args.polarSubscriptionId)
    );
    await Promise.all(
      matchingRows.map((row) =>
        ctx.db.patch("entitlements", row._id, {
          status: "revoked",
          updatedAt: timestamp,
        })
      )
    );
  },
});

export const listDueMonthly = query({
  args: { limit: v.number(), nowIso: v.string() },
  handler: async (ctx, args) => {
    const nowMs = Date.parse(args.nowIso);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_status_and_nextScanAt", (q) => q.eq("status", "active"))
      .collect();

    return rows
      .filter((row) => {
        if (row.kind !== "report_monthly" || !row.nextScanAt) {
          return false;
        }
        const dueMs = Date.parse(row.nextScanAt);
        return !Number.isNaN(dueMs) && dueMs <= nowMs;
      })
      .slice(0, args.limit)
      .map((row) => ({
        businessExternalId: row.businessExternalId,
        id: row._id,
        nextScanAt: row.nextScanAt ?? null,
      }));
  },
});

export const setNextScanAt = internalMutation({
  args: { entitlementId: v.id("entitlements"), nextScanAt: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("entitlements", args.entitlementId, {
      nextScanAt: args.nextScanAt,
      updatedAt: nowIso(),
    });
  },
});

export const setNextScanAtInternal = mutation({
  args: {
    entitlementId: v.id("entitlements"),
    nextScanAt: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    await ctx.db.patch("entitlements", args.entitlementId, {
      nextScanAt: args.nextScanAt,
      updatedAt: nowIso(),
    });
  },
});
