import robotsParser from "robots-parser";

import { fetchErrorResult, noWebsiteResult } from "../context";
import type { CheckContext } from "../context";
import { parseJsonLd } from "../html";
import { addressPartsMatch, phonesMatch } from "../lookups/listing-evidence";
import { checkResult } from "../schemas";
import type { CheckResult } from "../types";

export const checkWebsite200 = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const response = await ctx.getWebsiteResponse();
    return checkResult(
      response.ok,
      `${response.status} ${response.statusText}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsiteMetaDescription = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const metaDescription = document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content");
    if (!metaDescription) {
      return checkResult(false, "No meta description tag found on the website");
    }
    const isValidLength = metaDescription.length <= 160;
    return checkResult(
      isValidLength,
      isValidLength
        ? `Meta description present (${metaDescription.length} chars)`
        : `Meta description too long: ${metaDescription.length} chars (should be ≤ 160)`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsiteCanonical = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const canonicalLink = document
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href");
    if (!canonicalLink) {
      return checkResult(false, "No canonical link tag found on the website");
    }
    try {
      const parsedCanonical = new URL(canonicalLink);
      void parsedCanonical;
      return checkResult(true, `Canonical link found: ${canonicalLink}`);
    } catch {
      try {
        const resolvedUrl = new URL(
          canonicalLink,
          ctx.business.websiteUrl
        ).toString();
        return checkResult(
          true,
          `Canonical link found (relative): ${resolvedUrl}`
        );
      } catch {
        return checkResult(
          false,
          `Invalid canonical link format: ${canonicalLink}`
        );
      }
    }
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsiteRobots = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const websiteUrl = new URL(ctx.business.websiteUrl);
    const robotsUrl = `${websiteUrl.protocol}//${websiteUrl.host}/robots.txt`;
    const baseUrl = `${websiteUrl.protocol}//${websiteUrl.host}`;
    const fetched = await ctx.fetchText(robotsUrl);

    if (!fetched.ok) {
      if (fetched.status === 404) {
        return checkResult(
          true,
          "No robots.txt file found (homepage not blocked)"
        );
      }
      return checkResult(
        null,
        `Could not access robots.txt: ${fetched.status || "Unknown error"}`
      );
    }
    if (!fetched.body) {
      return checkResult(null, "Could not read robots.txt content");
    }

    const robots = robotsParser(robotsUrl, fetched.body);
    const mainSearchBots = [
      "Googlebot",
      "Bingbot",
      "Yandexbot",
      "DuckDuckBot",
      "Slurp",
    ];
    const homepageUrl = `${baseUrl}/`;
    const blockedBots = mainSearchBots.filter(
      (bot) => !robots.isAllowed(homepageUrl, bot)
    );
    const isAllowedForAll = robots.isAllowed(homepageUrl, "*");
    const isHomepageBlocked = !isAllowedForAll || blockedBots.length > 0;

    return checkResult(
      !isHomepageBlocked,
      isHomepageBlocked
        ? `robots.txt blocks the homepage for ${blockedBots.length > 0 ? blockedBots.join(", ") : "all bots"}`
        : "robots.txt does not block the homepage for main search engines"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching robots.txt");
  }
};

const looksLikeSitemap = (content: string): boolean => {
  const trimmed = content.trim();
  return (
    trimmed.includes("<?xml") &&
    (trimmed.includes("<urlset") ||
      trimmed.includes("<sitemapindex") ||
      trimmed.includes("<sitemap>"))
  );
};

