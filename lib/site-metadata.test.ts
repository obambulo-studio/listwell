import { afterEach, describe, expect, it } from "vitest";

import {
  isFileLikePathId,
  listwellSiteUrl,
  robotsDirectives,
  sitemapEntries,
} from "./site-metadata";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalConvexSiteUrl = process.env.SITE_URL;

const restoreSiteUrlEnv = () => {
  if (originalSiteUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
  if (originalConvexSiteUrl === undefined) {
    delete process.env.SITE_URL;
  } else {
    process.env.SITE_URL = originalConvexSiteUrl;
  }
};

describe("site metadata", () => {
  afterEach(restoreSiteUrlEnv);

  describe(listwellSiteUrl, () => {
    it("uses NEXT_PUBLIC_SITE_URL and strips a trailing slash", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://listwell.dev/";
      expect(listwellSiteUrl()).toBe("https://listwell.dev");
    });

    it("falls back to the apex origin", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.SITE_URL;
      expect(listwellSiteUrl()).toBe("https://listwell.dev");
    });

    it("rejects an invalid URL", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "not-a-url";
      expect(() => listwellSiteUrl()).toThrow(/Invalid URL/u);
    });
  });

  describe(isFileLikePathId, () => {
    it("treats crawler files as reserved so app/[id] never looks them up", () => {
      expect(isFileLikePathId("robots.txt")).toBeTruthy();
      expect(isFileLikePathId("sitemap.xml")).toBeTruthy();
      expect(isFileLikePathId("favicon.ico")).toBeTruthy();
    });

    it("allows UUID report ids", () => {
      expect(
        isFileLikePathId("2f1c0a6e-4b8d-4f3a-9c1e-7a0b5d8e1234")
      ).toBeFalsy();
    });
  });

  describe(robotsDirectives, () => {
    it("allows the site and points crawlers at the sitemap", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://listwell.dev";
      expect(robotsDirectives()).toStrictEqual({
        host: "listwell.dev",
        rules: {
          allow: "/",
          disallow: ["/account", "/api/"],
          userAgent: "*",
        },
        sitemap: "https://listwell.dev/sitemap.xml",
      });
    });
  });

  describe(sitemapEntries, () => {
    it("lists the public marketing pages", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://listwell.dev";
      expect(sitemapEntries().map((entry) => entry.url)).toStrictEqual([
        "https://listwell.dev/",
        "https://listwell.dev/discover",
        "https://listwell.dev/new",
        "https://listwell.dev/sign-in",
      ]);
    });
  });
});
