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
  website: { id: "website", name: "Website" },
  facebook: { id: "facebook", name: "Facebook" },
  instagram: { id: "instagram", name: "Instagram" },
  tiktok: { id: "tiktok", name: "TikTok" },
  youtube: { id: "youtube", name: "YouTube" },
  "uber-eats": { id: "uber-eats", name: "Uber Eats" },
  deliveroo: { id: "deliveroo", name: "Deliveroo" },
  doordash: { id: "doordash", name: "DoorDash" },
  menulog: { id: "menulog", name: "Menulog" },
  "apple-maps": { id: "apple-maps", name: "Apple Maps" },
  "google-maps": { id: "google-maps", name: "Google Maps" },
  linkedin: { id: "linkedin", name: "LinkedIn" },
  x: { id: "x", name: "X" },
};

export const discoveredProfileSchema = z.object({
  type: channelIdSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  googlePlaceId: z.string().optional(),
  appleMapsId: z.string().optional(),
});
export type DiscoveredProfile = z.infer<typeof discoveredProfileSchema>;
