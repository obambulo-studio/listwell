import { checkIdSchema } from './schemas'
import type { BusinessCategory, CheckDefinition, CheckId } from './types'

const allCategories: BusinessCategory[] = ['food', 'retail', 'services', 'other']

function points(
  food = 0,
  retail = 0,
  services = 0,
  other = 0,
): Record<BusinessCategory, number> {
  return { food, retail, services, other }
}

/**
 * Check IDs match `content/checks/*.md` filenames so Listwell reports stay
 * comparable with the upstream Nuxt engine.
 */
export const CHECK_DEFINITIONS: Record<CheckId, CheckDefinition> = {
  website: {
    id: 'website',
    channelCategory: 'Website',
    points: points(6, 8, 6, 7),
    businessCategories: null,
    queued: false,
  },
  'website-200-299': {
    id: 'website-200-299',
    channelCategory: 'Website',
    points: points(6, 8, 6, 7),
    businessCategories: null,
    queued: false,
  },
  'website-title': {
    id: 'website-title',
    channelCategory: 'Website',
    points: points(4, 6, 6, 5),
    businessCategories: null,
    queued: false,
  },
  'website-meta-description': {
    id: 'website-meta-description',
    channelCategory: 'Website',
    points: points(2, 3, 3, 3),
    businessCategories: null,
    queued: false,
  },
  'website-canonical': {
    id: 'website-canonical',
    channelCategory: 'Website',
    points: points(1, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'website-robots': {
    id: 'website-robots',
    channelCategory: 'Website',
    points: points(1, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'website-sitemap': {
    id: 'website-sitemap',
    channelCategory: 'Website',
    points: points(1, 1, 1, 1),
    businessCategories: null,
    queued: false,
  },
  'website-og-image': {
    id: 'website-og-image',
    channelCategory: 'Website',
    points: points(1, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'website-performance': {
    id: 'website-performance',
    channelCategory: 'Website',
    points: points(4, 6, 4, 5),
    businessCategories: null,
    queued: true,
  },
  'website-mobile-responsive': {
    id: 'website-mobile-responsive',
    channelCategory: 'Website',
    points: points(6, 8, 6, 7),
    businessCategories: null,
    queued: false,
  },
  'website-tel-link': {
    id: 'website-tel-link',
    channelCategory: 'Website',
    points: points(2, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'website-physical-address': {
    id: 'website-physical-address',
    channelCategory: 'Website',
    points: points(3, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'website-opening-hours': {
    id: 'website-opening-hours',
    channelCategory: 'Website',
    points: points(2, 2, 0, 0),
    businessCategories: ['food', 'retail'],
    queued: false,
  },
  'website-localbusiness-jsonld': {
    id: 'website-localbusiness-jsonld',
    channelCategory: 'Website',
    points: points(3, 4, 5, 4),
    businessCategories: null,
    queued: false,
  },
  'website-menu-jsonld': {
    id: 'website-menu-jsonld',
    channelCategory: 'Website',
    points: points(3, 0, 0, 0),
    businessCategories: ['food'],
    queued: false,
  },
  'website-gbp-name-address-phone': {
    id: 'website-gbp-name-address-phone',
    channelCategory: 'Website',
    points: points(4, 4, 4, 4),
    businessCategories: null,
    queued: false,
  },
  'google-listing': {
    id: 'google-listing',
    channelCategory: 'Google Business Profile',
    points: points(8, 8, 10, 8),
    businessCategories: null,
    queued: false,
  },
  'google-listing-phone-number': {
    id: 'google-listing-phone-number',
    channelCategory: 'Google Business Profile',
    points: points(2, 2, 2, 2),
    businessCategories: null,
    queued: false,
  },
  'google-listing-reviews': {
    id: 'google-listing-reviews',
    channelCategory: 'Google Business Profile',
    points: points(8, 4, 5, 5),
    businessCategories: null,
    queued: false,
  },
  'google-listing-photos': {
    id: 'google-listing-photos',
    channelCategory: 'Google Business Profile',
    points: points(3, 4, 3, 3),
    businessCategories: null,
    queued: false,
  },
  'google-listing-opening-times': {
    id: 'google-listing-opening-times',
    channelCategory: 'Google Business Profile',
    points: points(3, 3, 3, 3),
    businessCategories: null,
    queued: false,
  },
  'google-listing-primary-category': {
    id: 'google-listing-primary-category',
    channelCategory: 'Google Business Profile',
    points: points(4, 4, 4, 4),
    businessCategories: null,
    queued: false,
  },
  'google-listing-website-matches': {
    id: 'google-listing-website-matches',
    channelCategory: 'Google Business Profile',
    points: points(3, 3, 3, 3),
    businessCategories: null,
    queued: false,
  },
  'facebook-page': {
    id: 'facebook-page',
    channelCategory: 'Social Media',
    points: points(4, 3, 5, 4),
    businessCategories: null,
    queued: false,
  },
  'instagram-profile': {
    id: 'instagram-profile',
    channelCategory: 'Social Media',
    points: points(5, 4, 2, 3),
    businessCategories: null,
    queued: false,
  },
  'tiktok-profile': {
    id: 'tiktok-profile',
    channelCategory: 'Social Media',
    points: points(3, 3, 0, 2),
    businessCategories: ['food', 'retail', 'other'],
    queued: false,
  },
  'linkedin-profile': {
    id: 'linkedin-profile',
    channelCategory: 'Social Media',
    points: points(0, 0, 3, 3),
    businessCategories: ['services', 'other'],
    queued: false,
  },
  'youtube-profile': {
    id: 'youtube-profile',
    channelCategory: 'Social Media',
    points: points(0, 2, 0, 2),
    businessCategories: ['retail', 'other'],
    queued: false,
  },
  'uber-eats-listing': {
    id: 'uber-eats-listing',
    channelCategory: 'Food Delivery',
    points: points(3, 0, 0, 0),
    businessCategories: ['food'],
    queued: false,
  },
  'doordash-listing': {
    id: 'doordash-listing',
    channelCategory: 'Food Delivery',
    points: points(3, 0, 0, 0),
    businessCategories: ['food'],
    queued: false,
  },
  'deliveroo-listing': {
    id: 'deliveroo-listing',
    channelCategory: 'Food Delivery',
    points: points(3, 0, 0, 0),
    businessCategories: ['food'],
    queued: false,
  },
  'menulog-listing': {
    id: 'menulog-listing',
    channelCategory: 'Food Delivery',
    points: points(3, 0, 0, 0),
    businessCategories: ['food'],
    queued: false,
  },
}

export const CHECK_IDS = checkIdSchema.options

export function getCheckDefinition(id: CheckId): CheckDefinition {
  return CHECK_DEFINITIONS[id]
}

export function checksForCategory(category: BusinessCategory): CheckDefinition[] {
  return CHECK_IDS
    .map((id) => CHECK_DEFINITIONS[id])
    .filter((check) => check.businessCategories === null || check.businessCategories.includes(category))
}

export function isQueuedCheck(id: CheckId): boolean {
  return CHECK_DEFINITIONS[id].queued
}

export { allCategories }
