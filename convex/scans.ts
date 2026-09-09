import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireInternalSecret, siteUrl } from "./lib/internal";
import { scanStatusValidator, scanTriggerValidator } from "./lib/validators";

const nowIso = (): string => new Date().toISOString();

const toScanResponse = (doc: {
  _id: string;
  businessExternalId: string;
  trigger: "baseline" | "schedule";
  status: "queued" | "running" | "complete" | "error";
  score?: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  resultsJson?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
}) => {
  const results =
    doc.resultsJson && doc.resultsJson.length > 0
      ? (JSON.parse(doc.resultsJson) as Record<string, unknown>)
      : null;

  return {
    businessId: doc.businessExternalId,
    createdAt: doc.createdAt,
    error: doc.error ?? null,
    errorCount: doc.errorCount,
    failCount: doc.failCount,
    finishedAt: doc.finishedAt ?? null,
    id: doc._id,
    passCount: doc.passCount,
    results,
    score: doc.score ?? null,
    startedAt: doc.startedAt,
    status: doc.status,
    trigger: doc.trigger,
  };
};

const toScanSummary = (doc: {
  _id: string;
  businessExternalId: string;
  trigger: "baseline" | "schedule";
  status: "queued" | "running" | "complete" | "error";
  score?: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  startedAt: string;
  finishedAt?: string;
}) => ({
  errorCount: doc.errorCount,
  failCount: doc.failCount,
  finishedAt: doc.finishedAt ?? null,
  id: doc._id,
  passCount: doc.passCount,
  score: doc.score ?? null,
  startedAt: doc.startedAt,
  status: doc.status,
  trigger: doc.trigger,
});

export const insert = mutation({
  args: {
    businessExternalId: v.string(),
    secret: v.string(),
    startedAt: v.string(),
    status: scanStatusValidator,
    trigger: scanTriggerValidator,
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const timestamp = nowIso();
    const id = await ctx.db.insert("scans", {
      businessExternalId: args.businessExternalId,
      createdAt: timestamp,
      errorCount: 0,
      failCount: 0,
      passCount: 0,
      startedAt: args.startedAt,
      status: args.status,
      trigger: args.trigger,
    });
    const doc = await ctx.db.get("scans", id);
    if (!doc) {
      throw new Error("Failed to insert scan");
    }
    return toScanResponse(doc);
  },
});

export const update = mutation({
  args: {
    error: v.optional(v.string()),
    errorCount: v.optional(v.number()),
    failCount: v.optional(v.number()),
    finishedAt: v.optional(v.string()),
    passCount: v.optional(v.number()),
    resultsJson: v.optional(v.string()),
    scanId: v.id("scans"),
    score: v.optional(v.number()),
    secret: v.string(),
    status: scanStatusValidator,
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const patch: Record<string, unknown> = { status: args.status };
    if (args.score !== undefined) {
      patch.score = args.score;
    }
    if (args.passCount !== undefined) {
      patch.passCount = args.passCount;
    }
    if (args.failCount !== undefined) {
      patch.failCount = args.failCount;
    }
    if (args.errorCount !== undefined) {
      patch.errorCount = args.errorCount;
    }
    if (args.resultsJson !== undefined) {
      patch.resultsJson = args.resultsJson;
    }
    if (args.error !== undefined) {
      patch.error = args.error;
    }
    if (args.finishedAt !== undefined) {
      patch.finishedAt = args.finishedAt;
    }

    await ctx.db.patch("scans", args.scanId, patch);
    const doc = await ctx.db.get("scans", args.scanId);
    if (!doc) {
      throw new Error("Scan not found");
    }
    return toScanResponse(doc);
  },
});

export const listForBusiness = query({
  args: {
    businessExternalId: v.string(),
    limit: v.optional(v.number()),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const limit = args.limit ?? 12;
    const rows = await ctx.db
      .query("scans")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();

    return rows
      .toSorted((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit)
      .map(toScanSummary);
  },
});

export const getLatestComplete = query({
  args: { businessExternalId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("scans")
      .withIndex("by_businessExternalId", (q) =>
        q.eq("businessExternalId", args.businessExternalId)
      )
      .collect();

    const complete = rows
      .filter((row) => row.status === "complete")
      .toSorted((left, right) =>
        (right.finishedAt ?? "").localeCompare(left.finishedAt ?? "")
      );

    const [latest] = complete;
    if (!latest) {
      return null;
    }
    return {
      finishedAt: latest.finishedAt ?? null,
      score: latest.score ?? null,
    };
  },
});

export const listDueEntitlements = internalQuery({
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
      }));
  },
  returns: v.array(
    v.object({
      businessExternalId: v.string(),
      id: v.id("entitlements"),
    })
  ),
});

export const runDue = internalAction({
  args: {},
  handler: async (ctx): Promise<{ failed: number; ran: number }> => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      throw new Error("INTERNAL_API_SECRET is not configured");
    }

    const due: {
      businessExternalId: string;
      id: Id<"entitlements">;
    }[] = await ctx.runQuery(internal.scans.listDueEntitlements, {
      limit: 5,
      nowIso: nowIso(),
    });

    const outcomes: boolean[] = await Promise.all(
      due.map(async (entitlement) => {
        try {
          const response = await fetch(
            `${siteUrl()}/api/internal/scans/run-one`,
            {
              body: JSON.stringify({
                businessId: entitlement.businessExternalId,
                entitlementId: entitlement.id,
              }),
              headers: {
                authorization: `Bearer ${secret}`,
                "content-type": "application/json",
              },
              method: "POST",
            }
          );
          return response.ok;
        } catch {
          return false;
        }
      })
    );

    return {
      failed: outcomes.filter((ok: boolean) => !ok).length,
      ran: due.length,
    };
  },
  returns: v.object({
    failed: v.number(),
    ran: v.number(),
  }),
});
