import { z } from 'zod'

export const businessCategorySchema = z.enum(['food', 'retail', 'services', 'other'])

export const channelCategorySchema = z.enum([
  'Website',
  'Google Business Profile',
  'Social Media',
  'Food Delivery',
])

export const checkIdSchema = z.enum([
  'website',
  'website-200-299',
  'website-title',
  'website-meta-description',
  'website-canonical',
  'website-robots',
  'website-sitemap',
  'website-og-image',
  'website-performance',
  'website-mobile-responsive',
  'website-tel-link',
  'website-physical-address',
  'website-opening-hours',
  'website-localbusiness-jsonld',
  'website-menu-jsonld',
  'website-gbp-name-address-phone',
  'google-listing',
  'google-listing-phone-number',
  'google-listing-reviews',
  'google-listing-photos',
  'google-listing-opening-times',
  'google-listing-primary-category',
  'google-listing-website-matches',
  'facebook-page',
  'instagram-profile',
  'tiktok-profile',
  'linkedin-profile',
  'youtube-profile',
  'uber-eats-listing',
  'doordash-listing',
  'deliveroo-listing',
  'menulog-listing',
])

export const locationSnapshotSchema = z.object({
  googlePlaceId: z.string().nullable().optional(),
  appleMapsId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
})

export const businessSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: businessCategorySchema,
  websiteUrl: z.string().nullable().optional(),
  facebookUsername: z.string().nullable().optional(),
  instagramUsername: z.string().nullable().optional(),
  tiktokUsername: z.string().nullable().optional(),
  xUsername: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  uberEatsUrl: z.string().nullable().optional(),
  doorDashUrl: z.string().nullable().optional(),
  deliverooUrl: z.string().nullable().optional(),
  menulogUrl: z.string().nullable().optional(),
  locations: z.array(locationSnapshotSchema).default([]),
})

export const googlePlaceSchema = z.object({
  id: z.string().optional(),
  displayName: z.object({ text: z.string() }).optional(),
  nationalPhoneNumber: z.string().optional(),
  currentOpeningHours: z.unknown().optional(),
  websiteUri: z.string().optional(),
  userRatingCount: z.number().optional(),
  formattedAddress: z.string().optional(),
  rating: z.number().optional(),
  photos: z.array(z.unknown()).optional(),
  types: z.array(z.string()).optional(),
  addressComponents: z.array(z.object({
    longText: z.string().optional(),
    shortText: z.string().optional(),
    long_name: z.string().optional(),
    short_name: z.string().optional(),
    types: z.array(z.string()).optional(),
  })).optional(),
})

export const googleSearchResultSchema = z.object({
  title: z.string(),
  link: z.string(),
  description: z.string(),
})

export const checkResultSchema = z.object({
  type: z.literal('check'),
  value: z.boolean().nullable(),
  label: z.string().optional(),
})

export function checkResult(value: boolean | null, label?: string) {
  return checkResultSchema.parse(label === undefined
    ? { type: 'check', value }
    : { type: 'check', value, label })
}

export const runChecksRequestSchema = z.object({
  business: businessSnapshotSchema,
  checks: z.array(checkIdSchema).optional(),
  mode: z.enum(['sync', 'async']).default('sync'),
})

export const queueAuditMessageSchema = z.object({
  jobId: z.string(),
  business: businessSnapshotSchema,
  checkIds: z.array(checkIdSchema),
})
