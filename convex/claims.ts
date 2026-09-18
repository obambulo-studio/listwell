import { v } from "convex/values";

import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";

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

export const claim = mutation({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
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
          (await entitlementAllowsClaim(ctx, externalId, user._id))
        ) {
          await ctx.db.patch("businesses", doc._id, {
            updatedAt: timestamp,
            userId: user._id,
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
