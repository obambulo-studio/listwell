import { z } from "zod";

import { parseDocument, parseJsonLd } from "../html";
import type { HtmlDocument } from "../html";

export const listingEvidenceSchema = z.object({
  address: z.string().optional(),
  category: z.string().optional(),
  fetchReason: z.string().optional(),
  fetched: z.boolean(),
  hours: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  photoCount: z.number().int().nonnegative().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  sourceUrl: z.string(),
  website: z.string().optional(),
});

export type ListingEvidence = z.infer<typeof listingEvidenceSchema>;

export const isHttpUrl = (
  value: string | null | undefined
): value is string => {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const hostOf = (value: string): string | null => {
  try {
    return new URL(value).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return null;
  }
};

export const urlsMatch = (
  left: string | null | undefined,
  right: string | null | undefined
): boolean => {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const leftHost = hostOf(left);
  const rightHost = hostOf(right);
  return Boolean(leftHost && rightHost && leftHost === rightHost);
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return { ...value };
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

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const formatPostalAddress = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  const address = toRecord(value);
  if (!address) {
    return undefined;
  }
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ].filter(
    (part): part is string => typeof part === "string" && part.length > 0
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
};

const flattenJsonLd = (blocks: unknown[]): Record<string, unknown>[] => {
  const records: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const record = toRecord(block);
    if (!record) {
      continue;
    }
    records.push(record);
    const graph = record["@graph"];
    let items: unknown[] = [];
    if (Array.isArray(graph)) {
      items = graph;
    } else if (graph) {
      items = [graph];
    }
    for (const item of items) {
      const nested = toRecord(item);
      if (nested) {
        records.push(nested);
      }
    }
  }
  return records;
};

const isLocalBusiness = (record: Record<string, unknown>): boolean =>
  typeIncludes(record["@type"], "LocalBusiness") ||
  typeIncludes(record["@type"], "Organization") ||
  typeIncludes(record["@type"], "Restaurant") ||
  typeIncludes(record["@type"], "Store");

const hoursFromValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => {
      if (typeof item === "string") {
        return [item];
      }
      const record = toRecord(item);
      if (!record) {
        return [];
      }
      const days = readString(record.dayOfWeek);
      const opens = readString(record.opens);
      const closes = readString(record.closes);
      if (opens && closes) {
        const label = [days, `${opens}-${closes}`].filter(Boolean).join(" ");
        return label ? [label] : [];
      }
      return [];
    });
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  return undefined;
};

const typeLabel = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.replace(/^https?:\/\/schema\.org\//u, "");
  }
  if (Array.isArray(value)) {
    const first = value.find(
      (item): item is string => typeof item === "string"
    );
    return first ? first.replace(/^https?:\/\/schema\.org\//u, "") : undefined;
  }
  return undefined;
};

const evidenceFromJsonLd = (
  document: HtmlDocument
): Partial<ListingEvidence> => {
  const records = flattenJsonLd(parseJsonLd(document));
  const found: Partial<ListingEvidence> = {};

  for (const record of records) {
    if (!isLocalBusiness(record) && !found.name) {
      continue;
    }

    found.name ??= readString(record.name);
    found.phone ??= readString(record.telephone);
    found.address ??= formatPostalAddress(record.address);
    found.hours ??= hoursFromValue(
      record.openingHours ?? record.openingHoursSpecification
    );
    found.website ??= readString(record.url);
    found.category ??= typeLabel(record["@type"]);

    const rating = toRecord(record.aggregateRating);
    if (rating) {
      found.rating ??= readNumber(rating.ratingValue);
      found.reviewCount ??= readNumber(
        rating.reviewCount ?? rating.ratingCount
      );
    }

    const images = record.image;
    if (typeof images === "string") {
      found.photoCount = Math.max(found.photoCount ?? 0, 1);
    }
    if (Array.isArray(images)) {
      found.photoCount = Math.max(found.photoCount ?? 0, images.length);
    }
  }

  return found;
};

const VISIBLE_PHONE = /(?:\+?61|0)[\s()-]*[2-478](?:[\s()-]*\d){8}/u;
const VISIBLE_HOURS =
  /\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/iu;

