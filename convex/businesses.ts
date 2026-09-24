import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { businessResponseValidator } from "./lib/response-validators";
import { locationValidator } from "./lib/validators";

const nowIso = (): string => new Date().toISOString();

const entitlementAllowsClaim = async (
  ctx: { db: MutationCtx["db"] },
  businessExternalId: string,
  userId: string
): Promise<boolean> => {
  const entitlements = await ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();
  const active = entitlements.find((row) => row.status === "active");
  if (!active) {
    return true;
  }
  return active.userId === userId;
};

const toLocationResponse = (
  location: {
    googlePlaceId?: string;
    appleMapsId?: string;
    name?: string;
    address?: string;
  },
  businessExternalId: string,
  index: number,
  timestamp: string
) => ({
  address: location.address ?? null,
  appleMapsId: location.appleMapsId ?? null,
  businessId: businessExternalId,
  createdAt: timestamp,
  googlePlaceId: location.googlePlaceId ?? null,
  id: index + 1,
  name: location.name ?? null,
  updatedAt: timestamp,
});

const toBusinessResponse = (doc: {
  _id: string;
  externalId: string;
  name: string;
  category: string;
  websiteUrl?: string;
  facebookUsername?: string;
  instagramUsername?: string;
  tiktokUsername?: string;
  xUsername?: string;
  linkedinUrl?: string;
  youtubeUrl?: string;
  uberEatsUrl?: string;
  doorDashUrl?: string;
  deliverooUrl?: string;
  menulogUrl?: string;
  userId?: string;
  locations: {
    googlePlaceId?: string;
    appleMapsId?: string;
    name?: string;
    address?: string;
  }[];
  createdAt: string;
  updatedAt: string;
}) => ({
  category: doc.category,
  createdAt: doc.createdAt,
  deliverooUrl: doc.deliverooUrl ?? null,
  doorDashUrl: doc.doorDashUrl ?? null,
  facebookUsername: doc.facebookUsername ?? null,
  id: doc.externalId,
  instagramUsername: doc.instagramUsername ?? null,
  linkedinUrl: doc.linkedinUrl ?? null,
  locations: doc.locations.map((location, index) =>
    toLocationResponse(location, doc.externalId, index, doc.updatedAt)
  ),
  menulogUrl: doc.menulogUrl ?? null,
  name: doc.name,
  tiktokUsername: doc.tiktokUsername ?? null,
  uberEatsUrl: doc.uberEatsUrl ?? null,
  updatedAt: doc.updatedAt,
  userId: doc.userId ?? null,
  websiteUrl: doc.websiteUrl ?? null,
  xUsername: doc.xUsername ?? null,
  youtubeUrl: doc.youtubeUrl ?? null,
});

export const getByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    return doc ? toBusinessResponse(doc) : null;
  },
  returns: v.union(businessResponseValidator, v.null()),
});

export const listByExternalIds = query({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const capped = args.externalIds.slice(0, 50);
    const businesses = await Promise.all(
      capped.map(async (externalId) => {
        const doc = await ctx.db
          .query("businesses")
          .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
          .unique();
        return doc ? toBusinessResponse(doc) : null;
      })
    );
    return businesses.filter((business) => business !== null);
  },
  returns: v.array(businessResponseValidator),
});

export const getOwnerId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    return doc?.userId ?? null;
  },
  returns: v.union(v.string(), v.null()),
});

export const create = mutation({
  args: {
    category: v.string(),
    deliverooUrl: v.optional(v.string()),
    doorDashUrl: v.optional(v.string()),
    externalId: v.optional(v.string()),
    facebookUsername: v.optional(v.string()),
    instagramUsername: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    locations: v.optional(v.array(locationValidator)),
    menulogUrl: v.optional(v.string()),
    name: v.string(),
    tiktokUsername: v.optional(v.string()),
    uberEatsUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    xUsername: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.trim().length === 0 || args.name.length > 200) {
      throw new Error("Invalid business name");
    }
    if (args.category.length > 100) {
      throw new Error("Invalid category");
    }
    if ((args.locations ?? []).length > 20) {
      throw new Error("Too many locations");
    }
    const timestamp = nowIso();
    const externalId = args.externalId ?? crypto.randomUUID();
    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
    if (existing) {
      return toBusinessResponse(existing);
    }

    const id = await ctx.db.insert("businesses", {
      category: args.category,
      createdAt: timestamp,
      deliverooUrl: args.deliverooUrl,
      doorDashUrl: args.doorDashUrl,
      externalId,
      facebookUsername: args.facebookUsername,
      instagramUsername: args.instagramUsername,
      linkedinUrl: args.linkedinUrl,
      locations: args.locations ?? [],
      menulogUrl: args.menulogUrl,
      name: args.name,
      tiktokUsername: args.tiktokUsername,
      uberEatsUrl: args.uberEatsUrl,
      updatedAt: timestamp,
      websiteUrl: args.websiteUrl,
      xUsername: args.xUsername,
      youtubeUrl: args.youtubeUrl,
    });

    const doc = await ctx.db.get("businesses", id);
    if (!doc) {
      throw new Error("Failed to load created business");
    }
    return toBusinessResponse(doc);
  },
  returns: businessResponseValidator,
});

export const update = mutation({
  args: {
    category: v.optional(v.string()),
    deliverooUrl: v.optional(v.string()),
    doorDashUrl: v.optional(v.string()),
    externalId: v.string(),
    facebookUsername: v.optional(v.string()),
    instagramUsername: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    locations: v.optional(v.array(locationValidator)),
    menulogUrl: v.optional(v.string()),
    name: v.optional(v.string()),
    secret: v.string(),
    tiktokUsername: v.optional(v.string()),
    uberEatsUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    xUsername: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { requireInternalSecret } = await import("./lib/internal");
    requireInternalSecret(args.secret);
    const doc = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!doc) {
      throw new Error("Business not found");
    }

    const timestamp = nowIso();
    const { externalId: _externalId, secret: _secret, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: timestamp };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    await ctx.db.patch("businesses", doc._id, patch);
    const updated = await ctx.db.get("businesses", doc._id);
    if (!updated) {
      throw new Error("Failed to load updated business");
    }
    return toBusinessResponse(updated);
  },
  returns: businessResponseValidator,
});

export const claimInternal = mutation({
  args: {
    externalIds: v.array(v.string()),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { requireInternalSecret } = await import("./lib/internal");
    requireInternalSecret(args.secret);
    const timestamp = nowIso();

    const claimResults = await Promise.all(
      args.externalIds.map(async (externalId) => {
        const doc = await ctx.db
          .query("businesses")
          .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
          .unique();
        if (
          doc &&
          !doc.userId &&
          (await entitlementAllowsClaim(ctx, externalId, args.userId))
        ) {
          await ctx.db.patch("businesses", doc._id, {
            updatedAt: timestamp,
            userId: args.userId,
          });
          return 1;
        }
        return 0;
      })
    );

    let claimedCount = 0;
    for (const claimed of claimResults) {
      claimedCount += claimed;
    }
    return claimedCount;
  },
  returns: v.number(),
});

export const attachOwnerIfUnowned = mutation({
  args: {
    externalId: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { requireInternalSecret } = await import("./lib/internal");
    requireInternalSecret(args.secret);
    const doc = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (
      !doc ||
      doc.userId ||
      !(await entitlementAllowsClaim(ctx, args.externalId, args.userId))
    ) {
      return false;
    }
    await ctx.db.patch("businesses", doc._id, {
      updatedAt: nowIso(),
      userId: args.userId,
    });
    return true;
  },
  returns: v.boolean(),
});
