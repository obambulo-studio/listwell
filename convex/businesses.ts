import { v } from "convex/values";

import {
  entitlementBelongsToAnotherUser,
  otherAccountsStillHaveAccessMessage,
  removalBillingTarget,
  removalBlockedByOtherActiveEntitlement,
} from "../lib/account-business-remove";
import { isAnalyticsEntitlementKind } from "../lib/analytics-pricing";
import { normalizeWebsiteInput } from "../lib/text-normalize";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { businessClaimAllowed } from "./lib/reportEntitlements";
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

const BUSINESS_NAME_MAX = 200;

/** Trim and collapse spaces. Keep the casing the caller sent. */
const storedBusinessName = (value: string): string => {
  const name = value.trim().replaceAll(/\s+/gu, " ");
  if (name.length === 0 || name.length > BUSINESS_NAME_MAX) {
    throw new Error("Invalid business name");
  }
  return name;
};

const storedWebsiteUrl = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return normalizeWebsiteInput(trimmed);
};

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
  return businessClaimAllowed(entitlements, userId);
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
    const name = storedBusinessName(args.name);
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
      name,
      tiktokUsername: args.tiktokUsername,
      uberEatsUrl: args.uberEatsUrl,
      updatedAt: timestamp,
      websiteUrl: storedWebsiteUrl(args.websiteUrl),
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
      if (value === undefined) {
        continue;
      }
      if (key === "name" && typeof value === "string") {
        patch.name = storedBusinessName(value);
        continue;
      }
      if (key === "websiteUrl" && typeof value === "string") {
        patch.websiteUrl = storedWebsiteUrl(value);
        continue;
      }
      patch[key] = value;
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

const findBusinessDoc = (ctx: Pick<QueryCtx, "db">, externalId: string) =>
  ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .unique();

const listEntitlements = (
  ctx: Pick<QueryCtx, "db">,
  businessExternalId: string
) =>
  ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();

const toRemovalEntitlement = (row: Doc<"entitlements">) => ({
  kind: row.kind,
  polarCustomerId: row.polarCustomerId ?? null,
  polarSubscriptionId: row.polarSubscriptionId ?? null,
  purchaserEmail: row.purchaserEmail ?? null,
  status: row.status,
  userId: row.userId ?? null,
});

const assertNoForeignActiveEntitlement = (
  entitlements: Doc<"entitlements">[],
  ownerId: string
): void => {
  if (
    removalBlockedByOtherActiveEntitlement(
      entitlements.map(toRemovalEntitlement),
      ownerId
    )
  ) {
    throw new Error(otherAccountsStillHaveAccessMessage);
  }
};

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

const deleteRowsForBusiness = async (
  ctx: MutationCtx,
  businessExternalId: string,
  ownerId: string
): Promise<void> => {
  const entitlements = await listEntitlements(ctx, businessExternalId);
  assertNoForeignActiveEntitlement(entitlements, ownerId);

  const [scans, shares, budgets, observations] = await Promise.all([
    ctx.db
      .query("scans")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", businessExternalId)
      )
      .collect(),
    ctx.db
      .query("reportShares")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", businessExternalId)
      )
      .collect(),
    ctx.db
      .query("seoBudgets")
      .withIndex("by_businessExternalId_and_periodStart", (q) =>
        q.eq("businessExternalId", businessExternalId)
      )
      .collect(),
    ctx.db
      .query("seoObservations")
      .withIndex("by_business_and_period", (q) =>
        q.eq("businessExternalId", businessExternalId)
      )
      .collect(),
  ]);

  let ownedEntitlements = entitlements.filter(
    (row) => !entitlementBelongsToAnotherUser(row.userId ?? null, ownerId)
  );

  const analyticsToRelocate = ownedEntitlements.filter((row) =>
    isAnalyticsEntitlementKind(row.kind)
  );
  if (analyticsToRelocate.length > 0) {
    const ownedBusinesses = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", ownerId))
      .collect();
    const target = ownedBusinesses.find(
      (business) => business.externalId !== businessExternalId
    );
    if (target) {
      const timestamp = nowIso();
      await Promise.all(
        analyticsToRelocate.map((row) =>
          ctx.db.patch("entitlements", row._id, {
            businessExternalId: target.externalId,
            updatedAt: timestamp,
          })
        )
      );
      const relocatedIds = new Set(analyticsToRelocate.map((row) => row._id));
      ownedEntitlements = ownedEntitlements.filter(
        (row) => !relocatedIds.has(row._id)
      );
    }
  }

  await Promise.all([
    Promise.all(scans.map((row) => ctx.db.delete("scans", row._id))),
    Promise.all(
      ownedEntitlements.map((row) => ctx.db.delete("entitlements", row._id))
    ),
    Promise.all(shares.map((row) => ctx.db.delete("reportShares", row._id))),
    Promise.all(budgets.map((row) => ctx.db.delete("seoBudgets", row._id))),
    Promise.all(
      observations.map((row) => ctx.db.delete("seoObservations", row._id))
    ),
  ]);
};

/** Whether removal must stop, and which Polar subscriptions to revoke first. */
export const removalPreview = authedQuery({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const doc = await findBusinessDoc(ctx, args.externalId);
    if (!doc) {
      throw new Error("Business not found");
    }
    const entitlements = await listEntitlements(ctx, args.externalId);
    const rows = entitlements.map(toRemovalEntitlement);
    const ownsBusiness = doc.userId === user._id;
    const holdsEntitlement = rows.some((row) => row.userId === user._id);
    if (!ownsBusiness && !holdsEntitlement) {
      throw new Error("Forbidden");
    }
    const billingRows = ownsBusiness
      ? rows
      : rows.filter((row) => row.userId === user._id);
    const billing = removalBillingTarget(billingRows, user._id);
    return {
      blocked:
        ownsBusiness && removalBlockedByOtherActiveEntitlement(rows, user._id),
      deletesBusiness: ownsBusiness,
      polarCustomerId: billing.polarCustomerId,
      purchaserEmail: billing.purchaserEmail,
      recurring: billing.recurring,
      subscriptionIds: billing.subscriptionIds,
    };
  },
  returns: v.object({
    blocked: v.boolean(),
    deletesBusiness: v.boolean(),
    polarCustomerId: v.union(v.string(), v.null()),
    purchaserEmail: v.union(v.string(), v.null()),
    recurring: v.boolean(),
    subscriptionIds: v.array(v.string()),
  }),
});

/** Removes a business the signed-in user owns, or their access when someone else owns it. */
export const removeOwned = authedMutation({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const doc = await findBusinessDoc(ctx, args.externalId);
    if (!doc) {
      throw new Error("Business not found");
    }
    const entitlements = await listEntitlements(ctx, args.externalId);
    const ownsBusiness = doc.userId === user._id;
    const heldEntitlements = entitlements.filter(
      (row) => row.userId === user._id
    );
    if (!ownsBusiness && heldEntitlements.length === 0) {
      throw new Error("Forbidden");
    }
    if (ownsBusiness) {
      assertNoForeignActiveEntitlement(entitlements, user._id);
      await deleteRowsForBusiness(ctx, args.externalId, user._id);
      await ctx.db.delete("businesses", doc._id);
      return { deletesBusiness: true as const };
    }
    await Promise.all(
      heldEntitlements.map((row) => ctx.db.delete("entitlements", row._id))
    );
    return { deletesBusiness: false as const };
  },
  returns: v.object({ deletesBusiness: v.boolean() }),
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
