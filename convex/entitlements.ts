import { v } from "convex/values";

import {
  normalizePurchaserEmail,
  activePurchaseLinksToUser,
} from "../lib/purchase-link";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { requireInternalSecret } from "./lib/internal";
import {
  activeReportEntitlement,
  businessClaimAllowed,
  cancelledMonthlyEntitlement,
  entitlementRowsForBillingEnd,
  entitlementStatusAfterEnd,
  grantReusesEntitlementRow,
  researchReportEntitlement,
} from "./lib/reportEntitlements";
import {
  dueEntitlementRowValidator,
  entitlementResponseValidator,
} from "./lib/responseValidators";
import { runInSeries } from "./lib/runInSeries";
import {
  entitlementKindValidator,
  entitlementStatusValidator,
} from "./lib/validators";

const SCAN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

const reportEntitlementKinds = new Set(["report_once", "report_monthly"]);

const isReportEntitlementKind = (kind: string): boolean =>
  reportEntitlementKinds.has(kind);

const analyticsEntitlementKinds = new Set([
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);

const isAnalyticsEntitlementKind = (kind: string): boolean =>
  analyticsEntitlementKinds.has(kind);

const nowIso = (): string => new Date().toISOString();

const nextScanAtFrom = (date: Date): string =>
  new Date(date.getTime() + SCAN_INTERVAL_MS).toISOString();

const claimUnownedBusiness = async (
  ctx: Pick<MutationCtx, "db">,
  businessExternalId: string,
  userId: string
): Promise<void> => {
  const doc = await ctx.db
    .query("businesses")
    .withIndex("by_externalId", (q) => q.eq("externalId", businessExternalId))
    .unique();
  if (!doc || doc.userId) {
    return;
  }
  const entitlements = await ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();
  if (!businessClaimAllowed(entitlements, userId)) {
    return;
  }
  await ctx.db.patch("businesses", doc._id, { updatedAt: nowIso(), userId });
};

/** Attach paid reports bought with this email to the account, and claim those businesses. */
export const linkPurchasedBusinesses = async (
  ctx: MutationCtx,
  input: { email: string; userId: string }
): Promise<number> => {
  const email = normalizePurchaserEmail(input.email);
  if (!email) {
    return 0;
  }

  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_purchaserEmail", (q) => q.eq("purchaserEmail", email))
    .collect();

  const timestamp = nowIso();
  const assignedFlags = await runInSeries(rows, async (row) => {
    if (!activePurchaseLinksToUser(row, input.userId)) {
      return 0;
    }
    if (row.userId === undefined) {
      await ctx.db.patch("entitlements", row._id, {
        updatedAt: timestamp,
        userId: input.userId,
      });
    }
    await claimUnownedBusiness(ctx, row.businessExternalId, input.userId);
    return row.userId === undefined ? 1 : 0;
  });
  let assigned = 0;
  for (const flag of assignedFlags) {
    assigned += flag;
  }

  if (assigned > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.notificationPreferences.ensureForUser,
      { userId: input.userId }
    );
  }

  return assigned;
};

type StoredEntitlementKind =
  | "report_once"
  | "report_monthly"
  | "analytics_10k"
  | "analytics_100k"
  | "analytics_1m";

const toEntitlementResponse = (doc: {
  _id: string;
  businessExternalId: string;
  userId?: string;
  kind: StoredEntitlementKind;
  status: "active" | "cancelled" | "revoked";
  polarCustomerId?: string;
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
  polarCustomerId: doc.polarCustomerId ?? null,
  polarOrderId: doc.polarOrderId ?? null,
  polarSubscriptionId: doc.polarSubscriptionId ?? null,
  status: doc.status,
  updatedAt: doc.updatedAt,
  userId: doc.userId ?? null,
});

