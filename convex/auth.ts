import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins/email-otp";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { sendSignInCode } from "./lib/email";

export const authComponent = createClient<DataModel>(components.betterAuth);

const authSiteUrl = (): string => {
  const url = process.env.SITE_URL;
  if (!url) {
    throw new Error("SITE_URL is not configured on Convex");
  }
  return url.replace(/\/$/u, "");
};

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: authSiteUrl(),
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: false,
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          const sent = await sendSignInCode(email, otp);
          if (!sent) {
            throw new Error("Could not send sign-in code");
          }
        },
      }),
      convex({ authConfig }),
    ],
  });

export const { getAuthUser } = authComponent.clientApi();
