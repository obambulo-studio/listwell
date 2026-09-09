import { z } from "zod";

export const channelIdSchema = z.enum([
  "website",
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "uber-eats",
  "deliveroo",
  "doordash",
  "menulog",
  "apple-maps",
  "google-maps",
  "linkedin",
  "x",
]);
export type ChannelId = z.infer<typeof channelIdSchema>;

export const channelSchema = z.object({
  id: channelIdSchema,
  name: z.string(),
});
export type Channel = z.infer<typeof channelSchema>;

export const CHANNEL_CONFIG: Record<ChannelId, Channel> = {
  "apple-maps": { id: "apple-maps", name: "Apple Maps" },
  deliveroo: { id: "deliveroo", name: "Deliveroo" },
  doordash: { id: "doordash", name: "DoorDash" },
  facebook: { id: "facebook", name: "Facebook" },
  "google-maps": { id: "google-maps", name: "Google Maps" },
  instagram: { id: "instagram", name: "Instagram" },
  linkedin: { id: "linkedin", name: "LinkedIn" },
  menulog: { id: "menulog", name: "Menulog" },
  tiktok: { id: "tiktok", name: "TikTok" },
  "uber-eats": { id: "uber-eats", name: "Uber Eats" },
  website: { id: "website", name: "Website" },
  x: { id: "x", name: "X" },
  youtube: { id: "youtube", name: "YouTube" },
};

export const discoveredProfileSchema = z.object({
  appleMapsId: z.string().optional(),
  googlePlaceId: z.string().optional(),
  subtitle: z.string().optional(),
  title: z.string(),
  type: channelIdSchema,
});
export type DiscoveredProfile = z.infer<typeof discoveredProfileSchema>;
