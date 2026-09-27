import { v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { requireInternalSecret } from "./lib/internal";

const nowIso = (): string => new Date().toISOString();

const randomToken = (): string => crypto.randomUUID().replace(/-/gu, "");

export const ensureForUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      return existing.unsubscribeToken;
    }
    const token = randomToken();
    await ctx.db.insert("notificationPreferences", {
      monthlyScanEmails: true,
      unsubscribeToken: token,
      updatedAt: nowIso(),
      userId: args.userId,
    });
    return token;
  },
  returns: v.string(),
});

export const getForUser = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!row) {
      return null;
    }
    return {
      monthlyScanEmails: row.monthlyScanEmails,
      unsubscribeToken: row.unsubscribeToken,
    };
  },
  returns: v.union(
    v.object({
      monthlyScanEmails: v.boolean(),
      unsubscribeToken: v.string(),
    }),
    v.null()
  ),
});

export const ensureForUserInternal = mutation({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      return existing.unsubscribeToken;
    }
    const token = randomToken();
    await ctx.db.insert("notificationPreferences", {
      monthlyScanEmails: true,
      unsubscribeToken: token,
      updatedAt: nowIso(),
      userId: args.userId,
    });
    return token;
  },
  returns: v.string(),
});

export const unsubscribeByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", args.token)
      )
      .unique();
    if (!row) {
      return { ok: false as const };
    }
    await ctx.db.patch(row._id, {
      monthlyScanEmails: false,
      updatedAt: nowIso(),
    });
    return { ok: true as const };
  },
  returns: v.object({ ok: v.boolean() }),
});
