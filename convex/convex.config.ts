import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    INTERNAL_API_SECRET: v.string(),
    SITE_URL: v.string(),
    USESEND_API_KEY: v.string(),
    USESEND_BASE_URL: v.optional(v.string()),
    USESEND_FROM: v.string(),
  },
});
app.use(betterAuth);

export default app;
