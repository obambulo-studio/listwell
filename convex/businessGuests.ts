import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { env } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { sendBusinessGuestInvite } from "./lib/email";
import { requireInternalSecret } from "./lib/internal";
import { normalizeInviteEmail } from "./lib/normalizeEmail";

const MAX_GUESTS_PER_BUSINESS = 25;

const nowIso = (): string => new Date().toISOString();

const newInviteToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const authSiteUrl = (): string => {
  const url = env.SITE_URL;
  if (!url) {
    throw new Error("SITE_URL is not configured on Convex");
  }
  return url.replace(/\/$/u, "");
};

const businessOwnedByUser = async (
  ctx: Pick<QueryCtx, "db">,
  businessExternalId: string,
  userId: string
): Promise<boolean> => {
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", businessExternalId))
    .unique();
  return business?.userId === userId;
};

const activeEntitlementForBusiness = async (
  ctx: Pick<QueryCtx, "db">,
  businessExternalId: string
) => {
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();
  return rows.find((row) => row.status === "active") ?? null;
};

export const businessGuestRowValidator = v.object({
  acceptedAt: v.union(v.string(), v.null()),
  email: v.string(),
  id: v.string(),
  invitedAt: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("revoked")
  ),
});

export const invitePreviewValidator = v.object({
  businessExternalId: v.string(),
  businessName: v.string(),
  inviteeEmail: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("revoked")
  ),
});

export const listForBusiness = authedQuery({
  args: { businessExternalId: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const owned = await businessOwnedByUser(
      ctx,
      args.businessExternalId,
      user._id
    );
    if (!owned) {
      throw new Error("Forbidden");
    }
    const rows = await ctx.db
      .query("businessGuests")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    return rows
      .filter((row) => row.status !== "revoked")
      .map((row) => ({
        acceptedAt: row.acceptedAt ?? null,
        email: row.inviteeEmail,
        id: row._id,
        invitedAt: row.createdAt,
        status: row.status,
      }))
      .toSorted((left, right) => right.invitedAt.localeCompare(left.invitedAt));
  },
  returns: v.array(businessGuestRowValidator),
});

export const invite = authedMutation({
  args: {
    businessExternalId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const owned = await businessOwnedByUser(
      ctx,
      args.businessExternalId,
      user._id
    );
    if (!owned) {
      throw new Error("Forbidden");
    }

    const inviteeEmail = normalizeInviteEmail(args.email);
    if (!inviteeEmail) {
      throw new Error("Enter a valid email address");
    }
    if (inviteeEmail === user.email.trim().toLowerCase()) {
      throw new Error("You cannot invite yourself");
    }

    const business = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", args.businessExternalId)
      )
      .unique();
    if (!business) {
      throw new Error("Business not found");
    }

    const existingRows = await ctx.db
      .query("businessGuests")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const activeCount = existingRows.filter(
      (row) => row.status === "pending" || row.status === "active"
    ).length;
    const existingForEmail = existingRows.find(
      (row) =>
        row.inviteeEmail === inviteeEmail &&
        (row.status === "pending" || row.status === "active")
    );

    const timestamp = nowIso();
    let inviteToken: string;
    let rowId: string;

    if (existingForEmail) {
      inviteToken = existingForEmail.inviteToken;
      rowId = existingForEmail._id;
      await ctx.db.patch(existingForEmail._id, {
        invitedByUserId: user._id,
        updatedAt: timestamp,
      });
    } else {
      if (activeCount >= MAX_GUESTS_PER_BUSINESS) {
        throw new Error("Guest limit reached for this business");
      }
      inviteToken = newInviteToken();
      rowId = await ctx.db.insert("businessGuests", {
        businessExternalId: args.businessExternalId,
        createdAt: timestamp,
        inviteToken,
        inviteeEmail,
        invitedByUserId: user._id,
        status: "pending",
        updatedAt: timestamp,
      });
    }

    await ctx.scheduler.runAfter(0, internal.businessGuests.sendInviteEmail, {
      businessName: business.name,
      inviteToken,
      to: inviteeEmail,
    });

    return { id: rowId, status: "pending" as const };
  },
  returns: v.object({
    id: v.string(),
    status: v.literal("pending"),
  }),
});

export const revoke = authedMutation({
  args: { businessExternalId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const inviteeEmail = normalizeInviteEmail(args.email);
    if (!inviteeEmail) {
      throw new Error("Guest not found");
    }
    const rows = await ctx.db
      .query("businessGuests")
      .withIndex("by_inviteeEmail_and_business", (q) =>
        q
          .eq("inviteeEmail", inviteeEmail)
          .eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const row = rows.find(
      (candidate) =>
        candidate.status === "pending" || candidate.status === "active"
    );
    if (!row) {
      throw new Error("Guest not found");
    }
    const owned = await businessOwnedByUser(
      ctx,
      row.businessExternalId,
      user._id
    );
    if (!owned) {
      throw new Error("Forbidden");
    }
    const timestamp = nowIso();
    await ctx.db.patch(row._id, {
      revokedAt: timestamp,
      status: "revoked",
      updatedAt: timestamp,
    });
    return { ok: true as const };
  },
  returns: v.object({ ok: v.literal(true) }),
});

export const previewByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("businessGuests")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!row || row.status === "revoked") {
      return null;
    }
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", row.businessExternalId)
      )
      .unique();
    if (!business) {
      return null;
    }
    return {
      businessExternalId: row.businessExternalId,
      businessName: business.name,
      inviteeEmail: row.inviteeEmail,
      status: row.status,
    };
  },
  returns: v.union(invitePreviewValidator, v.null()),
});