const purchaseOwnerForGrant = async (
  ctx: MutationCtx,
  input: { purchaserEmail?: string; userId?: string }
): Promise<{ email?: string; userId?: string }> => {
  const email = normalizePurchaserEmail(input.purchaserEmail);
  if (input.userId) {
    return { email, userId: input.userId };
  }
  if (!email) {
    return { email };
  }
  const found = await ctx.runQuery(internal.users.findIdByEmailInternal, {
    email,
  });
  return { email, userId: found ?? undefined };
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
  monthlyCancelled: v.boolean(),
  ownerEmail: v.union(v.string(), v.null()),
  ownerUserId: v.union(v.string(), v.null()),
  polarOrderId: v.union(v.string(), v.null()),
  purchaserEmail: v.union(v.string(), v.null()),
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

    const active = activeReportEntitlement(entitlements);
    const readable = active ?? cancelledMonthlyEntitlement(entitlements);
    if (!readable) {
      return {
        kind: null,
        monthlyCancelled: false,
        ownerEmail: null,
        ownerUserId: null,
        polarOrderId: null,
        purchaserEmail: null,
        unlocked: false,
      };
    }

    let ownerEmail: string | null = null;
    if (readable.userId) {
      const user = await authComponent.getAnyUserById(ctx, readable.userId);
      ownerEmail = user?.email ? maskEmail(user.email) : null;
    }

    return {
      kind: readable.kind,
      monthlyCancelled: active === null,
      ownerEmail,
      ownerUserId: readable.userId ?? null,
      polarOrderId: readable.polarOrderId ?? null,
      purchaserEmail: readable.purchaserEmail ?? null,
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
    return entitlements.some(
      (row) => row.status === "active" && isReportEntitlementKind(row.kind)
    );
  },
  returns: v.boolean(),
});

/** Active monthly entitlement when one exists, otherwise any active report row. */
export const getActiveForBusiness = query({
  args: { businessExternalId: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const active = rows.filter(
      (row) => row.status === "active" && isReportEntitlementKind(row.kind)
    );
    const chosen =
      active.find((row) => row.kind === "report_monthly") ?? active[0];
    if (!chosen) {
      return null;
    }
    const polarCustomerId =
      chosen.polarCustomerId ??
      active.find((row) => row.polarCustomerId)?.polarCustomerId ??
      null;
    const purchaserEmail =
      chosen.purchaserEmail ??
      active.find((row) => row.purchaserEmail)?.purchaserEmail ??
      null;
    return {
      kind: chosen.kind,
      nextScanAt: chosen.nextScanAt ?? null,
      polarCustomerId,
      purchaserEmail,
      status: chosen.status,
    };
  },
  returns: v.union(
    v.object({
      kind: entitlementKindValidator,
      nextScanAt: v.union(v.string(), v.null()),
      polarCustomerId: v.union(v.string(), v.null()),
      purchaserEmail: v.union(v.string(), v.null()),
      status: entitlementStatusValidator,
    }),
    v.null()
  ),
});

const readableEntitlementValidator = v.union(
  v.object({
    kind: entitlementKindValidator,
    nextScanAt: v.union(v.string(), v.null()),
    polarCustomerId: v.union(v.string(), v.null()),
    purchaserEmail: v.union(v.string(), v.null()),
    status: entitlementStatusValidator,
  }),
  v.null()
);

/**
 * Active monthly plan, otherwise a cancelled monthly plan, otherwise any
 * active report. Cancelled plans stay readable so previous scans remain.
 */
export const getReadableForBusiness = query({
  args: { businessExternalId: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const chosen = researchReportEntitlement(rows);
    if (!chosen) {
      return null;
    }
    return {
      kind: chosen.kind,
      nextScanAt: chosen.nextScanAt ?? null,
      polarCustomerId: chosen.polarCustomerId ?? null,
      purchaserEmail: chosen.purchaserEmail ?? null,
      status: chosen.status,
    };
  },
  returns: readableEntitlementValidator,
});

/** Fills a missing Polar customer id on active entitlements for one business. */
export const rememberPolarCustomer = mutation({
  args: {
    businessExternalId: v.string(),
    polarCustomerId: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const timestamp = nowIso();
    await Promise.all(
      rows.map(async (row) => {
        if (row.status !== "active" || row.polarCustomerId) {
          return;
        }
        await ctx.db.patch("entitlements", row._id, {
          polarCustomerId: args.polarCustomerId,
          updatedAt: timestamp,
        });
      })
    );
    return null;
  },
  returns: v.null(),
});

const attachGrantOwner = async (
  ctx: MutationCtx,
  input: {
    businessExternalId: string;
    existingUserId?: string;
    purchaseOwner: { email?: string; userId?: string };
  }
): Promise<void> => {
  const { email, userId } = input.purchaseOwner;
  if (!userId) {
    return;
  }
  if (input.existingUserId && input.existingUserId !== userId) {
    return;
  }
  await claimUnownedBusiness(ctx, input.businessExternalId, userId);
  if (email) {
    await linkPurchasedBusinesses(ctx, { email, userId });
  }
  await ctx.scheduler.runAfter(
    0,
    internal.notificationPreferences.ensureForUser,
    { userId }
  );
};

export const attachPurchasesForCurrentUser = authedMutation({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    return await linkPurchasedBusinesses(ctx, {
      email: user.email,
      userId: user._id,
    });
  },
  returns: v.number(),
});

