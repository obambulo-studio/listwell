import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { z } from "zod";

const productionPublicEnvSchema = z.object({
  NEXT_PUBLIC_CONVEX_SITE_URL: z.string().min(1),
  NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().min(1),
});

const productionPublicEnv = productionPublicEnvSchema.parse({
  NEXT_PUBLIC_CONVEX_SITE_URL: "https://hallowed-mallard-135.convex.site",
  NEXT_PUBLIC_CONVEX_URL: "https://hallowed-mallard-135.convex.cloud",
  NEXT_PUBLIC_SITE_URL: "https://listwell.dev",
});

for (const [key, value] of Object.entries(productionPublicEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["listwell.localhost", "*.listwell.localhost"],
  transpilePackages: ["@listwell/audit-engine"],
  typedRoutes: true,
};

export default nextConfig;

if (
  process.env.NODE_ENV !== "production" &&
  process.env.SKIP_OPENNEXT_DEV !== "1"
) {
  void initOpenNextCloudflareForDev();
}
