import type { Metadata } from "next";
import { z } from "zod";

/** Tab title for the home page. Absolute, so the "%s · Listwell" template is not applied twice. */
export const LISTWELL_HOME_TITLE = "Listwell: fix your Google Business listing";

export const LISTWELL_TITLE_TEMPLATE = "%s · Listwell";

export const withListwellTitle = (title: string): string =>
  LISTWELL_TITLE_TEMPLATE.replace("%s", title);

const LISTWELL_OG_IMAGE_PATH = "/og.png";

const listwellOgImage = {
  alt: LISTWELL_HOME_TITLE,
  height: 630,
  url: LISTWELL_OG_IMAGE_PATH,
  width: 1200,
} as const;

/** Open Graph and Twitter card fields for one page. Relative URLs resolve against metadataBase. */
export const listwellSocialMetadata = ({
  description,
  pathname,
  title,
}: {
  description: string;
  pathname: string;
  title: string;
}): Pick<Metadata, "openGraph" | "twitter"> => ({
  openGraph: {
    description,
    images: [listwellOgImage],
    locale: "en_AU",
    siteName: "Listwell",
    title,
    type: "website",
    url: pathname,
  },
  twitter: {
    card: "summary_large_image",
    description,
    images: [LISTWELL_OG_IMAGE_PATH],
    title,
  },
});

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

export const robotsDirectives = (origin = listwellSiteUrl()) => ({
  host: new URL(origin).host,
  rules: {
    allow: "/",
    disallow: ["/account", "/api/"],
    userAgent: "*",
  },
  sitemap: `${origin}/sitemap.xml`,
});

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
      priority: 0.9,
      url: `${origin}/chat`,
    },
    {
      changeFrequency: "monthly" as const,
      priority: 0.7,
      url: `${origin}/example`,
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
    {
      changeFrequency: "yearly" as const,
      priority: 0.35,
      url: `${origin}/privacy`,
    },
    {
      changeFrequency: "yearly" as const,
      priority: 0.35,
      url: `${origin}/terms`,
    },
    {
      changeFrequency: "yearly" as const,
      priority: 0.35,
      url: `${origin}/refunds`,
    },
    {
      changeFrequency: "yearly" as const,
      priority: 0.35,
      url: `${origin}/how-it-works`,
    },
    {
      changeFrequency: "monthly" as const,
      priority: 0.4,
      url: `${origin}/llms.txt`,
    },
  ];
};

/** Root URL for resolving relative metadata URLs such as canonicals. */
export const listwellMetadataBase = (): URL => new URL(listwellSiteUrl());

/** Self-referencing canonical for a public page, resolved against metadataBase. */
export const canonicalFor = (pathname: string) => ({
  canonical: pathname,
});