export const listForCurrentUser = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows.map(toEntitlementResponse);
  },
  returns: v.array(entitlementResponseValidator),
});

export const grant = mutation({
  args: {
    businessExternalId: v.string(),
    kind: entitlementKindValidator,
    polarCustomerId: v.optional(v.string()),
    polarOrderId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    purchaserEmail: v.optional(v.string()),
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
    const [purchaseOwner, existingRows] = await Promise.all([
      purchaseOwnerForGrant(ctx, {
        purchaserEmail: args.purchaserEmail,
        userId: args.userId,
      }),
      ctx.db
        .query("entitlements")
        .withIndex("by_businessExternalId", (q) =>
          q.eq("businessExternalId", args.businessExternalId)
        )
        .collect(),
    ]);

    if (isAnalyticsEntitlementKind(args.kind)) {
      await Promise.all(
        existingRows.map(async (row) => {
          if (
            row.status === "active" &&
            isAnalyticsEntitlementKind(row.kind) &&
            row.kind !== args.kind
          ) {
            await ctx.db.patch("entitlements", row._id, {
              status: "revoked",
              updatedAt: timestamp,
            });
          }
        })
      );
    }

    const existing = existingRows.find((row) =>
      grantReusesEntitlementRow({
        existingKind: row.kind,
        grantKind: args.kind,
        polarOrderId: args.polarOrderId,
        polarSubscriptionId: args.polarSubscriptionId,
        rowOrderId: row.polarOrderId,
        rowSubscriptionId: row.polarSubscriptionId,
      })
    );

    if (existing) {
      let scheduledNextScanAt: string | undefined;
      if (args.kind === "report_monthly") {
        const restartSchedule =
          existing.status === "cancelled" || !existing.nextScanAt;
        scheduledNextScanAt = restartSchedule
          ? nextScanAt
          : existing.nextScanAt;
      }
      await ctx.db.patch("entitlements", existing._id, {
        kind: args.kind,
        nextScanAt: scheduledNextScanAt,
        polarCustomerId: args.polarCustomerId ?? existing.polarCustomerId,
        polarOrderId: args.polarOrderId ?? existing.polarOrderId,
        polarSubscriptionId:
          args.polarSubscriptionId ?? existing.polarSubscriptionId,
        ...(existing.status === "revoked" || existing.status === "cancelled"
          ? { purchaseEmailSentAt: undefined }
          : {}),
        purchaserEmail: existing.purchaserEmail ?? purchaseOwner.email,
        status: "active",
        updatedAt: timestamp,
        userId: existing.userId ?? purchaseOwner.userId,
      });
      const updated = await ctx.db.get("entitlements", existing._id);
      if (!updated) {
        throw new Error("Failed to load entitlement");
      }
      await attachGrantOwner(ctx, {
        businessExternalId: args.businessExternalId,
        existingUserId: existing.userId,
        purchaseOwner,
      });
      return toEntitlementResponse(updated);
    }

    const id = await ctx.db.insert("entitlements", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      kind: args.kind,
      nextScanAt,
      polarCustomerId: args.polarCustomerId,
      polarOrderId: args.polarOrderId,
      polarSubscriptionId: args.polarSubscriptionId,
      purchaserEmail: purchaseOwner.email,
      status: "active",
      updatedAt: timestamp,
      userId: purchaseOwner.userId,
    });

    const inserted = await ctx.db.get("entitlements", id);
    if (!inserted) {
      throw new Error("Failed to grant entitlement");
    }
    await attachGrantOwner(ctx, {
      businessExternalId: args.businessExternalId,
      existingUserId: undefined,
      purchaseOwner,
    });
    return toEntitlementResponse(inserted);
  },
  returns: entitlementResponseValidator,
});

const findActiveEntitlement = async (
  ctx: MutationCtx,
  businessExternalId: string,
  kind: StoredEntitlementKind
) => {
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_businessExternalId", (q) =>
      q.eq("businessExternalId", businessExternalId)
    )
    .collect();
  return (
    rows.find((row) => row.status === "active" && row.kind === kind) ?? null
  );
};

/** Marks the purchase email as sent. Returns false when it was already sent. */
export const claimPurchaseEmail = mutation({
  args: {
    businessExternalId: v.string(),
    kind: entitlementKindValidator,
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await findActiveEntitlement(
      ctx,
      args.businessExternalId,
      args.kind
    );
    if (!row || row.purchaseEmailSentAt) {
      return false;
    }
    await ctx.db.patch("entitlements", row._id, {
      purchaseEmailSentAt: nowIso(),
    });
    return true;
  },
  returns: v.boolean(),
});

