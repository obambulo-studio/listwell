import { z } from "zod";
import { CHANNEL_CONFIG, channelIdSchema, type ChannelId, type DiscoveredProfile } from "./channel";
import type { Business, CreateBusinessRequest } from "./schema";

export const profileValueSchema = z.string().min(1);

export function channelLabel(channelId: ChannelId): string {
  const labels: Record<ChannelId, string> = {
    website: "Website URL",
    facebook: "Facebook page URL",
    instagram: "Instagram username",
    tiktok: "TikTok username",
    youtube: "YouTube channel URL",
    "uber-eats": "Uber Eats URL",
    deliveroo: "Deliveroo URL",
    doordash: "DoorDash URL",
    menulog: "Menulog URL",
    "apple-maps": "Apple Maps listing URL",
    "google-maps": "Google listing URL",
    linkedin: "LinkedIn profile URL",
    x: "X username",
  };
  return labels[channelId];
}

export function channelPlaceholder(channelId: ChannelId): string {
  const placeholders: Record<ChannelId, string> = {
    website: "https://yourwebsite.com",
    facebook: "https://facebook.com/yourpage",
    instagram: "username",
    tiktok: "username",
    youtube: "https://youtube.com/channel/...",
    "uber-eats": "https://ubereats.com/...",
    deliveroo: "https://deliveroo.com/...",
    doordash: "https://doordash.com/...",
    menulog: "https://menulog.com/...",
    "apple-maps": "https://maps.apple.com/...",
    "google-maps": "https://maps.google.com/...",
    linkedin: "https://linkedin.com/company/...",
    x: "username",
  };
  return placeholders[channelId];
}

export function usernameFromUrl(value: string, host: string): string {
  if (!value.includes(host)) {
    return value.replace(/^@/, "");
  }
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0]?.replace(/^@/, "");
    return first ?? value;
  } catch {
    return value;
  }
}

export function mapProfilesToBusinessData(
  name: string,
  category: CreateBusinessRequest["category"],
  profiles: DiscoveredProfile[],
): CreateBusinessRequest {
  const data: CreateBusinessRequest = {
    name,
    category,
    locations: [],
  };

  for (const profile of profiles) {
    switch (profile.type) {
      case "website":
        data.websiteUrl = profile.title;
        break;
      case "google-maps":
        data.locations.push({
          googlePlaceId: profile.googlePlaceId,
          name: profile.title,
          address: profile.subtitle,
        });
        break;
      case "apple-maps": {
        const existing = data.locations.find((location) => location.address === profile.subtitle);
        if (existing) {
          existing.appleMapsId = profile.appleMapsId;
        } else {
          data.locations.push({
            appleMapsId: profile.appleMapsId,
            name: profile.title,
            address: profile.subtitle,
          });
        }
        break;
      }
      case "facebook":
        data.facebookUsername = profile.title;
        break;
      case "instagram":
        data.instagramUsername = usernameFromUrl(profile.title, "instagram.com");
        break;
      case "tiktok":
        data.tiktokUsername = usernameFromUrl(profile.title, "tiktok.com");
        break;
      case "x":
        data.xUsername = usernameFromUrl(profile.title, "x.com");
        break;
      case "linkedin":
        data.linkedinUrl = profile.title;
        break;
      case "youtube":
        data.youtubeUrl = profile.title;
        break;
      case "uber-eats":
        data.uberEatsUrl = profile.title;
        break;
      case "deliveroo":
        data.deliverooUrl = profile.title;
        break;
      case "doordash":
        data.doorDashUrl = profile.title;
        break;
      case "menulog":
        data.menulogUrl = profile.title;
        break;
    }
  }

  return data;
}

export function businessToProfiles(business: Business): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = [];
  if (business.websiteUrl) {
    profiles.push({ type: "website", title: business.websiteUrl });
  }
  if (business.facebookUsername) {
    profiles.push({ type: "facebook", title: business.facebookUsername });
  }
  if (business.instagramUsername) {
    profiles.push({ type: "instagram", title: business.instagramUsername });
  }
  if (business.tiktokUsername) {
    profiles.push({ type: "tiktok", title: business.tiktokUsername });
  }
  if (business.xUsername) {
    profiles.push({ type: "x", title: business.xUsername });
  }
  if (business.linkedinUrl) {
    profiles.push({ type: "linkedin", title: business.linkedinUrl });
  }
  if (business.youtubeUrl) {
    profiles.push({ type: "youtube", title: business.youtubeUrl });
  }
  if (business.uberEatsUrl) {
    profiles.push({ type: "uber-eats", title: business.uberEatsUrl });
  }
  if (business.deliverooUrl) {
    profiles.push({ type: "deliveroo", title: business.deliverooUrl });
  }
  if (business.doorDashUrl) {
    profiles.push({ type: "doordash", title: business.doorDashUrl });
  }
  if (business.menulogUrl) {
    profiles.push({ type: "menulog", title: business.menulogUrl });
  }
  for (const location of business.locations) {
    if (location.googlePlaceId || (location.address && !location.appleMapsId)) {
      profiles.push({
        type: "google-maps",
        title: location.googlePlaceId ?? location.name ?? location.address ?? "Listing",
        subtitle: location.address ?? undefined,
        googlePlaceId: location.googlePlaceId ?? undefined,
      });
    }
    if (location.appleMapsId) {
      profiles.push({
        type: "apple-maps",
        title: location.name ?? location.appleMapsId,
        subtitle: location.address ?? undefined,
        appleMapsId: location.appleMapsId,
      });
    }
  }
  return profiles;
}

export function unusedChannels(profiles: DiscoveredProfile[]): ChannelId[] {
  const used = new Set(profiles.map((profile) => profile.type));
  return channelIdSchema.options.filter((id) => !used.has(id));
}

export function channelName(id: ChannelId): string {
  return CHANNEL_CONFIG[id].name;
}
