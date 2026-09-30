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
  label: string;
  latestPostAt?: string;
  network: SocialNetwork;
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

const isLoginWall = (document: HtmlDocument): boolean => {
  const title = document.querySelector("title")?.textContent ?? "";
  const body = document.body?.textContent ?? "";
  const text = `${title} ${body}`;
  return /log\s*in|sign\s*up|login/iu.test(text);
};

const hasProfileMarkers = (document: HtmlDocument): boolean =>
  Boolean(
    document.querySelector("[data-listwell-banner]") ||
    document.querySelector("[data-listwell-avatar]") ||
    document.querySelector('img[alt="Cover photo"]') ||
    document.querySelector('img[alt="Profile photo"]') ||
    document.querySelector("time[datetime]")
  );

const readProfileHtml = (
  html: string,
  pageUrl: string
): Pick<
  SocialProfileEvidence,
  "avatarUrl" | "bannerUrl" | "latestPostAt" | "readable" | "reason"
> => {
  const document = parseDocument(html);
  if (isLoginWall(document) && !hasProfileMarkers(document)) {
    return {
      readable: false,
      reason: "Profile page requires login",
    };
  }
  const bannerUrl = markerUrl(document, "banner", pageUrl);
  const avatarUrl = markerUrl(document, "avatar", pageUrl);
  const postedAt = latestPostAt(document);
  if (!bannerUrl && !avatarUrl && !postedAt) {
    return {
      readable: false,
      reason: "Public profile could not be read",
    };
  }
  return {
    avatarUrl,
    bannerUrl,
    latestPostAt: postedAt,
    readable: true,
  };
};

const readProfile = async (
  profile: { label: string; network: SocialNetwork; url: string },
  options: FetchWebsiteOptions
): Promise<SocialProfileEvidence> => {
  try {
    const html = await fetchWebsiteHtml(profile.url, options);
    return {
      label: profile.label,
      network: profile.network,
      url: profile.url,
      ...readProfileHtml(html, profile.url),
    };
  } catch (error) {
    return {
      label: profile.label,
      network: profile.network,
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
