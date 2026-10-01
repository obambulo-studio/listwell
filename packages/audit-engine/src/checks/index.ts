import type { CheckContext } from "../context";
import type { CheckId, CheckResult } from "../types";
import {
  checkGoogleListing,
  checkGoogleListingOpeningTimes,
  checkGoogleListingPhone,
  checkGoogleListingPhotos,
  checkGoogleListingPrimaryCategory,
  checkGoogleListingRating,
  checkGoogleListingReviewCount,
  checkGoogleListingWebsiteMatches,
} from "./google";
import {
  checkDeliverooListing,
  checkDoorDashListing,
  checkFacebookPage,
  checkInstagramProfile,
  checkLinkedInProfile,
  checkMenulogListing,
  checkTikTokProfile,
  checkUberEatsListing,
  checkWebsite,
  checkYouTubeProfile,
} from "./presence";
import {
  checkSocialProfileBanner,
  checkSocialProfileFreshness,
  checkSocialProfileImageMatch,
} from "./social";
import {
  checkWebsite200,
  checkWebsiteAiVisibility,
  checkWebsiteCanonical,
  checkWebsiteGbpNap,
  checkWebsiteLocalBusinessJsonLd,
  checkWebsiteMenuJsonLd,
  checkWebsiteMetaDescription,
  checkWebsiteMobileResponsive,
  checkWebsiteOgImage,
  checkWebsitePerformance,
  checkWebsitePhysicalAddress,
  checkWebsiteRobots,
  checkWebsiteSitemap,
  checkWebsiteTelLink,
} from "./website";
import { checkWebsiteOpeningHours } from "./website-opening-hours";
import { checkWebsiteTitle } from "./website-title";

export type CheckRunner = (ctx: CheckContext) => Promise<CheckResult>;

export const CHECK_RUNNERS: Record<CheckId, CheckRunner> = {
  "deliveroo-listing": checkDeliverooListing,
  "doordash-listing": checkDoorDashListing,
  "facebook-page": checkFacebookPage,
  "google-listing": checkGoogleListing,
  "google-listing-opening-times": checkGoogleListingOpeningTimes,
  "google-listing-phone-number": checkGoogleListingPhone,
  "google-listing-photos": checkGoogleListingPhotos,
  "google-listing-primary-category": checkGoogleListingPrimaryCategory,
  "google-listing-rating": checkGoogleListingRating,
  "google-listing-review-count": checkGoogleListingReviewCount,
  "google-listing-website-matches": checkGoogleListingWebsiteMatches,
  "instagram-profile": checkInstagramProfile,
  "linkedin-profile": checkLinkedInProfile,
  "menulog-listing": checkMenulogListing,
  "social-profile-banner": checkSocialProfileBanner,
  "social-profile-freshness": checkSocialProfileFreshness,
  "social-profile-image-match": checkSocialProfileImageMatch,
  "tiktok-profile": checkTikTokProfile,
  "uber-eats-listing": checkUberEatsListing,
  website: checkWebsite,
  "website-200-299": checkWebsite200,
  "website-ai-visibility": checkWebsiteAiVisibility,
  "website-canonical": checkWebsiteCanonical,
  "website-gbp-name-address-phone": checkWebsiteGbpNap,
  "website-localbusiness-jsonld": checkWebsiteLocalBusinessJsonLd,
  "website-menu-jsonld": checkWebsiteMenuJsonLd,
  "website-meta-description": checkWebsiteMetaDescription,
  "website-mobile-responsive": checkWebsiteMobileResponsive,
  "website-og-image": checkWebsiteOgImage,
  "website-opening-hours": checkWebsiteOpeningHours,
  "website-performance": checkWebsitePerformance,
  "website-physical-address": checkWebsitePhysicalAddress,
  "website-robots": checkWebsiteRobots,
  "website-sitemap": checkWebsiteSitemap,
  "website-tel-link": checkWebsiteTelLink,
  "website-title": checkWebsiteTitle,
  "youtube-profile": checkYouTubeProfile,
};
