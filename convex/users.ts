import { v } from "convex/values";

import { components } from "./_generated/api";
import { action, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireInternalSecret } from "./lib/internal";

export const findIdByEmail = query({
  args: { email: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    requireInternalSecret(args.secret);
    const normalized = args.email.trim().toLowerCase();
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: normalized }],
    });
    if (!user || typeof user !== "object" || !("_id" in user)) {
      return null;
    }
    const id = user._id;
    return typeof id === "string" ? id : null;
  },
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
