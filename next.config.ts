import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { z } from "zod";

const wranglerPublicEnvSchema = z.object({
  vars: z
    .object({
      NEXT_PUBLIC_CONVEX_SITE_URL: z.string().min(1).optional(),
      NEXT_PUBLIC_CONVEX_URL: z.string().min(1).optional(),
      NEXT_PUBLIC_SITE_URL: z.string().min(1).optional(),
    })
    .passthrough(),
});

const parseJsonc = (text: string): unknown =>
  JSON.parse(
    text
      .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
      .replaceAll(/(?<prefix>^|[^:\\])\/\/.*$/gmu, "$<prefix>")
      .replaceAll(/,(?=\s*[}\]])/gu, "")
  );

const applyWranglerPublicEnv = (): void => {
  const wranglerPath = fileURLToPath(
    new URL("wrangler.open-next.jsonc", import.meta.url)
  );
  const wranglerFile = wranglerPublicEnvSchema.safeParse(
    parseJsonc(readFileSync(wranglerPath, "utf-8"))
  );
  if (!wranglerFile.success) {
    return;
  }

  const publicEnv = {
    NEXT_PUBLIC_CONVEX_SITE_URL:
      wranglerFile.data.vars.NEXT_PUBLIC_CONVEX_SITE_URL,
    NEXT_PUBLIC_CONVEX_URL: wranglerFile.data.vars.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_SITE_URL: wranglerFile.data.vars.NEXT_PUBLIC_SITE_URL,
  };

  for (const [key, value] of Object.entries(publicEnv)) {
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }
};

applyWranglerPublicEnv();

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
