import { z } from "zod";

import type { FetchWebsiteOptions } from "../browser";
import { fetchWebsiteHtml } from "../browser";
import { parseDocument } from "../html";
import type { HtmlDocument } from "../html";
import type { BusinessSnapshot } from "../types";
import { isHttpUrl } from "./listing-evidence";

const DAY_MS = 86_400_000;
const FRESH_WEEK_DAYS = 7;
const FRESH_MONTH_DAYS = 30;
const FRESH_QUARTER_DAYS = 90;

export const FRESHNESS_PASS_SCORE = 50;

export type SocialNetwork =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "x";

export interface SocialProfileEvidence {
  avatarUrl?: string;
  bannerUrl?: string;
  /** Set when the page exposes a cover slot. Unset means the cover was not visible. */
  hasBanner?: boolean;
  label: string;
  latestPostAt?: string;
  network: SocialNetwork;
  /** False when a post date was not on the page. Missing dates are not treated as "no posts". */
  postKnown: boolean;
  readable: boolean;
  reason?: string;
  url: string;
}

const NETWORKS: {
  label: string;
  network: SocialNetwork;
  read: (business: BusinessSnapshot) => string | null | undefined;
}[] = [
  {
    label: "Facebook",
    network: "facebook",
    read: (business) => business.facebookUsername,
  },
  {
    label: "Instagram",
    network: "instagram",
    read: (business) => business.instagramUsername,
  },
  {
    label: "LinkedIn",
    network: "linkedin",
    read: (business) => business.linkedinUrl,
  },
  {
    label: "TikTok",
    network: "tiktok",
    read: (business) => business.tiktokUsername,
  },
  {
    label: "YouTube",
    network: "youtube",
    read: (business) => business.youtubeUrl,
  },
  {
    label: "X",
    network: "x",
    read: (business) => business.xUsername,
  },
];

const stripHandle = (value: string): string => value.trim().replace(/^@/u, "");

export const socialProfileUrl = (
  network: SocialNetwork,
  raw: string
): string | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (isHttpUrl(value)) {
    return value;
  }
  const handle = stripHandle(value);
  if (!handle) {
    return null;
  }
  if (network === "facebook") {
    return `https://www.facebook.com/${handle}/`;
  }
  if (network === "instagram") {
    return `https://www.instagram.com/${handle}/`;
  }
  if (network === "tiktok") {
    return `https://www.tiktok.com/@${handle}`;
  }
  if (network === "x") {
    return `https://x.com/${handle}`;
  }
  return null;
};

const linkedProfiles = (
  business: BusinessSnapshot
): { label: string; network: SocialNetwork; url: string }[] => {
  const profiles: { label: string; network: SocialNetwork; url: string }[] = [];
  for (const network of NETWORKS) {
    const raw = network.read(business);
    if (!raw) {
      continue;
    }
    const url = socialProfileUrl(network.network, raw);
    if (!url) {
      continue;
    }
    profiles.push({ label: network.label, network: network.network, url });
  }
  return profiles;
};