/** Clears the send claim so a failed receipt can be retried. */
export const releasePurchaseEmail = mutation({
  args: {
    businessExternalId: v.string(),
    kind: entitlementKindValidator,
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await findActiveEntitlement(
      ctx,
      args.businessExternalId,
      args.kind
    );
    if (!row?.purchaseEmailSentAt) {
      return;
    }
    await ctx.db.patch("entitlements", row._id, {
      purchaseEmailSentAt: undefined,
    });
  },
  returns: v.null(),
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
    const identified: Doc<"entitlements">[] = [];
    const appendUnique = (rows: readonly Doc<"entitlements">[]) => {
      for (const row of rows) {
        if (!identified.some((existing) => existing._id === row._id)) {
          identified.push(row);
        }
      }
    };
    if (args.polarOrderId) {
      appendUnique(
        await ctx.db
          .query("entitlements")
          .withIndex("by_polarOrderId", (q) =>
            q.eq("polarOrderId", args.polarOrderId as string)
          )
          .collect()
      );
    }
    if (args.polarSubscriptionId) {
      appendUnique(
        await ctx.db
          .query("entitlements")
          .withIndex("by_polarSubscriptionId", (q) =>
            q.eq("polarSubscriptionId", args.polarSubscriptionId as string)
          )
          .collect()
      );
    }
    const businessRows =
      args.businessExternalId && !args.polarOrderId && !args.polarSubscriptionId
        ? await ctx.db
            .query("entitlements")
            .withIndex("by_businessExternalId", (q) =>
              q.eq("businessExternalId", args.businessExternalId as string)
            )
            .collect()
        : [];
    const matchingRows = entitlementRowsForBillingEnd({
      businessRows,
      identifiedRows: identified,
      polarOrderId: args.polarOrderId,
      polarSubscriptionId: args.polarSubscriptionId,
      scope: "revoke",
    });
    await Promise.all(
      matchingRows.map((row) =>
        ctx.db.patch("entitlements", row._id, {
          status: "revoked",
          updatedAt: timestamp,
        })
      )
    );
  },
  returns: v.null(),
});

/**
 * Ends the paid subscription. Monthly report rows stay readable.
 * A later refund still revokes them.
 */
export const lapse = mutation({
  args: {
    businessExternalId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const { businessExternalId } = args;
    const { polarSubscriptionId } = args;
    if (!businessExternalId && !polarSubscriptionId) {
      return null;
    }

    const identified = polarSubscriptionId
      ? await ctx.db
          .query("entitlements")
          .withIndex("by_polarSubscriptionId", (q) =>
            q.eq("polarSubscriptionId", polarSubscriptionId)
          )
          .collect()
      : [];
    const businessRows =
      identified.length === 0 && businessExternalId
        ? await ctx.db
            .query("entitlements")
            .withIndex("by_businessExternalId", (q) =>
              q.eq("businessExternalId", businessExternalId)
            )
            .collect()
        : [];
    const rows = entitlementRowsForBillingEnd({
      businessRows,
      identifiedRows: identified,
      polarSubscriptionId,
      scope: "lapse",
    });

    const timestamp = nowIso();
    await Promise.all(
      rows.map(async (row) => {
        const next = entitlementStatusAfterEnd({
          effect: "lapse",
          kind: row.kind,
          status: row.status,
        });
        if (!next) {
          return;
        }
        await ctx.db.patch("entitlements", row._id, {
          status: next,
          updatedAt: timestamp,
        });
      })
    );
    return null;
  },
  returns: v.null(),
});

export const listDueMonthly = query({
  args: { limit: v.number(), nowIso: v.string() },
  handler: async (ctx, args) => {
    const nowMs = Date.parse(args.nowIso);
    const limit = Math.min(args.limit, 10);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_status_and_nextScanAt", (q) => q.eq("status", "active"))
      .take(100);

    return rows
      .filter((row) => {
        if (row.kind !== "report_monthly" || !row.nextScanAt) {
          return false;
        }
        const dueMs = Date.parse(row.nextScanAt);
        return !Number.isNaN(dueMs) && dueMs <= nowMs;
      })
      .slice(0, limit)
      .map((row) => ({
        businessExternalId: row.businessExternalId,
        id: row._id,
        nextScanAt: row.nextScanAt ?? null,
      }));
  },
  returns: v.array(dueEntitlementRowValidator),
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
  returns: v.null(),
});

