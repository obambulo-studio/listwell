import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: ["@listwell/audit-engine"],
};

export default nextConfig;

initOpenNextCloudflareForDev();