export const acceptByToken = authedMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const row = await ctx.db
      .query("businessGuests")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!row || row.status === "revoked") {
      throw new Error("This invite is no longer valid");
    }
    const sessionEmail = user.email.trim().toLowerCase();
    if (sessionEmail !== row.inviteeEmail) {
      throw new Error(
        "Sign in with the email address that received this invite"
      );
    }
    if (row.status === "active" && row.guestUserId === user._id) {
      return {
        businessExternalId: row.businessExternalId,
        alreadyAccepted: true as const,
      };
    }
    const timestamp = nowIso();
    await ctx.db.patch(row._id, {
      acceptedAt: timestamp,
      guestUserId: user._id,
      status: "active",
      updatedAt: timestamp,
    });
    return {
      alreadyAccepted: false as const,
      businessExternalId: row.businessExternalId,
    };
  },
  returns: v.object({
    alreadyAccepted: v.boolean(),
    businessExternalId: v.string(),
  }),
});

export const isActiveGuestForUser = query({
  args: {
    businessExternalId: v.string(),
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("businessGuests")
      .withIndex("by_guestUserId", (q) => q.eq("guestUserId", args.userId))
      .collect();
    return rows.some(
      (row) =>
        row.businessExternalId === args.businessExternalId &&
        row.status === "active"
    );
  },
  returns: v.boolean(),
});

export const listActiveGuestBusinessIds = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("businessGuests")
      .withIndex("by_guestUserId", (q) => q.eq("guestUserId", args.userId))
      .collect();
    return rows
      .filter((row) => row.status === "active")
      .map((row) => row.businessExternalId);
  },
  returns: v.array(v.string()),
});

export const sendInviteEmail = internalAction({
  args: {
    businessName: v.string(),
    inviteToken: v.string(),
    to: v.string(),
  },
  handler: async (_ctx, args) => {
    const siteUrl = authSiteUrl();
    const acceptUrl = `${siteUrl}/invite/${args.inviteToken}`;
    const sent = await sendBusinessGuestInvite({
      acceptUrl,
      businessName: args.businessName,
      siteUrl,
      to: args.to,
    });
    if (!sent) {
      throw new Error("Could not send invite email");
    }
  },
});

const upsertGuestReport = async (
  ctx: Pick<QueryCtx, "db">,
  businessExternalId: string,
  byExternalId: Map<
    string,
    {
      id: string;
      name: string;
      owned: boolean;
      unlocked: boolean;
      plan: "preview" | "once" | "monthly";
      lastScan: {
        score: number | null;
        finishedAt: string | null;
        previousScore: number | null;
      } | null;
      nextScanAt: string | null;
    }
  >
) => {
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", businessExternalId))
    .unique();
  if (!business) {
    return;
  }
  const entitlement = await activeEntitlementForBusiness(ctx, businessExternalId);
  const activeKind =
    entitlement?.status === "active" ? entitlement.kind : null;
  const plan =
    activeKind === "report_monthly"
      ? ("monthly" as const)
      : activeKind === "report_once"
        ? ("once" as const)
        : ("preview" as const);
  const existing = byExternalId.get(businessExternalId);
  if (existing) {
    existing.owned = false;
    if (activeKind) {
      existing.unlocked = true;
      existing.plan = plan;
      existing.nextScanAt =
        activeKind === "report_monthly"
          ? (entitlement?.nextScanAt ?? null)
          : null;
    }
    return;
  }
  byExternalId.set(businessExternalId, {
    id: businessExternalId,
    lastScan: null,
    name: business.name,
    nextScanAt:
      activeKind === "report_monthly"
        ? (entitlement?.nextScanAt ?? null)
        : null,
    owned: false,
    plan,
    unlocked: activeKind !== null,
  });
};

/** Used by account.listReports to merge guest businesses. */
export const mergeGuestBusinessesForUser = async (
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  byExternalId: Map<
    string,
    {
      id: string;
      name: string;
      owned: boolean;
      unlocked: boolean;
      plan: "preview" | "once" | "monthly";
      lastScan: {
        score: number | null;
        finishedAt: string | null;
        previousScore: number | null;
      } | null;
      nextScanAt: string | null;
    }
  >
): Promise<void> => {
  const rows = await ctx.db
    .query("businessGuests")
    .withIndex("by_guestUserId", (q) => q.eq("guestUserId", userId))
    .collect();
  for (const row of rows) {
    if (row.status !== "active") {
      continue;
    }
    await upsertGuestReport(ctx, row.businessExternalId, byExternalId);
  }
};
