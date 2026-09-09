import { z } from "zod";

export const businessCategorySchema = z.enum([
  "food",
  "retail",
  "services",
  "other",
]);

export const channelCategorySchema = z.enum([
  "Website",
  "Google Business Profile",
  "Social Media",
  "Food Delivery",
]);

export const checkIdSchema = z.enum([
  "website",
  "website-200-299",
  "website-title",
  "website-meta-description",
  "website-canonical",
  "website-robots",
  "website-sitemap",
  "website-og-image",
  "website-performance",
  "website-mobile-responsive",
  "website-tel-link",
  "website-physical-address",
  "website-opening-hours",
  "website-localbusiness-jsonld",
  "website-menu-jsonld",
  "website-gbp-name-address-phone",
  "google-listing",
  "google-listing-phone-number",
  "google-listing-reviews",
  "google-listing-photos",
  "google-listing-opening-times",
  "google-listing-primary-category",
  "google-listing-website-matches",
  "facebook-page",
  "instagram-profile",
  "tiktok-profile",
  "linkedin-profile",
  "youtube-profile",
  "uber-eats-listing",
  "doordash-listing",
  "deliveroo-listing",
  "menulog-listing",
]);

export const locationSnapshotSchema = z.object({
  address: z.string().nullable().optional(),
  appleMapsId: z.string().nullable().optional(),
  googlePlaceId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

export const businessSnapshotSchema = z.object({
  category: businessCategorySchema,
  deliverooUrl: z.string().nullable().optional(),
  doorDashUrl: z.string().nullable().optional(),
  facebookUsername: z.string().nullable().optional(),
  id: z.string(),
  instagramUsername: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  locations: z.array(locationSnapshotSchema).default([]),
  menulogUrl: z.string().nullable().optional(),
  name: z.string(),
  tiktokUsername: z.string().nullable().optional(),
  uberEatsUrl: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
  xUsername: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
});

export const googlePlaceSchema = z.object({
  addressComponents: z
    .array(
      z.object({
        longText: z.string().optional(),
        long_name: z.string().optional(),
        shortText: z.string().optional(),
        short_name: z.string().optional(),
        types: z.array(z.string()).optional(),
      })
    )
    .optional(),
  currentOpeningHours: z.unknown().optional(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  id: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  photos: z.array(z.unknown()).optional(),
  rating: z.number().optional(),
  types: z.array(z.string()).optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
});

export const googleSearchResultSchema = z.object({
  description: z.string(),
  link: z.string(),
  title: z.string(),
});

export const checkResultSchema = z.object({
  label: z.string().optional(),
  type: z.literal("check"),
  value: z.boolean().nullable(),
});

export const checkResult = (value: boolean | null, label?: string) =>
  checkResultSchema.parse(
    label === undefined
      ? { type: "check", value }
      : { label, type: "check", value }
  );

export const runChecksRequestSchema = z.object({
  business: businessSnapshotSchema,
  checks: z.array(checkIdSchema).optional(),
  mode: z.enum(["sync", "async"]).default("sync"),
});

export const queueAuditMessageSchema = z.object({
  business: businessSnapshotSchema,
  checkIds: z.array(checkIdSchema),
  jobId: z.string(),
});
