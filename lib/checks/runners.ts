import robotsParser from "robots-parser";
import type { Business, CheckResult } from "../schema";
import { fetchText, fetchWebsite, readJsonLd, typeIncludes, type WebsiteSnapshot } from "../fetch-html";
import type { CheckRunner } from "./types";

function result(value: boolean | null, label?: string): CheckResult {
  return { type: "check", value, label };
}

async function withWebsite(
  business: Business,
  run: (snapshot: WebsiteSnapshot) => Promise<CheckResult> | CheckResult,
): Promise<CheckResult> {
  if (!business.websiteUrl) {
    return result(false, "No website URL provided");
  }
  try {
    const snapshot = await fetchWebsite(business.websiteUrl);
    return await run(snapshot);
  } catch (error) {
    return result(false, `Error fetching website: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

function websiteOrigin(url: string): { origin: string; homepage: string } {
  const parsed = new URL(url);
  return {
    origin: `${parsed.protocol}//${parsed.host}`,
    homepage: `${parsed.protocol}//${parsed.host}/`,
  };
}

const presence = (ok: boolean, missing: string): CheckResult => result(ok, ok ? undefined : missing);

export const runners: Record<string, CheckRunner> = {
  async website(business) {
    if (!business.websiteUrl) {
      return result(false, "No website URL provided");
    }
    const usesHttps = business.websiteUrl.startsWith("https://");
    return result(usesHttps, usesHttps ? "Website uses HTTPS" : `Website is not HTTPS: ${business.websiteUrl}`);
  },

  async "website-200-299"(business) {
    if (!business.websiteUrl) {
      return result(false, "No website URL provided");
    }
    try {
      const response = await fetch(business.websiteUrl, {
        redirect: "follow",
        headers: { "User-Agent": "ListwellSEO/1.0" },
      });
      return result(response.ok, `${response.status} ${response.statusText}`);
    } catch (error) {
      return result(false, `Error fetching website: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },

  async "website-title"(business) {
    return withWebsite(business, (snapshot) => {
      const title = snapshot.document.querySelector("title")?.textContent?.trim() ?? "";
      if (!title) {
        return result(false, "No title tag found on the website");
      }

      const titleLower = title.toLowerCase();
      const containsName = titleLower.includes(business.name.toLowerCase());
      if (!containsName) {
        return result(false, `Title missing business name: "${title}"`);
      }

      const location = business.locations.find((item) => item.address || item.name);
      if (!location?.address && !location?.name) {
        return result(true, `Title contains business name: "${title}"`);
      }

      const locationText = `${location.address ?? ""} ${location.name ?? ""}`.toLowerCase();
      const locationWords = locationText
        .replace(/[.,/#$!%^&*;:{}=\-_`~()]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 3);
      const containsLocation = locationWords.some((word) => titleLower.includes(word));
      return result(
        containsLocation,
        containsLocation
          ? `Title contains business name and location: "${title}"`
          : `Title missing location: "${title}"`,
      );
    });
  },

  async "website-meta-description"(business) {
    return withWebsite(business, (snapshot) => {
      const description = snapshot.document.querySelector('meta[name="description"]')?.getAttribute("content");
      if (!description) {
        return result(false, "No meta description tag found on the website");
      }
      const isValidLength = description.length <= 160;
      return result(
        isValidLength,
        isValidLength
          ? `Meta description present (${description.length} chars)`
          : `Meta description too long: ${description.length} chars (should be ≤ 160)`,
      );
    });
  },

  async "website-canonical"(business) {
    return withWebsite(business, (snapshot) => {
      const canonical = snapshot.document.querySelector('link[rel="canonical"]')?.getAttribute("href");
      if (!canonical) {
        return result(false, "No canonical link tag found on the website");
      }
      try {
        new URL(canonical, snapshot.url);
        return result(true, `Canonical link found: ${canonical}`);
      } catch {
        return result(false, `Invalid canonical link format: ${canonical}`);
      }
    });
  },

  async "website-og-image"(business) {
    return withWebsite(business, (snapshot) => {
      const imageUrl =
        snapshot.document.querySelector('meta[property="og:image"]')?.getAttribute("content") ??
        snapshot.document.querySelector('meta[property="og:image:url"]')?.getAttribute("content") ??
        snapshot.document.querySelector('meta[name="twitter:image"]')?.getAttribute("content");
      if (!imageUrl) {
        return result(false, "No Open Graph image tag found");
      }
      try {
        new URL(imageUrl, snapshot.url);
        const preview = imageUrl.length > 50 ? `${imageUrl.slice(0, 50)}...` : imageUrl;
        return result(true, `Open Graph image found: ${preview}`);
      } catch {
        return result(false, `Invalid Open Graph image URL: ${imageUrl}`);
      }
    });
  },

  async "website-tel-link"(business) {
    return withWebsite(business, (snapshot) => {
      const telLinks = snapshot.document.querySelectorAll('a[href^="tel:"]');
      return result(
        telLinks.length > 0,
        telLinks.length > 0
          ? `Found ${telLinks.length} click-to-call link(s) on the website`
          : "No click-to-call telephone links found on the website",
      );
    });
  },

  async "website-robots"(business) {
    if (!business.websiteUrl) {
      return result(false, "No website URL provided");
    }
    try {
      const { origin, homepage } = websiteOrigin(business.websiteUrl);
      const robotsUrl = `${origin}/robots.txt`;
      const robotsResponse = await fetchText(robotsUrl);
      if (robotsResponse.status === 404) {
        return result(true, "No robots.txt file found (homepage not blocked)");
      }
      if (!robotsResponse.ok) {
        return result(null, `Could not access robots.txt: ${robotsResponse.status}`);
      }
      const robots = robotsParser(robotsUrl, robotsResponse.text);
      const mainBots = ["Googlebot", "Bingbot", "Yandexbot", "DuckDuckBot", "Slurp"];
      const blockedBots = mainBots.filter((bot) => !robots.isAllowed(homepage, bot));
      const isAllowedForAll = robots.isAllowed(homepage, "*");
      const blocked = !isAllowedForAll || blockedBots.length > 0;
      return result(
        !blocked,
        !blocked
          ? "robots.txt does not block the homepage for main search engines"
          : `robots.txt blocks the homepage for ${blockedBots.length > 0 ? blockedBots.join(", ") : "all bots"}`,
      );
    } catch (error) {
      return result(false, `Error fetching robots.txt: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },

  async "website-sitemap"(business) {
    if (!business.websiteUrl) {
      return result(false, "No website URL provided");
    }
    try {
      const { origin } = websiteOrigin(business.websiteUrl);
      const robotsResponse = await fetchText(`${origin}/robots.txt`);
      const candidates: string[] = [
        `${origin}/sitemap.xml`,
        `${origin}/sitemap_index.xml`,
        `${origin}/sitemaps.xml`,
        `${origin}/sitemap1.xml`,
      ];
      if (robotsResponse.ok) {
        const robots = robotsParser(`${origin}/robots.txt`, robotsResponse.text);
        candidates.unshift(...robots.getSitemaps());
      }

      for (const sitemapUrl of candidates) {
        const sitemap = await fetchText(sitemapUrl);
        if (!sitemap.ok) {
          continue;
        }
        const content = sitemap.text.trim();
        if (content.includes("<?xml") && (content.includes("<urlset") || content.includes("<sitemapindex") || content.includes("<sitemap>"))) {
          return result(true, `XML sitemap found: ${sitemapUrl.replace(origin, "")}`);
        }
      }
      return result(false, "No XML sitemap found at common locations (/sitemap.xml, robots.txt)");
    } catch (error) {
      return result(false, `Error checking sitemap: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },

  async "website-physical-address"(business) {
    return withWebsite(business, (snapshot) => {
      const patterns = [
        /\d+\s+[A-Za-z0-9\s,]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|plaza|highway|parkway)/i,
        /P\.?O\.?\s*Box\s+\d+/i,
        /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i,
      ];
      const bodyText = snapshot.document.body?.textContent ?? "";
      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          return result(true, `Physical address found: ${match[0]}`);
        }
      }

      const nodes = readJsonLd(snapshot.document);
      for (const node of nodes) {
        const address = node.address;
        if (typeof address === "string" && address.length > 0) {
          return result(true, `Physical address found: ${address}`);
        }
        if (address && typeof address === "object" && "streetAddress" in address && typeof address.streetAddress === "string") {
          return result(true, `Physical address found: ${address.streetAddress}`);
        }
      }
      return result(false, "No physical address found on website");
    });
  },

  async "website-opening-hours"(business) {
    return withWebsite(business, (snapshot) => {
      const text = snapshot.document.body?.textContent ?? "";
      const hoursPattern =
        /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\s*[-–to]*\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/i;
      const sectionHint = /opening\s*hours|hours\s*of\s*operation|business\s*hours|trading\s*hours/i;
      if (hoursPattern.test(text) || sectionHint.test(text)) {
        return result(true, "Opening hours found on the website");
      }

      const attr = snapshot.document.querySelector("[itemprop='openingHours']")?.getAttribute("content");
      if (attr) {
        return result(true, `Opening hours found: ${attr}`);
      }

      const nodes = readJsonLd(snapshot.document);
      for (const node of nodes) {
        if (node.openingHours || node.openingHoursSpecification) {
          return result(true, "Opening hours found in structured data");
        }
      }
      return result(false, "No opening hours found on website");
    });
  },

  async "website-localbusiness-jsonld"(business) {
    return withWebsite(business, (snapshot) => {
      const nodes = readJsonLd(snapshot.document);
      if (nodes.length === 0) {
        return result(false, "No JSON-LD scripts found on website");
      }
      for (const node of nodes) {
        if (typeIncludes(node, "LocalBusiness") || typeIncludes(node, "Organization")) {
          const typeValue = node["@type"];
          const label = typeof typeValue === "string" ? typeValue : "structured";
          return result(true, `Found ${label} schema`);
        }
      }
      return result(false, "No LocalBusiness or Organization JSON-LD schema found");
    });
  },

  async "website-menu-jsonld"(business) {
    return withWebsite(business, (snapshot) => {
      const nodes = readJsonLd(snapshot.document);
      for (const node of nodes) {
        if (typeIncludes(node, "Menu") || typeIncludes(node, "MenuItem")) {
          return result(true, "Found menu structured data");
        }
      }
      return result(false, "No Menu or MenuItem JSON-LD schema found");
    });
  },

  async "google-listing"(business) {
    const hasPlace = business.locations.some((location) => Boolean(location.googlePlaceId));
    return presence(hasPlace, "No Google Business Profile linked");
  },

  async "facebook-page"(business) {
    return presence(Boolean(business.facebookUsername), "No Facebook page stored");
  },

  async "instagram-profile"(business) {
    return presence(Boolean(business.instagramUsername), "No Instagram profile stored");
  },

  async "tiktok-profile"(business) {
    return presence(Boolean(business.tiktokUsername), "No TikTok profile stored");
  },

  async "linkedin-profile"(business) {
    return presence(Boolean(business.linkedinUrl), "No LinkedIn profile stored");
  },

  async "youtube-profile"(business) {
    return presence(Boolean(business.youtubeUrl), "No YouTube channel stored");
  },

  async "uber-eats-listing"(business) {
    return presence(Boolean(business.uberEatsUrl), "No Uber Eats listing stored");
  },

  async "deliveroo-listing"(business) {
    return presence(Boolean(business.deliverooUrl), "No Deliveroo listing stored");
  },

  async "doordash-listing"(business) {
    return presence(Boolean(business.doorDashUrl), "No DoorDash listing stored");
  },

  async "menulog-listing"(business) {
    return presence(Boolean(business.menulogUrl), "No Menulog listing stored");
  },
};

export const PORTED_CHECK_IDS = Object.keys(runners);
