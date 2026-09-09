import { z } from "zod";

import { CHANNEL_CONFIG, channelIdSchema } from "./channel";
import type { ChannelId, DiscoveredProfile } from "./channel";
import type { Business, CreateBusinessRequest } from "./schema";

export const profileValueSchema = z.string().min(1);

export const channelLabel = (channelId: ChannelId): string => {
  const labels: Record<ChannelId, string> = {
    "apple-maps": "Apple Maps listing URL",
    deliveroo: "Deliveroo URL",
    doordash: "DoorDash URL",
    facebook: "Facebook page URL",
    "google-maps": "Google listing URL",
    instagram: "Instagram username",
    linkedin: "LinkedIn profile URL",
    menulog: "Menulog URL",
    tiktok: "TikTok username",
    "uber-eats": "Uber Eats URL",
    website: "Website URL",
    x: "X username",
    youtube: "YouTube channel URL",
  };
  return labels[channelId];
};

export const channelPlaceholder = (channelId: ChannelId): string => {
  const placeholders: Record<ChannelId, string> = {
    "apple-maps": "https://maps.apple.com/...",
    deliveroo: "https://deliveroo.com/...",
    doordash: "https://doordash.com/...",
    facebook: "https://facebook.com/yourpage",
    "google-maps": "https://maps.google.com/...",
    instagram: "username",
    linkedin: "https://linkedin.com/company/...",
    menulog: "https://menulog.com/...",
    tiktok: "username",
    "uber-eats": "https://ubereats.com/...",
    website: "https://yourwebsite.com",
    x: "username",
    youtube: "https://youtube.com/channel/...",
  };
  return placeholders[channelId];
};

export const usernameFromUrl = (value: string, host: string): string => {
  if (!value.includes(host)) {
    return value.replace(/^@/u, "");
  }
  try {
    const url = new URL(value);
    const first = url.pathname
      .split("/")
      .filter(Boolean)
      .find((part) => part.length > 0)
      ?.replace(/^@/u, "");
    return first ?? value;
  } catch {
    return value;
  }
};

export const mapProfilesToBusinessData = (
  name: string,
  category: CreateBusinessRequest["category"],
  profiles: DiscoveredProfile[]
): CreateBusinessRequest => {
  const data: CreateBusinessRequest = {
    category,
    locations: [],
    name,
  };
  const locationByAddress = new Map<
    string,
    CreateBusinessRequest["locations"][number]
  >();
  const rememberLocation = (
    location: CreateBusinessRequest["locations"][number]
  ) => {
    data.locations.push(location);
    if (location.address) {
      locationByAddress.set(location.address, location);
    }
  };

  for (const profile of profiles) {
    switch (profile.type) {
      case "website": {
        data.websiteUrl = profile.title;
        break;
      }
      case "google-maps": {
        rememberLocation({
          address: profile.subtitle,
          googlePlaceId: profile.googlePlaceId,
          name: profile.title,
        });
        break;
      }
      case "apple-maps": {
        const existing = profile.subtitle
          ? locationByAddress.get(profile.subtitle)
          : undefined;
        if (existing) {
          existing.appleMapsId = profile.appleMapsId;
        } else {
          rememberLocation({
            address: profile.subtitle,
            appleMapsId: profile.appleMapsId,
            name: profile.title,
          });
        }
        break;
      }
      case "facebook": {
        data.facebookUsername = profile.title;
        break;
      }
      case "instagram": {
        data.instagramUsername = usernameFromUrl(
          profile.title,
          "instagram.com"
        );
        break;
      }
      case "tiktok": {
        data.tiktokUsername = usernameFromUrl(profile.title, "tiktok.com");
        break;
      }
      case "x": {
        data.xUsername = usernameFromUrl(profile.title, "x.com");
        break;
      }
      case "linkedin": {
        data.linkedinUrl = profile.title;
        break;
      }
      case "youtube": {
        data.youtubeUrl = profile.title;
        break;
      }
      case "uber-eats": {
        data.uberEatsUrl = profile.title;
        break;
      }
      case "deliveroo": {
        data.deliverooUrl = profile.title;
        break;
      }
      case "doordash": {
        data.doorDashUrl = profile.title;
        break;
      }
      case "menulog": {
        data.menulogUrl = profile.title;
        break;
      }
      default: {
        break;
      }
    }
  }

  return data;
};

export const businessInputFromDiscovery = (
  name: string,
  category: CreateBusinessRequest["category"],
  profiles: DiscoveredProfile[],
  address?: string
): CreateBusinessRequest => {
  const payload = mapProfilesToBusinessData(name, category, profiles);
  const trimmed = address?.trim();
  if (!trimmed) {
    return payload;
  }
  if (payload.locations.length === 0) {
    payload.locations.push({ address: trimmed, name });
    return payload;
  }
  const [firstLocation] = payload.locations;
  if (firstLocation && !firstLocation.address) {
    firstLocation.address = trimmed;
  }
  return payload;
};

const addUrlProfile = (
  profiles: DiscoveredProfile[],
  title: string | null | undefined,
  type: DiscoveredProfile["type"]
): void => {
  if (title) {
    profiles.push({ title, type });
  }
};

const addLocationProfiles = (
  business: Business,
  profiles: DiscoveredProfile[]
): void => {
  for (const location of business.locations) {
    if (location.googlePlaceId || (location.address && !location.appleMapsId)) {
      profiles.push({
        googlePlaceId: location.googlePlaceId ?? undefined,
        subtitle: location.address ?? undefined,
        title:
          location.googlePlaceId ??
          location.name ??
          location.address ??
          "Listing",
        type: "google-maps",
      });
    }
    if (location.appleMapsId) {
      profiles.push({
        appleMapsId: location.appleMapsId,
        subtitle: location.address ?? undefined,
        title: location.name ?? location.appleMapsId,
        type: "apple-maps",
      });
    }
  }
};

export const businessToProfiles = (business: Business): DiscoveredProfile[] => {
  const profiles: DiscoveredProfile[] = [];
  addUrlProfile(profiles, business.websiteUrl, "website");
  addUrlProfile(profiles, business.facebookUsername, "facebook");
  addUrlProfile(profiles, business.instagramUsername, "instagram");
  addUrlProfile(profiles, business.tiktokUsername, "tiktok");
  addUrlProfile(profiles, business.xUsername, "x");
  addUrlProfile(profiles, business.linkedinUrl, "linkedin");
  addUrlProfile(profiles, business.youtubeUrl, "youtube");
  addUrlProfile(profiles, business.uberEatsUrl, "uber-eats");
  addUrlProfile(profiles, business.deliverooUrl, "deliveroo");
  addUrlProfile(profiles, business.doorDashUrl, "doordash");
  addUrlProfile(profiles, business.menulogUrl, "menulog");
  addLocationProfiles(business, profiles);
  return profiles;
};

export const unusedChannels = (profiles: DiscoveredProfile[]): ChannelId[] => {
  const used = new Set(profiles.map((profile) => profile.type));
  return channelIdSchema.options.filter((id) => !used.has(id));
};

export const channelName = (id: ChannelId): string => CHANNEL_CONFIG[id].name;
