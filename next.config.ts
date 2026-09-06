import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: ["@listwell/audit-engine"],
};

export default nextConfig;

if (process.env.NODE_ENV !== "production" && process.env.SKIP_OPENNEXT_DEV !== "1") {
  void initOpenNextCloudflareForDev();
}