export const reserveDueMonthlyScan = mutation({
  args: {
    entitlementId: v.id("entitlements"),
    nowIso: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const row = await ctx.db.get("entitlements", args.entitlementId);
    if (
      !row ||
      row.status !== "active" ||
      row.kind !== "report_monthly" ||
      !row.nextScanAt
    ) {
      return { businessExternalId: null, reserved: false as const };
    }
    const nowMs = Date.parse(args.nowIso);
    const dueMs = Date.parse(row.nextScanAt);
    if (Number.isNaN(nowMs) || Number.isNaN(dueMs) || dueMs > nowMs) {
      return { businessExternalId: null, reserved: false as const };
    }
    const newNext = nextScanAtFrom(new Date(nowMs));
    await ctx.db.patch("entitlements", args.entitlementId, {
      nextScanAt: newNext,
      updatedAt: nowIso(),
    });
    return {
      businessExternalId: row.businessExternalId,
      reserved: true as const,
    };
  },
  returns: v.object({
    businessExternalId: v.union(v.string(), v.null()),
    reserved: v.boolean(),
  }),
});

const ONCE_RESCAN_FREE_LIMIT = 1;
const ONCE_RESCAN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const tryConsumeOnceRescan = mutation({
  args: {
    businessExternalId: v.string(),
    nowIso: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const active = rows.find(
      (row) => row.status === "active" && row.kind === "report_once"
    );
    if (!active) {
      return {
        allowed: false as const,
        reason: "no_active_once_entitlement" as const,
      };
    }
    const nowMs = Date.parse(args.nowIso);
    const grantedMs = Date.parse(active.createdAt);
    if (
      Number.isNaN(nowMs) ||
      Number.isNaN(grantedMs) ||
      nowMs - grantedMs > ONCE_RESCAN_WINDOW_MS
    ) {
      return {
        allowed: false as const,
        reason: "window_expired" as const,
      };
    }
    const used = active.onceRescansUsed ?? 0;
    if (used >= ONCE_RESCAN_FREE_LIMIT) {
      return {
        allowed: false as const,
        reason: "limit_reached" as const,
      };
    }
    await ctx.db.patch("entitlements", active._id, {
      onceRescansUsed: used + 1,
      updatedAt: nowIso(),
    });
    return { allowed: true as const, reason: null };
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.union(
      v.literal("no_active_once_entitlement"),
      v.literal("window_expired"),
      v.literal("limit_reached"),
      v.null()
    ),
  }),
});

export const getScanNotificationRecipient = query({
  args: { businessExternalId: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const entitlements = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const active = entitlements.find(
      (row) =>
        row.status === "active" &&
        (row.kind === "report_monthly" || row.kind === "report_once")
    );
    if (!active?.userId) {
      return null;
    }
    const user = await authComponent.getAnyUserById(ctx, active.userId);
    if (!user?.email) {
      return null;
    }
    const prefs = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", active.userId as string))
      .unique();
    return {
      email: user.email,
      monthlyScanEmails: prefs?.monthlyScanEmails ?? true,
      unsubscribeToken: prefs?.unsubscribeToken ?? null,
    };
  },
  returns: v.union(
    v.object({
      email: v.string(),
      monthlyScanEmails: v.boolean(),
      unsubscribeToken: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
});

export const getOnceRescanStatus = query({
  args: { businessExternalId: v.string(), nowIso: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("entitlements")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();
    const active = rows.find(
      (row) => row.status === "active" && row.kind === "report_once"
    );
    if (!active) {
      return {
        available: false,
        remaining: 0,
        windowEndsAt: null,
      };
    }
    const nowMs = Date.parse(args.nowIso);
    const grantedMs = Date.parse(active.createdAt);
    const windowEndsAt = new Date(
      grantedMs + ONCE_RESCAN_WINDOW_MS
    ).toISOString();
    const used = active.onceRescansUsed ?? 0;
    const remaining = Math.max(0, ONCE_RESCAN_FREE_LIMIT - used);
    const inWindow =
      !Number.isNaN(nowMs) &&
      !Number.isNaN(grantedMs) &&
      nowMs - grantedMs <= ONCE_RESCAN_WINDOW_MS;
    return {
      available: inWindow && remaining > 0,
      remaining: inWindow ? remaining : 0,
      windowEndsAt: inWindow ? windowEndsAt : null,
    };
  },
  returns: v.object({
    available: v.boolean(),
    remaining: v.number(),
    windowEndsAt: v.union(v.string(), v.null()),
  }),
});
