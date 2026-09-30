import { v } from "convex/values";

import { components } from "./_generated/api";
import { action, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireInternalSecret } from "./lib/internal";
import { userSummaryValidator } from "./lib/response-validators";

const userIdFromEmail = async (
  ctx: QueryCtx,
  email: string
): Promise<string | null> => {
  const normalized = email.trim().toLowerCase();
  const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "email", value: normalized }],
  });
  if (!user || typeof user !== "object" || !("_id" in user)) {
    return null;
  }
  const id = user._id;
  return typeof id === "string" ? id : null;
};

export const findIdByEmail = query({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    return await userIdFromEmail(ctx, args.email);
  },
  returns: v.union(v.string(), v.null()),
});

export const findIdByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: (ctx, args) => userIdFromEmail(ctx, args.email),
  returns: v.union(v.string(), v.null()),
});

export const getById = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const user = await authComponent.getAnyUserById(ctx, args.userId);
    if (!user) {
      return null;
    }
    return {
      createdAt: new Date(user.createdAt).toISOString(),
      email: user.email,
      id: user._id,
    };
  },
  returns: v.union(userSummaryValidator, v.null()),
});

export const createSignInOtp = action({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const email = args.email.trim().toLowerCase();
    const auth = createAuth(ctx);
    const otp = await auth.api.createVerificationOTP({
      body: { email, type: "sign-in" },
    });
    if (typeof otp !== "string" || otp.length === 0) {
      throw new Error("Could not create a sign-in code");
    }
    return otp;
  },
  returns: v.string(),
});
