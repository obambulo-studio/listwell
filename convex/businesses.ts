import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authedQuery } from "./lib/customFunctions";
import { businessResponseValidator } from "./lib/responseValidators";
import {
  MAX_COMPETITORS,
  MAX_HIDDEN_COMPETITORS,
  MAX_SEARCH_PHRASES,
} from "./lib/seo";
import {
  locationValidator,
  pinnedCompetitorValidator,
  searchPhraseValidator,
} from "./lib/validators";

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
  location: Doc<"businesses">["locations"][number],
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
  latitude: location.latitude ?? null,
  longitude: location.longitude ?? null,
  name: location.name ?? null,
  pinId: location.pinId ?? null,
  updatedAt: timestamp,
});

const toBusinessResponse = (doc: Doc<"businesses">) => ({
  category: doc.category,
  categoryLabel: doc.categoryLabel ?? null,
  competitors: doc.competitors ?? [],
  createdAt: doc.createdAt,
  deliverooUrl: doc.deliverooUrl ?? null,
  doorDashUrl: doc.doorDashUrl ?? null,
  facebookUsername: doc.facebookUsername ?? null,
  hiddenCompetitorPlaceIds: doc.hiddenCompetitorPlaceIds ?? [],
  id: doc.externalId,
  instagramUsername: doc.instagramUsername ?? null,
  linkedinUrl: doc.linkedinUrl ?? null,
  locations: doc.locations.map((location, index) =>
    toLocationResponse(location, doc.externalId, index, doc.updatedAt)
  ),
  menulogUrl: doc.menulogUrl ?? null,
  name: doc.name,
  searchPhrases: doc.searchPhrases ?? [],
  tiktokUsername: doc.tiktokUsername ?? null,
  uberEatsUrl: doc.uberEatsUrl ?? null,
  updatedAt: doc.updatedAt,
  userId: doc.userId ?? null,
  websiteUrl: doc.websiteUrl ?? null,
  xUsername: doc.xUsername ?? null,
  youtubeUrl: doc.youtubeUrl ?? null,
});

export const listOwned = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const owned = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return owned.map(toBusinessResponse);
  },
  returns: v.array(businessResponseValidator),
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
    categoryLabel: v.optional(v.string()),
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

    if (
      args.categoryLabel !== undefined &&
      (args.categoryLabel.length === 0 || args.categoryLabel.length > 100)
    ) {
      throw new Error("Invalid category");
    }
    const id = await ctx.db.insert("businesses", {
      category: args.category,
      categoryLabel: args.categoryLabel,
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
    categoryLabel: v.optional(v.union(v.string(), v.null())),
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
    const {
      categoryLabel,
      externalId: _externalId,
      secret: _secret,
      ...updates
    } = args;
    const patch: Record<string, unknown> = { updatedAt: timestamp };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    if (categoryLabel === null) {
      patch.categoryLabel = undefined;
    } else if (categoryLabel !== undefined) {
      if (categoryLabel.length === 0 || categoryLabel.length > 100) {
        throw new Error("Invalid category");
      }
      patch.categoryLabel = categoryLabel;
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

const MAX_PHRASE_CHARS = 80;

const findBusinessDoc = (ctx: Pick<MutationCtx, "db">, externalId: string) =>
  ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .unique();

/** Replaces saved phrases. The Worker assigns ids; a new wording needs a new id. */
export const setSearchPhrases = mutation({
  args: {
    externalId: v.string(),
    searchPhrases: v.array(searchPhraseValidator),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    const { requireInternalSecret } = await import("./lib/internal");
    requireInternalSecret(args.secret);
    if (args.searchPhrases.length > MAX_SEARCH_PHRASES) {
      throw new Error("Too many search phrases");
    }
    const ids = new Set(args.searchPhrases.map((phrase) => phrase.id));
    if (ids.size !== args.searchPhrases.length) {
      throw new Error("Search phrase ids must be unique");
    }
    for (const phrase of args.searchPhrases) {
      const text = phrase.text.trim();
      if (text.length === 0 || text.length > MAX_PHRASE_CHARS) {
        throw new Error("Invalid search phrase");
      }
    }
    const doc = await findBusinessDoc(ctx, args.externalId);
    if (!doc) {
      throw new Error("Business not found");
    }
    await ctx.db.patch("businesses", doc._id, {
      searchPhrases: args.searchPhrases.map((phrase) => ({
        ...phrase,
        text: phrase.text.trim(),
      })),
      updatedAt: nowIso(),
    });
    const updated = await ctx.db.get("businesses", doc._id);
    if (!updated) {
      throw new Error("Failed to load updated business");
    }
    return toBusinessResponse(updated);
  },
  returns: businessResponseValidator,
});

/** Pinned rivals and hidden suggestions. Grid and nearby rivals are computed per period. */
export const setCompetitors = mutation({
  args: {
    competitors: v.array(pinnedCompetitorValidator),
    externalId: v.string(),
    hiddenCompetitorPlaceIds: v.array(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    const { requireInternalSecret } = await import("./lib/internal");
    requireInternalSecret(args.secret);
    const pinned = [
      ...new Set(args.competitors.map((competitor) => competitor.placeId)),
    ];
    if (pinned.length > MAX_COMPETITORS) {
      throw new Error("Too many pinned competitors");
    }
    const hidden = [...new Set(args.hiddenCompetitorPlaceIds)].filter(
      (placeId) => !pinned.includes(placeId)
    );
    if (hidden.length > MAX_HIDDEN_COMPETITORS) {
      throw new Error("Too many hidden competitors");
    }
    const doc = await findBusinessDoc(ctx, args.externalId);
    if (!doc) {
      throw new Error("Business not found");
    }
    await ctx.db.patch("businesses", doc._id, {
      competitors: pinned.map((placeId) => ({ placeId, source: "pinned" })),
      hiddenCompetitorPlaceIds: hidden,
      updatedAt: nowIso(),
    });
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