const absoluteUrl = (value: string, pageUrl: string): string | undefined => {
  try {
    const resolved = new URL(value, pageUrl);
    if (resolved.protocol === "http:" || resolved.protocol === "https:") {
      return resolved.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const markerUrl = (
  document: HtmlDocument,
  name: "banner" | "avatar",
  pageUrl: string
): string | undefined => {
  const node = document.querySelector(`[data-listwell-${name}]`);
  const marked = node?.getAttribute(`data-listwell-${name}`);
  if (marked) {
    return absoluteUrl(marked, pageUrl);
  }
  const src = node?.getAttribute("src");
  if (src) {
    return absoluteUrl(src, pageUrl);
  }
  const alt = name === "banner" ? "Cover photo" : "Profile photo";
  const image = document.querySelector(`img[alt="${alt}"]`);
  const imageSrc = image?.getAttribute("src");
  if (!imageSrc) {
    return undefined;
  }
  return absoluteUrl(imageSrc, pageUrl);
};

const latestPostAt = (document: HtmlDocument): string | undefined => {
  let latest: number | undefined;
  for (const node of document.querySelectorAll("time")) {
    const raw = node.getAttribute("datetime");
    if (!raw) {
      continue;
    }
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      continue;
    }
    if (latest === undefined || parsed > latest) {
      latest = parsed;
    }
  }
  if (latest === undefined) {
    return undefined;
  }
  return new Date(latest).toISOString();
};

const DOM_PARSE_LIMIT = 400_000;
const MONTH_MS = 30 * 86_400_000;
const YEAR_MS = 365 * 86_400_000;

const RELATIVE_UNIT_MS: Record<string, number> = {
  day: 86_400_000,
  hour: 3_600_000,
  hr: 3_600_000,
  minute: 60_000,
  month: MONTH_MS,
  second: 1000,
  week: 7 * 86_400_000,
  year: YEAR_MS,
};

type ProfileFacts = Pick<
  SocialProfileEvidence,
  | "avatarUrl"
  | "bannerUrl"
  | "hasBanner"
  | "latestPostAt"
  | "postKnown"
  | "readable"
  | "reason"
>;

const unread = (reason: string): ProfileFacts => ({
  postKnown: false,
  readable: false,
  reason,
});

const decodeEmbedded = (value: string): string =>
  value
    .replaceAll("\\u0026", "&")
    .replaceAll("&amp;", "&")
    .replaceAll("\\/", "/");

const metaContent = (html: string, key: string): string | undefined => {
  const match = new RegExp(
    `(?:name|property)="${key}" content="(?<value>[^"]*)"`,
    "iu"
  ).exec(html);
  const value = match?.groups?.value;
  if (!value) {
    return undefined;
  }
  return decodeEmbedded(value);
};

const pageTitle = (html: string): string =>
  /<title[^>]*>(?<title>[^<]*)<\/title>/iu.exec(html)?.groups?.title ?? "";

const isLoginTitle = (title: string): boolean =>
  /^\s*(?:log\s*in|sign\s*up|login)\b/iu.test(title);

const YOUTUBE_AVATAR = /"avatar":\{"thumbnails":\[\{"url":"(?<url>[^"]+)"/u;
const YOUTUBE_BANNER =
  /"imageBannerViewModel":\{"image":\{"sources":\[\{"url":"(?<url>[^"]+)"/u;
const TIKTOK_REHYDRATION =
  /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(?<json>[\s\S]*?)<\/script>/u;
const RELATIVE_AGO =
  /(?<count>\d+)\s*(?<unit>second|minute|hour|hr|day|week|month|year)s?\s+ago/giu;
const FACEBOOK_COVER = /"has_cover":(?<value>true|false)/u;
const FACEBOOK_PLUGIN_IMAGE = /<img[^>]+src="(?<src>[^"]+)"/giu;

const newestRelativePost = (
  html: string,
  nowMs: number
): string | undefined => {
  let newest: number | undefined;
  for (const match of html.matchAll(RELATIVE_AGO)) {
    const count = Number(match.groups?.count);
    const unit = match.groups?.unit?.toLowerCase();
    const unitMs = unit ? RELATIVE_UNIT_MS[unit] : undefined;
    if (!unitMs || !Number.isFinite(count)) {
      continue;
    }
    const postedAt = nowMs - count * unitMs;
    if (newest === undefined || postedAt > newest) {
      newest = postedAt;
    }
  }
  if (newest === undefined) {
    return undefined;
  }
  return new Date(newest).toISOString();
};

const readYouTube = (html: string, nowMs: number): ProfileFacts | null => {
  if (
    !html.includes("ytInitialData") &&
    !html.includes("imageBannerViewModel")
  ) {
    return null;
  }
  const avatar = YOUTUBE_AVATAR.exec(html)?.groups?.url;
  const banner = YOUTUBE_BANNER.exec(html)?.groups?.url;
  const postedAt = newestRelativePost(html, nowMs);
  if (!avatar && !banner && !postedAt) {
    return null;
  }
  return {
    avatarUrl: avatar ? decodeEmbedded(avatar) : undefined,
    bannerUrl: banner ? decodeEmbedded(banner) : undefined,
    ...(banner ? { hasBanner: true } : {}),
    latestPostAt: postedAt,
    postKnown: Boolean(postedAt),
    readable: true,
  };
};

const tiktokItemSchema = z.object({
  createTime: z.number().optional(),
});

const tiktokUserInfoSchema = z.object({
  itemList: z.array(tiktokItemSchema).optional(),
  user: z
    .object({
      avatarLarger: z.string().optional(),
    })
    .optional(),
});

const tiktokDetailSchema = z.object({
  userInfo: tiktokUserInfoSchema.optional(),
});

const tiktokScopeSchema = z.object({
  __DEFAULT_SCOPE__: z.record(z.string(), z.unknown()).optional(),
});

const readTikTok = (html: string): ProfileFacts | null => {
  const raw = TIKTOK_REHYDRATION.exec(html)?.groups?.json;
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const scope = tiktokScopeSchema.safeParse(parsed);
  if (!scope.success) {
    return null;
  }
  const info = tiktokDetailSchema.safeParse(
    scope.data.__DEFAULT_SCOPE__?.["webapp.user-detail"]
  );
  if (!info.success || !info.data.userInfo) {
    return null;
  }
  const { userInfo } = info.data;
  const avatarUrl = userInfo.user?.avatarLarger;
  let latestMs: number | undefined;
  for (const item of userInfo.itemList ?? []) {
    if (item.createTime === undefined) {
      continue;
    }
    const ms =
      item.createTime > 1_000_000_000_000
        ? item.createTime
        : item.createTime * 1000;
    if (latestMs === undefined || ms > latestMs) {
      latestMs = ms;
    }
  }
  if (!avatarUrl && latestMs === undefined) {
    return null;
  }
  return {
    avatarUrl,
    latestPostAt:
      latestMs === undefined ? undefined : new Date(latestMs).toISOString(),
    postKnown: latestMs !== undefined,
    readable: true,
  };
};

const readOpenGraphProfile = (
  html: string,
  network: SocialNetwork
): ProfileFacts | null => {
  const image = metaContent(html, "og:image");
  const twitterImage = metaContent(html, "twitter:image");
  if (
    network === "instagram" &&
    metaContent(html, "og:type") === "profile" &&
    image
  ) {
    return {
      avatarUrl: image,
      postKnown: false,
      readable: true,
    };
  }
  if (network === "x") {
    const avatarUrl = image?.includes("profile_images") ? image : undefined;
    const bannerUrl = twitterImage?.includes("profile_banners")
      ? twitterImage
      : undefined;
    if (!avatarUrl && !bannerUrl) {
      return null;
    }
    return {
      avatarUrl,
      bannerUrl,
      ...(bannerUrl ? { hasBanner: true } : {}),
      postKnown: false,
      readable: true,
    };
  }
  if (
    network === "linkedin" &&
    image &&
    (image.includes("company-logo") || image.includes("profile-displayphoto"))
  ) {
    return {
      avatarUrl: image,
      postKnown: false,
      readable: true,
    };
  }
  return null;
};

const readEmbeddedProfile = (
  html: string,
  network: SocialNetwork,
  nowMs: number
): ProfileFacts | null => {
  if (network === "youtube") {
    return readYouTube(html, nowMs);
  }
  if (network === "tiktok") {
    return readTikTok(html);
  }
  return readOpenGraphProfile(html, network);
};

const hasMarkerHint = (html: string): boolean =>
  html.includes("data-listwell-banner") ||
  html.includes("data-listwell-avatar") ||
  html.includes('alt="Cover photo"') ||
  html.includes('alt="Profile photo"') ||
  html.includes("datetime=");

const readMarkerProfile = (html: string, pageUrl: string): ProfileFacts => {
  const document = parseDocument(html);
  const bannerUrl = markerUrl(document, "banner", pageUrl);
  const avatarUrl = markerUrl(document, "avatar", pageUrl);
  const postedAt = latestPostAt(document);
  if (!bannerUrl && !avatarUrl && !postedAt) {
    return unread("Public profile could not be read");
  }
  return {
    avatarUrl,
    bannerUrl,
    hasBanner: Boolean(bannerUrl),
    latestPostAt: postedAt,
    postKnown: postedAt !== undefined,
    readable: true,
  };
};

const facebookCoverKnown = (cover: string | undefined): boolean | undefined => {
  if (cover === "true") {
    return true;
  }
  if (cover === "false") {
    return false;
  }
  return undefined;
};

const readFacebookPlugin = (html: string): ProfileFacts | null => {
  const cover = FACEBOOK_COVER.exec(html)?.groups?.value;
  const hasBanner = facebookCoverKnown(cover);
  const images = [...html.matchAll(FACEBOOK_PLUGIN_IMAGE)];
  let avatarUrl: string | undefined;
  for (const image of images) {
    const src = image.groups?.src;
    // Substring checks on image URLs, not array membership.
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    if (!src || src.includes("rsrc.php") || src.includes("static.xx")) {
      continue;
    }
    // react-doctor-disable-next-line react-doctor/js-set-map-lookups
    if (src.includes("scontent") || src.includes("fbcdn.net")) {
      avatarUrl = decodeEmbedded(src);
      break;
    }
  }
  if (hasBanner === undefined && !avatarUrl) {
    return null;
  }
  return {
    avatarUrl,
    ...(hasBanner === undefined ? {} : { hasBanner }),
    postKnown: false,
    readable: true,
  };
};

const readProfileHtml = (
  html: string,
  pageUrl: string,
  network: SocialNetwork,
  nowMs: number
): ProfileFacts => {
  const embedded = readEmbeddedProfile(html, network, nowMs);
  if (embedded?.readable) {
    return embedded;
  }
  if (isLoginTitle(pageTitle(html))) {
    return unread("Profile page requires login");
  }
  if (!hasMarkerHint(html) && html.length > DOM_PARSE_LIMIT) {
    return unread("Public profile could not be read");
  }
  return readMarkerProfile(html, pageUrl);
};

const mergeFacts = (
  base: ProfileFacts,
  extra: ProfileFacts | null
): ProfileFacts => {
  if (!extra?.readable) {
    return base;
  }
  if (!base.readable) {
    return extra;
  }
  return {
    avatarUrl: base.avatarUrl ?? extra.avatarUrl,
    bannerUrl: base.bannerUrl ?? extra.bannerUrl,
    hasBanner: base.hasBanner ?? extra.hasBanner,
    latestPostAt: base.latestPostAt ?? extra.latestPostAt,
    postKnown: base.postKnown || extra.postKnown,
    readable: true,
  };
};

const readProfile = async (
  profile: { label: string; network: SocialNetwork; url: string },
  options: FetchWebsiteOptions
): Promise<SocialProfileEvidence> => {
  const nowMs = Date.now();
  try {
    const html = await fetchWebsiteHtml(profile.url, options);
    let facts = readProfileHtml(html, profile.url, profile.network, nowMs);
    if (profile.network === "facebook" && facts.hasBanner === undefined) {
      const pluginUrl = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(profile.url)}&tabs=timeline&width=500&height=400&hide_cover=false&show_facepile=false`;
      try {
        const pluginHtml = await fetchWebsiteHtml(pluginUrl, options);
        facts = mergeFacts(facts, readFacebookPlugin(pluginHtml));
      } catch {
        // The public page result still stands when the plugin cannot be read.
      }
    }
    return {
      label: profile.label,
      network: profile.network,
      url: profile.url,
      ...facts,
    };
  } catch (error) {
    return {
      label: profile.label,
      network: profile.network,
      postKnown: false,
      readable: false,
      reason:
        error instanceof Error ? error.message : "Could not fetch profile",
      url: profile.url,
    };
  }
};

export const loadSocialProfileEvidence = (
  business: BusinessSnapshot,
  options: FetchWebsiteOptions
): Promise<SocialProfileEvidence[]> =>
  Promise.all(
    linkedProfiles(business).map((profile) => readProfile(profile, options))
  );

export const daysSince = (iso: string, nowMs: number): number | null => {
  const postedAt = Date.parse(iso);
  if (Number.isNaN(postedAt)) {
    return null;
  }
  return Math.max(0, Math.floor((nowMs - postedAt) / DAY_MS));
};

export const freshnessScore = (days: number): number => {
  if (days <= FRESH_WEEK_DAYS) {
    return 100;
  }
  if (days <= FRESH_MONTH_DAYS) {
    return 80;
  }
  if (days <= FRESH_QUARTER_DAYS) {
    return 50;
  }
  return 0;
};

export const freshnessAgeLabel = (days: number): string => {
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  return `${days} days ago`;
};
