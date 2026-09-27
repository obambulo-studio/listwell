import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireInternalSecret } from "./lib/internal";

const nowIso = (): string => new Date().toISOString();

const shareRecordValidator = v.object({
  businessId: v.string(),
  createdAt: v.string(),
  expiresAt: v.union(v.string(), v.null()),
  revokedAt: v.union(v.string(), v.null()),
  token: v.string(),
});

const isActive = (doc: {
  expiresAt?: string | null;
  revokedAt?: string | null;
}): boolean => {
  if (doc.revokedAt) {
    return false;
  }
  if (doc.expiresAt) {
    const expiresMs = Date.parse(doc.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
      return false;
    }
  }
  return true;
};

const toShareRecord = (doc: {
  businessExternalId: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  token: string;
}) => ({
  businessId: doc.businessExternalId,
  createdAt: doc.createdAt,
  expiresAt: doc.expiresAt ?? null,
  revokedAt: doc.revokedAt ?? null,
  token: doc.token,
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("reportShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!doc || !isActive(doc)) {
      return null;
    }
    return toShareRecord(doc);
  },
  returns: v.union(shareRecordValidator, v.null()),
});

export const getActiveForBusiness = query({
  args: { businessExternalId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reportShares")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const active = rows.find((row) => isActive(row));
    if (!active) {
      return null;
    }
    return toShareRecord(active);
  },
  returns: v.union(shareRecordValidator, v.null()),
});

export const upsertActive = mutation({
  args: {
    businessExternalId: v.string(),
    expiresAt: v.union(v.string(), v.null()),
    secret: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const timestamp = nowIso();
    const existing = await ctx.db
      .query("reportShares")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    await Promise.all(
      existing.flatMap((row) => {
        if (row.revokedAt) {
          return [];
        }
        return [
          ctx.db.patch("reportShares", row._id, {
            revokedAt: timestamp,
            updatedAt: timestamp,
          }),
        ];
      })
    );
    const id = await ctx.db.insert("reportShares", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      expiresAt: args.expiresAt ?? undefined,
      token: args.token,
      updatedAt: timestamp,
    });
    const doc = await ctx.db.get("reportShares", id);
    if (!doc) {
      throw new Error("Share link could not be saved");
    }
    return toShareRecord(doc);
  },
  returns: shareRecordValidator,
});

export const revoke = mutation({
  args: {
    businessExternalId: v.string(),
    secret: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const doc = await ctx.db
      .query("reportShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!doc || doc.businessExternalId !== args.businessExternalId) {
      return null;
    }
    if (doc.revokedAt) {
      return null;
    }
    const timestamp = nowIso();
    await ctx.db.patch("reportShares", doc._id, {
      revokedAt: timestamp,
      updatedAt: timestamp,
    });
    return null;
  },
  returns: v.null(),
});
