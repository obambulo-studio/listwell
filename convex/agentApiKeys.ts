import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { buildPrimaryReports } from "./accountReports";
import { requireInternalSecret } from "./lib/internal";

const agentKeyListItemValidator = v.object({
  createdAt: v.string(),
  id: v.id("agentApiKeys"),
  label: v.string(),
  lastUsedAt: v.union(v.string(), v.null()),
  prefix: v.string(),
  revokedAt: v.union(v.string(), v.null()),
});

const agentBusinessListItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  plan: v.union(v.literal("preview"), v.literal("once"), v.literal("monthly")),
  unlocked: v.boolean(),
});

export const createInternal = mutation({
  args: {
    createdAt: v.string(),
    keyHash: v.string(),
    label: v.string(),
    prefix: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const label = args.label.trim();
    if (label.length === 0 || label.length > 80) {
      throw new Error("Invalid label");
    }
    if (args.prefix.length < 8 || args.keyHash.length !== 64) {
      throw new Error("Invalid key material");
    }
    const active = await ctx.db
      .query("agentApiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const liveCount = active.filter(
      (row) => row.revokedAt === undefined
    ).length;
    if (liveCount >= 10) {
      throw new Error("Too many active keys");
    }
    const id = await ctx.db.insert("agentApiKeys", {
      createdAt: args.createdAt,
      keyHash: args.keyHash,
      label,
      prefix: args.prefix,
      userId: args.userId,
    });
    return { id };
  },
});

export const revokeInternal = mutation({
  args: {
    keyId: v.id("agentApiKeys"),
    revokedAt: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await ctx.db.get("agentApiKeys", args.keyId);
    if (!row || row.userId !== args.userId) {
      throw new Error("Key not found");
    }
    if (row.revokedAt !== undefined) {
      return { ok: true };
    }
    await ctx.db.patch("agentApiKeys", args.keyId, {
      revokedAt: args.revokedAt,
    });
    return { ok: true };
  },
});

export const listForUserInternal = query({
  args: {
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("agentApiKeys")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    return rows
      .map((row) => ({
        createdAt: row.createdAt,
        id: row._id,
        label: row.label,
        lastUsedAt: row.lastUsedAt ?? null,
        prefix: row.prefix,
        revokedAt: row.revokedAt ?? null,
      }))
      .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
  },
  returns: v.array(agentKeyListItemValidator),
});

export const resolveUserInternal = mutation({
  args: {
    keyHash: v.string(),
    secret: v.string(),
    touchAt: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    if (args.keyHash.length !== 64) {
      return null;
    }
    const row = await ctx.db
      .query("agentApiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!row || row.revokedAt !== undefined) {
      return null;
    }
    await ctx.db.patch("agentApiKeys", row._id, { lastUsedAt: args.touchAt });
    return { userId: row.userId };
  },
  returns: v.union(v.object({ userId: v.string() }), v.null()),
});

export const listBusinessesForUserInternal = query({
  args: {
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const reports = await buildPrimaryReports(ctx, args.userId);
    return reports
      .filter((report) => report.owned)
      .map((report) => ({
        id: report.id,
        name: report.name,
        plan: report.plan,
        unlocked: report.unlocked,
      }));
  },
  returns: v.array(agentBusinessListItemValidator),
});

export const assertBusinessOwnedInternal = query({
  args: {
    businessExternalId: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", args.businessExternalId)
      )
      .unique();
    if (!business || business.userId !== args.userId) {
      return { ok: false as const };
    }
    return { name: business.name, ok: true as const };
  },
  returns: v.union(
    v.object({ ok: v.literal(false) }),
    v.object({ name: v.string(), ok: v.literal(true) })
  ),
});
