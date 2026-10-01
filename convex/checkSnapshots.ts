import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireInternalSecret } from "./lib/internal";
import { selectReusableSnapshot } from "./lib/scanFreshness";
import type { SnapshotStatus } from "./lib/scanFreshness";

const RECENT_SNAPSHOT_LIMIT = 8;
const MAX_PAYLOAD_CHARS = 400_000;

const snapshotStatusValidator = v.union(
  v.literal("running"),
  v.literal("complete"),
  v.literal("error")
);

const storedSnapshotValidator = v.object({
  finishedAt: v.union(v.string(), v.null()),
  payloadJson: v.union(v.string(), v.null()),
  snapshotId: v.string(),
  startedAt: v.string(),
  status: snapshotStatusValidator,
});

const claimResultValidator = v.object({
  action: v.union(v.literal("reuse"), v.literal("run")),
  snapshot: storedSnapshotValidator,
});

interface SnapshotDoc {
  _id: string;
  finishedAt?: string;
  payloadJson?: string;
  startedAt: string;
  status: SnapshotStatus;
}

const toStored = (doc: SnapshotDoc) => ({
  finishedAt: doc.finishedAt ?? null,
  payloadJson: doc.payloadJson ?? null,
  snapshotId: doc._id,
  startedAt: doc.startedAt,
  status: doc.status,
});

const claimResponse = (action: "reuse" | "run", doc: SnapshotDoc) => ({
  action,
  snapshot: toStored(doc),
});

export const claim = mutation({
  args: {
    fingerprint: v.string(),
    forceFresh: v.boolean(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("checkSnapshots")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .order("desc")
      .take(RECENT_SNAPSHOT_LIMIT);
    const reusable = selectReusableSnapshot({
      forceFresh: args.forceFresh,
      now: Date.now(),
      rows: rows.map((row) => ({
        finishedAt: row.finishedAt ?? null,
        row,
        startedAt: row.startedAt,
        status: row.status,
      })),
    });
    if (reusable) {
      return claimResponse("reuse", reusable.row);
    }

    const startedAt = new Date().toISOString();
    const id = await ctx.db.insert("checkSnapshots", {
      fingerprint: args.fingerprint,
      startedAt,
      status: "running",
    });
    const inserted = await ctx.db.get("checkSnapshots", id);
    if (!inserted) {
      throw new Error("Failed to claim check snapshot");
    }
    return claimResponse("run", inserted);
  },
  returns: claimResultValidator,
});

export const get = query({
  args: {
    secret: v.string(),
    snapshotId: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const id = ctx.db.normalizeId("checkSnapshots", args.snapshotId);
    if (!id) {
      return null;
    }
    const doc = await ctx.db.get("checkSnapshots", id);
    return doc ? toStored(doc) : null;
  },
  returns: v.union(storedSnapshotValidator, v.null()),
});

export const latest = query({
  args: {
    fingerprint: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const rows = await ctx.db
      .query("checkSnapshots")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", args.fingerprint))
      .order("desc")
      .take(RECENT_SNAPSHOT_LIMIT);
    return rows.map((row) => toStored(row));
  },
  returns: v.array(storedSnapshotValidator),
});

export const finish = mutation({
  args: {
    payloadJson: v.optional(v.string()),
    secret: v.string(),
    snapshotId: v.string(),
    status: v.union(v.literal("complete"), v.literal("error")),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    if (args.payloadJson && args.payloadJson.length > MAX_PAYLOAD_CHARS) {
      throw new Error("Check snapshot payload is too large");
    }
    const id = ctx.db.normalizeId("checkSnapshots", args.snapshotId);
    if (!id) {
      return null;
    }
    await ctx.db.patch("checkSnapshots", id, {
      finishedAt: new Date().toISOString(),
      payloadJson: args.payloadJson,
      status: args.status,
    });
    const doc = await ctx.db.get("checkSnapshots", id);
    return doc ? toStored(doc) : null;
  },
  returns: v.union(storedSnapshotValidator, v.null()),
});

export const publish = mutation({
  args: {
    fingerprint: v.string(),
    payloadJson: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    if (args.payloadJson.length > MAX_PAYLOAD_CHARS) {
      throw new Error("Check snapshot payload is too large");
    }
    const timestamp = new Date().toISOString();
    const id = await ctx.db.insert("checkSnapshots", {
      fingerprint: args.fingerprint,
      finishedAt: timestamp,
      payloadJson: args.payloadJson,
      startedAt: timestamp,
      status: "complete",
    });
    const doc = await ctx.db.get("checkSnapshots", id);
    if (!doc) {
      throw new Error("Failed to publish check snapshot");
    }
    return toStored(doc);
  },
  returns: storedSnapshotValidator,
});
