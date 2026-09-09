import { checkIdSchema } from "./schemas";
import type { BusinessCategory, CheckDefinition, CheckId } from "./types";

const allCategories: BusinessCategory[] = [
  "food",
  "retail",
  "services",
  "other",
];

const points = (
  food = 0,
  retail = 0,
  services = 0,
  other = 0
): Record<BusinessCategory, number> => ({ food, other, retail, services });

/**
 * Check IDs match `content/checks/*.md` filenames so Listwell reports stay
 * comparable with the upstream Nuxt engine.
 */
export const CHECK_DEFINITIONS: Record<CheckId, CheckDefinition> = {
  "deliveroo-listing": {
    businessCategories: ["food"],
    channelCategory: "Food Delivery",
    id: "deliveroo-listing",
    points: points(3, 0, 0, 0),
    queued: false,
  },
  "doordash-listing": {
    businessCategories: ["food"],
    channelCategory: "Food Delivery",
    id: "doordash-listing",
    points: points(3, 0, 0, 0),
    queued: false,
  },
  "facebook-page": {
    businessCategories: null,
    channelCategory: "Social Media",
    id: "facebook-page",
    points: points(4, 3, 5, 4),
    queued: false,
  },
  "google-listing": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing",
    points: points(8, 8, 10, 8),
    queued: false,
  },
  "google-listing-opening-times": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-opening-times",
    points: points(3, 3, 3, 3),
    queued: false,
  },
  "google-listing-phone-number": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-phone-number",
    points: points(2, 2, 2, 2),
    queued: false,
  },
  "google-listing-photos": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-photos",
    points: points(3, 4, 3, 3),
    queued: false,
  },
  "google-listing-primary-category": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-primary-category",
    points: points(4, 4, 4, 4),
    queued: false,
  },
  "google-listing-reviews": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-reviews",
    points: points(8, 4, 5, 5),
    queued: false,
  },
  "google-listing-website-matches": {
    businessCategories: null,
    channelCategory: "Google Business Profile",
    id: "google-listing-website-matches",
    points: points(3, 3, 3, 3),
    queued: false,
  },
  "instagram-profile": {
    businessCategories: null,
    channelCategory: "Social Media",
    id: "instagram-profile",
    points: points(5, 4, 2, 3),
    queued: false,
  },
  "linkedin-profile": {
    businessCategories: ["services", "other"],
    channelCategory: "Social Media",
    id: "linkedin-profile",
    points: points(0, 0, 3, 3),
    queued: false,
  },
  "menulog-listing": {
    businessCategories: ["food"],
    channelCategory: "Food Delivery",
    id: "menulog-listing",
    points: points(3, 0, 0, 0),
    queued: false,
  },
  "tiktok-profile": {
    businessCategories: ["food", "retail", "other"],
    channelCategory: "Social Media",
    id: "tiktok-profile",
    points: points(3, 3, 0, 2),
    queued: false,
  },
  "uber-eats-listing": {
    businessCategories: ["food"],
    channelCategory: "Food Delivery",
    id: "uber-eats-listing",
    points: points(3, 0, 0, 0),
    queued: false,
  },
  website: {
    businessCategories: null,
    channelCategory: "Website",
    id: "website",
    points: points(6, 8, 6, 7),
    queued: false,
  },
  "website-200-299": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-200-299",
    points: points(6, 8, 6, 7),
    queued: false,
  },
  "website-canonical": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-canonical",
    points: points(1, 2, 2, 2),
    queued: false,
  },
  "website-gbp-name-address-phone": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-gbp-name-address-phone",
    points: points(4, 4, 4, 4),
    queued: false,
  },
  "website-localbusiness-jsonld": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-localbusiness-jsonld",
    points: points(3, 4, 5, 4),
    queued: false,
  },
  "website-menu-jsonld": {
    businessCategories: ["food"],
    channelCategory: "Website",
    id: "website-menu-jsonld",
    points: points(3, 0, 0, 0),
    queued: false,
  },
  "website-meta-description": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-meta-description",
    points: points(2, 3, 3, 3),
    queued: false,
  },
  "website-mobile-responsive": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-mobile-responsive",
    points: points(6, 8, 6, 7),
    queued: false,
  },
  "website-og-image": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-og-image",
    points: points(1, 2, 2, 2),
    queued: false,
  },
  "website-opening-hours": {
    businessCategories: ["food", "retail"],
    channelCategory: "Website",
    id: "website-opening-hours",
    points: points(2, 2, 0, 0),
    queued: false,
  },
  "website-performance": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-performance",
    points: points(4, 6, 4, 5),
    queued: true,
  },
  "website-physical-address": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-physical-address",
    points: points(3, 2, 2, 2),
    queued: false,
  },
  "website-robots": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-robots",
    points: points(1, 2, 2, 2),
    queued: false,
  },
  "website-sitemap": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-sitemap",
    points: points(1, 1, 1, 1),
    queued: false,
  },
  "website-tel-link": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-tel-link",
    points: points(2, 2, 2, 2),
    queued: false,
  },
  "website-title": {
    businessCategories: null,
    channelCategory: "Website",
    id: "website-title",
    points: points(4, 6, 6, 5),
    queued: false,
  },
  "youtube-profile": {
    businessCategories: ["retail", "other"],
    channelCategory: "Social Media",
    id: "youtube-profile",
    points: points(0, 2, 0, 2),
    queued: false,
  },
};

export const CHECK_IDS = checkIdSchema.options;

export const getCheckDefinition = (id: CheckId): CheckDefinition =>
  CHECK_DEFINITIONS[id];

export const checksForCategory = (
  category: BusinessCategory
): CheckDefinition[] => {
  const checks: CheckDefinition[] = [];
  for (const id of CHECK_IDS) {
    const check = CHECK_DEFINITIONS[id];
    if (
      check &&
      (check.businessCategories === null ||
        new Set(check.businessCategories).has(category))
    ) {
      checks.push(check);
    }
  }
  return checks;
};

export const isQueuedCheck = (id: CheckId): boolean =>
  CHECK_DEFINITIONS[id].queued;

export { allCategories };