export const checkWebsiteSitemap = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const websiteUrl = new URL(ctx.business.websiteUrl);
    const baseUrl = `${websiteUrl.protocol}//${websiteUrl.host}`;
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/sitemaps.xml`,
      `${baseUrl}/sitemap1.xml`,
    ];

    let sitemapFound = false;
    let sitemapUrl = "";
    let foundViaRobots = false;

    const robots = await ctx.fetchText(`${baseUrl}/robots.txt`);
    if (robots.ok && robots.body) {
      const parsed = robotsParser(`${baseUrl}/robots.txt`, robots.body);
      const declared = parsed.getSitemaps();
      const [firstSitemap] = declared;
      if (firstSitemap) {
        const sitemap = await ctx.fetchText(firstSitemap);
        if (sitemap.ok && looksLikeSitemap(sitemap.body)) {
          sitemapFound = true;
          sitemapUrl = firstSitemap;
          foundViaRobots = true;
        }
      }
    }

    if (!sitemapFound) {
      const fetchedSitemaps = await Promise.all(
        sitemapUrls.map((url) => ctx.fetchText(url))
      );
      for (const [index, sitemap] of fetchedSitemaps.entries()) {
        if (sitemap.ok && looksLikeSitemap(sitemap.body)) {
          sitemapFound = true;
          sitemapUrl = sitemapUrls[index] ?? "";
          break;
        }
      }
    }

    if (sitemapFound) {
      const sitemapPath = sitemapUrl.replace(baseUrl, "");
      return checkResult(
        true,
        foundViaRobots
          ? `XML sitemap found via robots.txt: ${sitemapPath}`
          : `XML sitemap found at: ${sitemapPath}`
      );
    }
    return checkResult(
      false,
      "No XML sitemap found at common locations (/sitemap.xml, robots.txt)"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error checking sitemap");
  }
};

export const checkWebsiteOgImage = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const imageUrl =
      document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content") ??
      document
        .querySelector('meta[property="og:image:url"]')
        ?.getAttribute("content") ??
      document
        .querySelector('meta[name="twitter:image"]')
        ?.getAttribute("content");

    if (!imageUrl) {
      return checkResult(false, "No Open Graph image tag found");
    }

    try {
      const resolved = imageUrl.startsWith("http")
        ? new URL(imageUrl)
        : new URL(imageUrl, ctx.business.websiteUrl);
      void resolved;
      return checkResult(
        true,
        `Open Graph image found: ${imageUrl.slice(0, 50)}${imageUrl.length > 50 ? "..." : ""}`
      );
    } catch {
      return checkResult(false, `Invalid Open Graph image URL: ${imageUrl}`);
    }
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsitePerformance = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const cruxResult = await ctx.fetchCrux(ctx.business.websiteUrl);
    if (cruxResult.lcp !== undefined) {
      return checkResult(cruxResult.passes ?? false, cruxResult.message);
    }
    const pageSpeedResult = await ctx.fetchPageSpeed(ctx.business.websiteUrl);
    if (pageSpeedResult.lcp !== undefined) {
      return checkResult(
        pageSpeedResult.passes ?? false,
        pageSpeedResult.message
      );
    }
    const synthetic = await ctx.measurePerformance(ctx.business.websiteUrl);
    if (synthetic.lcp !== undefined) {
      return checkResult(synthetic.passes ?? false, synthetic.message);
    }
    return checkResult(null, synthetic.message);
  } catch (error) {
    return checkResult(
      null,
      `Performance check failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

const responsiveFrameworkLabel = (html: string): string => {
  if (html.includes("tailwind")) {
    return " (using Tailwind CSS)";
  }
  if (html.includes("bootstrap")) {
    return " (using Bootstrap)";
  }
  if (html.includes("foundation")) {
    return " (using Foundation)";
  }
  if (html.includes("bulma")) {
    return " (using Bulma)";
  }
  return "";
};

const mobileResponsiveDetails = (
  isResponsive: boolean,
  hasDeviceWidth: boolean,
  html: string
): string => {
  if (isResponsive) {
    return `Site appears mobile-responsive${responsiveFrameworkLabel(html)}`;
  }
  if (hasDeviceWidth) {
    return "Has viewport tag but limited responsive indicators";
  }
  return "Missing proper viewport configuration for responsive design";
};

