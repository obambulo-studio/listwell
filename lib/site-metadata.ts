import { z } from "zod";

const LISTWELL_APEX_ORIGIN = "https://listwell.dev";

const siteUrlSchema = z.url();

export const listwellSiteUrl = (): string => {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    LISTWELL_APEX_ORIGIN;
  return siteUrlSchema.parse(raw).replace(/\/$/u, "");
};

export const isFileLikePathId = (id: string): boolean => id.includes(".");

export const robotsDirectives = () => {
  const origin = listwellSiteUrl();
  return {
    host: new URL(origin).host,
    rules: {
      allow: "/",
      disallow: ["/account", "/api/"],
      userAgent: "*",
    },
    sitemap: `${origin}/sitemap.xml`,
  };
};

export const sitemapEntries = () => {
  const origin = listwellSiteUrl();
  return [
    {
      changeFrequency: "weekly" as const,
      priority: 1,
      url: `${origin}/`,
    },
    {
      changeFrequency: "weekly" as const,
      priority: 0.8,
      url: `${origin}/discover`,
    },
    {
      changeFrequency: "monthly" as const,
      priority: 0.6,
      url: `${origin}/new`,
    },
    {
      changeFrequency: "yearly" as const,
      priority: 0.3,
      url: `${origin}/sign-in`,
    },
  ];
};
