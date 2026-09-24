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
  headers() {
    return Promise.resolve([
      {
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
        source: "/:path*",
      },
    ]);
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { hostname: "**.googleusercontent.com" },
      { hostname: "**.gstatic.com" },
      { hostname: "**.apple-mapkit.com" },
      { hostname: "**.cdn-apple.com" },
    ],
  },
  poweredByHeader: false,
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
