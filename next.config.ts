import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["listwell.localhost", "*.listwell.localhost"],
  transpilePackages: ["@listwell/audit-engine"],
  typedRoutes: true,
};

export default nextConfig;

if (process.env.NODE_ENV !== "production" && process.env.SKIP_OPENNEXT_DEV !== "1") {
  void initOpenNextCloudflareForDev();
}