export const checkWebsiteMobileResponsive = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const html = await ctx.getWebsiteHtml();
    const document = await ctx.getWebsiteDocument();
    const viewportTag = document
      .querySelector('meta[name="viewport"]')
      ?.getAttribute("content");
    if (!viewportTag) {
      return checkResult(
        false,
        "No viewport meta tag found - site likely not mobile-responsive"
      );
    }

    const hasDeviceWidth = viewportTag
      .toLowerCase()
      .includes("width=device-width");
    const hasMediaQueries =
      html.includes("@media") ||
      html.includes("min-width") ||
      html.includes("max-width");
    const hasFlexboxOrGrid =
      html.includes("display: flex") ||
      html.includes("display:flex") ||
      html.includes("display: grid") ||
      html.includes("display:grid");
    const hasResponsiveFramework =
      html.includes("bootstrap") ||
      html.includes("tailwind") ||
      html.includes("foundation") ||
      html.includes("bulma");
    const isResponsive =
      hasDeviceWidth &&
      (hasMediaQueries || hasFlexboxOrGrid || hasResponsiveFramework);

    const details = mobileResponsiveDetails(isResponsive, hasDeviceWidth, html);

    return checkResult(isResponsive, details);
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsiteTelLink = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const telLinks = document.querySelectorAll('a[href^="tel:"]');
    return checkResult(
      telLinks.length > 0,
      telLinks.length > 0
        ? `Found ${telLinks.length} click-to-call link(s) on the website`
        : "No click-to-call telephone links found on the website"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

const ADDRESS_SELECTORS = [
  "footer",
  ".footer",
  "#footer",
  "header",
  ".header",
  "#header",
  ".contact",
  "#contact",
  ".contact-info",
  "#contact-info",
  ".address",
  "#address",
  '[itemprop="address"]',
  ".location",
  "#location",
  ".store-info",
  "#store-info",
  ".about",
  "#about",
];

const ADDRESS_PATTERNS = [
  /\d+\s+[A-Za-z0-9\s,]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|plaza|plz|square|sq|highway|hwy|parkway|pkwy)/iu,
  /P\.?O\.?\s*Box\s+\d+/iu,
  /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/iu,
  /\d{5}(?:-\d{4})?/iu,
  /[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s*\d[ABCEGHJ-NPRSTV-Z]\d/iu,
];

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    record[key] = nestedValue;
  }
  return record;
};

const nestedAddress = (value: unknown): unknown => toRecord(value)?.address;

const formatPostalAddress = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  const address = toRecord(value);
  if (!address) {
    return null;
  }
  if (typeof address.streetAddress !== "string") {
    return null;
  }
  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0
    )
    .join(", ");
};

const readAddress = (data: object): string | null => {
  const record = toRecord(data);
  if (!record) {
    return null;
  }
  const direct =
    record.address ??
    nestedAddress(record.location) ??
    nestedAddress(record.mainEntity);
  if (typeof direct === "string") {
    return direct;
  }
  const fromObject = formatPostalAddress(direct);
  if (fromObject) {
    return fromObject;
  }

  const graph = record["@graph"];
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const formatted = formatPostalAddress(toRecord(item)?.address);
      if (formatted) {
        return formatted;
      }
    }
  }
  return null;
};

const addressFromJsonLd = (blocks: unknown[]): string | null => {
  for (const data of blocks) {
    if (!data || typeof data !== "object") {
      continue;
    }
    const record = data;
    const address = readAddress(record);
    if (address) {
      return address;
    }
  }
  return null;
};

const graphItems = (graph: unknown): unknown[] => {
  if (Array.isArray(graph)) {
    return graph;
  }
  if (graph) {
    return [graph];
  }
  return [];
};

export const checkWebsitePhysicalAddress = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    let addressFound = false;
    let addressText = "";

    for (const selector of ADDRESS_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      const text = elements
        .map((el) => el.textContent ?? "")
        .join(" ")
        .trim();
      for (const pattern of ADDRESS_PATTERNS) {
        const match = text.match(pattern);
        const [matched] = match ?? [];
        if (matched) {
          addressFound = true;
          addressText = matched;
          break;
        }
      }
      if (addressFound) {
        break;
      }
    }

    if (!addressFound) {
      const bodyText = document.body?.textContent ?? "";
      for (const pattern of ADDRESS_PATTERNS) {
        const match = bodyText.match(pattern);
        const [matched] = match ?? [];
        if (matched) {
          addressFound = true;
          addressText = matched;
          break;
        }
      }
    }

    if (!addressFound) {
      const fromLd = addressFromJsonLd(parseJsonLd(document));
      if (fromLd) {
        addressFound = true;
        addressText = fromLd;
      }
    }

    return checkResult(
      addressFound,
      addressFound
        ? `Physical address found: ${addressText}`
        : "No physical address found on website"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error checking for physical address");
  }
};

