import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { z } from "zod";

const convexAuthEnvSchema = z.object({
  convexSiteUrl: z.string().min(1),
  convexUrl: z.string().min(1),
});

const convexAuthEnv = convexAuthEnvSchema.parse({
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
});

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexSiteUrl: convexAuthEnv.convexSiteUrl,
  convexUrl: convexAuthEnv.convexUrl,
});