const visiblePhone = (document: HtmlDocument): string | undefined => {
  const tel = document.querySelector('a[href^="tel:"]')?.getAttribute("href");
  if (tel?.startsWith("tel:")) {
    const number = tel.slice(4).trim();
    if (number) {
      return number;
    }
  }
  const text = document.body?.textContent ?? "";
  return text.match(VISIBLE_PHONE)?.[0]?.replaceAll(/\s+/gu, " ");
};

const visibleHours = (document: HtmlDocument): string | undefined => {
  const text = document.body?.textContent?.replaceAll(/\s+/gu, " ") ?? "";
  const match = text.match(VISIBLE_HOURS);
  return match?.[0];
};

const visibleWebsite = (
  document: HtmlDocument,
  sourceUrl: string
): string | undefined => {
  const canonical = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  if (canonical && isHttpUrl(canonical)) {
    return canonical;
  }
  const og = document
    .querySelector('meta[property="og:url"]')
    ?.getAttribute("content");
  if (og && isHttpUrl(og)) {
    return og;
  }
  return isHttpUrl(sourceUrl) ? sourceUrl : undefined;
};

const photoCountFromDom = (document: HtmlDocument): number => {
  const og = document.querySelector('meta[property="og:image"]') ? 1 : 0;
  const images = document.querySelectorAll("img").filter((image) => {
    const src = image.getAttribute("src") ?? "";
    if (!src || src.startsWith("data:")) {
      return false;
    }
    const width = Number(image.getAttribute("width") ?? "0");
    const height = Number(image.getAttribute("height") ?? "0");
    if (width && height && (width < 80 || height < 80)) {
      return false;
    }
    return !/sprite|icon|logo|pixel|tracking/iu.test(src);
  }).length;
  return og + images;
};

export const evidenceFromHtml = (
  html: string,
  sourceUrl: string
): ListingEvidence => {
  const document = parseDocument(html);
  const fromLd = evidenceFromJsonLd(document);
  let photos = photoCountFromDom(document);
  if (fromLd.photoCount && fromLd.photoCount > 0) {
    photos = fromLd.photoCount;
  }

  return listingEvidenceSchema.parse({
    address: fromLd.address,
    category: fromLd.category,
    fetched: true,
    hours: fromLd.hours ?? visibleHours(document),
    name: fromLd.name,
    phone: fromLd.phone ?? visiblePhone(document),
    photoCount: photos > 0 ? photos : undefined,
    rating: fromLd.rating,
    reviewCount: fromLd.reviewCount,
    sourceUrl,
    website: fromLd.website ?? visibleWebsite(document, sourceUrl),
  });
};

export const emptyEvidence = (
  sourceUrl: string,
  fetchReason: string
): ListingEvidence =>
  listingEvidenceSchema.parse({
    fetchReason,
    fetched: false,
    sourceUrl,
  });

export const firstListingUrl = (
  locations: { googlePlaceId?: string | null }[]
): string | null => {
  for (const location of locations) {
    if (isHttpUrl(location.googlePlaceId)) {
      return location.googlePlaceId;
    }
  }
  return null;
};

export const hasAttachedListing = (
  locations: { googlePlaceId?: string | null }[]
): boolean => locations.some((location) => Boolean(location.googlePlaceId));

export const normalizePhoneDigits = (value: string): string =>
  value.replaceAll(/\D/gu, "");

export const phonesMatch = (
  left: string | undefined,
  right: string | undefined
): boolean => {
  if (!left || !right) {
    return false;
  }
  const a = normalizePhoneDigits(left);
  const b = normalizePhoneDigits(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8));
};

export const addressPartsMatch = (
  expected: string,
  pageText: string
): boolean => {
  const significant: string[] = [];
  for (const part of expected.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed.length > 3) {
      significant.push(trimmed);
    }
  }
  if (significant.length === 0) {
    return pageText.includes(expected.toLowerCase());
  }
  const hits = significant.filter((part) => {
    if (pageText.includes(part)) {
      return true;
    }
    const words = part.split(/\s+/u).filter((word) => word.length > 3);
    return words.some((word) => pageText.includes(word));
  }).length;
  return hits / significant.length >= 0.7;
};