const typeIncludes = (value: unknown, needle: string): boolean => {
  if (typeof value === "string") {
    return value === needle || value.includes(needle);
  }
  if (Array.isArray(value)) {
    return value.some(
      (item) =>
        typeof item === "string" && (item === needle || item.includes(needle))
    );
  }
  return false;
};

export const checkWebsiteLocalBusinessJsonLd = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const blocks = parseJsonLd(document);
    if (blocks.length === 0) {
      return checkResult(false, "No JSON-LD scripts found on website");
    }

    for (const jsonContent of blocks) {
      const record = toRecord(jsonContent);
      if (!record) {
        continue;
      }
      if (
        typeIncludes(record["@type"], "LocalBusiness") ||
        typeIncludes(record["@type"], "Organization")
      ) {
        const typeLabel =
          typeof record["@type"] === "string"
            ? record["@type"]
            : "LocalBusiness";
        return checkResult(true, `Found ${typeLabel} schema`);
      }
      const graph = record["@graph"];
      const items = graphItems(graph);
      for (const item of items) {
        const graphItem = toRecord(item);
        if (!graphItem) {
          continue;
        }
        if (
          typeIncludes(graphItem["@type"], "LocalBusiness") ||
          typeIncludes(graphItem["@type"], "Organization")
        ) {
          const typeLabel =
            typeof graphItem["@type"] === "string"
              ? graphItem["@type"]
              : "LocalBusiness";
          return checkResult(true, `Found ${typeLabel} schema in @graph`);
        }
      }
    }

    return checkResult(
      false,
      "No LocalBusiness or Organization JSON-LD schema found"
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

export const checkWebsiteMenuJsonLd = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const document = await ctx.getWebsiteDocument();
    const blocks = parseJsonLd(document);
    if (blocks.length === 0) {
      return checkResult(false, "No JSON-LD scripts found on website");
    }

    for (const jsonContent of blocks) {
      const record = toRecord(jsonContent);
      if (!record) {
        continue;
      }
      if (typeIncludes(record["@type"], "Menu")) {
        return checkResult(true, "Found Menu schema");
      }
      if (
        typeIncludes(record["@type"], "Restaurant") &&
        (record.hasMenu || record.hasMenuSection || record.menu)
      ) {
        return checkResult(true, "Found Restaurant schema with menu data");
      }
      const graph = record["@graph"];
      const items = graphItems(graph);
      for (const item of items) {
        const graphItem = toRecord(item);
        if (!graphItem) {
          continue;
        }
        if (typeIncludes(graphItem["@type"], "Menu")) {
          return checkResult(true, "Found Menu schema in @graph");
        }
        if (
          typeIncludes(graphItem["@type"], "Restaurant") &&
          (graphItem.hasMenu || graphItem.hasMenuSection || graphItem.menu)
        ) {
          return checkResult(
            true,
            "Found Restaurant schema with menu data in @graph"
          );
        }
      }
    }

    return checkResult(false, "No Menu JSON-LD schema found");
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};

interface NapFields {
  name: string;
  address: string;
  phone: string;
}

const pageTextFromDocument = (
  document: Awaited<ReturnType<CheckContext["getWebsiteDocument"]>>
): string =>
  document.body?.textContent?.toLowerCase().replaceAll(/\s+/gu, " ").trim() ??
  "";

const napMatchResult = (
  fields: NapFields,
  pageText: string,
  options: {
    addressMatcher?: (address: string, text: string) => boolean;
    phoneMatcher?: (phone: string, text: string) => boolean;
    passLabel: string;
    failLabel: string;
  }
): CheckResult => {
  const results: string[] = [];
  let nameFound = false;
  let addressFound = false;
  let phoneFound = false;

  if (fields.name) {
    nameFound = pageText.includes(fields.name.toLowerCase());
    results.push(`Name ${nameFound ? "found" : "missing"}`);
  }
  if (fields.address) {
    const addressMatcher =
      options.addressMatcher ??
      ((address, text) => {
        const significantParts: string[] = [];
        for (const part of address.split(",")) {
          const trimmed = part.trim().toLowerCase();
          if (trimmed.length > 3) {
            significantParts.push(trimmed);
          }
        }
        if (significantParts.length === 0) {
          return false;
        }
        const foundParts = significantParts.filter((part) =>
          text.includes(part)
        );
        return foundParts.length / significantParts.length >= 0.7;
      });
    addressFound = addressMatcher(fields.address, pageText);
    results.push(`Address ${addressFound ? "found" : "missing"}`);
  }
  if (fields.phone) {
    const phoneMatcher =
      options.phoneMatcher ??
      ((phone, text) => {
        const normalizedPhone = phone.replaceAll(/\D/gu, "");
        return (
          text.includes(phone) ||
          text.includes(normalizedPhone) ||
          new RegExp(
            normalizedPhone.replace(
              /(?<area>\d{3})(?<prefix>\d{3})(?<line>\d{4})/u,
              "\\(?$1\\)?[\\s.-]*$2[\\s.-]*$3"
            ),
            "u"
          ).test(text)
        );
      });
    phoneFound = phoneMatcher(fields.phone, pageText);
    results.push(`Phone ${phoneFound ? "found" : "missing"}`);
  }

  const componentsToCheck = [fields.name, fields.address, fields.phone].filter(
    Boolean
  ).length;
  const foundComponents = [
    fields.name && nameFound,
    fields.address && addressFound,
    fields.phone && phoneFound,
  ].filter(Boolean).length;
  const matchPercentage =
    componentsToCheck > 0 ? foundComponents / componentsToCheck : 0;
  const passes = matchPercentage >= 0.7;
  const summary = results.join(", ");
  return checkResult(
    passes,
    passes
      ? `${options.passLabel} (${summary})`
      : `${options.failLabel} (${summary})`
  );
};

const checkGbpNapFromPlace = async (
  ctx: CheckContext,
  place: NonNullable<Awaited<ReturnType<CheckContext["getGooglePlace"]>>>
): Promise<CheckResult> => {
  const fields: NapFields = {
    address: place.formattedAddress ?? "",
    name: place.displayName?.text ?? "",
    phone: place.nationalPhoneNumber ?? "",
  };
  if (!fields.name && !fields.address && !fields.phone) {
    return checkResult(
      false,
      "No NAP information found in Google Business Profile"
    );
  }
  const document = await ctx.getWebsiteDocument();
  return napMatchResult(fields, pageTextFromDocument(document), {
    failLabel: "NAP consistency check failed",
    passLabel: "NAP consistency check passed",
  });
};

const checkGbpNapFromListing = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  const listing = await ctx.getListingEvidence();
  if (listing.sourceUrl && !listing.fetched) {
    return checkResult(
      null,
      `Listing page could not be read: ${listing.fetchReason ?? "unknown error"}`
    );
  }

  const expectedName =
    listing.fetched && listing.name ? listing.name : ctx.business.name;
  const expectedAddress =
    listing.fetched && listing.address
      ? listing.address
      : (ctx.business.locations.find((location) => location.address)?.address ??
        "");
  const expectedPhone = listing.fetched ? (listing.phone ?? "") : "";
  const source = listing.fetched
    ? "pasted listing page"
    : "typed business details";

  if (!expectedName && !expectedAddress && !expectedPhone) {
    return checkResult(
      null,
      "No listing URL or typed name and address to compare with the website"
    );
  }

  const document = await ctx.getWebsiteDocument();
  const pageText = pageTextFromDocument(document);
  const website = await ctx.getWebsiteEvidence();
  return napMatchResult(
    {
      address: expectedAddress,
      name: expectedName,
      phone: expectedPhone,
    },
    pageText,
    {
      addressMatcher: (address, text) => addressPartsMatch(address, text),
      failLabel: `NAP does not match the ${source}`,
      passLabel: `NAP matches the ${source}`,
      phoneMatcher: (phone, text) =>
        phonesMatch(phone, website.phone) || text.includes(phone.toLowerCase()),
    }
  );
};

export const checkWebsiteGbpNap = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }
  try {
    const place = await ctx.getGooglePlace();
    if (place) {
      return await checkGbpNapFromPlace(ctx, place);
    }
    return await checkGbpNapFromListing(ctx);
  } catch (error) {
    return fetchErrorResult(error, "Error checking NAP consistency");
  }
};
