import type { CheckContext } from '../context'
import type { CheckId, CheckResult } from '../types'
import {
  checkGoogleListing,
  checkGoogleListingOpeningTimes,
  checkGoogleListingPhone,
  checkGoogleListingPhotos,
  checkGoogleListingPrimaryCategory,
  checkGoogleListingReviews,
  checkGoogleListingWebsiteMatches,
} from './google'
import {
  checkDeliverooListing,
  checkDoorDashListing,
  checkFacebookPage,
  checkInstagramProfile,
  checkLinkedInProfile,
  checkMenulogListing,
  checkTikTokProfile,
  checkUberEatsListing,
  checkYouTubeProfile,
} from './presence'
import {
  checkWebsite,
  checkWebsite200,
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
} from './website'
import { checkWebsiteOpeningHours } from './website-opening-hours'
import { checkWebsiteTitle } from './website-title'

export type CheckRunner = (ctx: CheckContext) => Promise<CheckResult>

export const CHECK_RUNNERS: Record<CheckId, CheckRunner> = {
  website: checkWebsite,
  'website-200-299': checkWebsite200,
  'website-title': checkWebsiteTitle,
  'website-meta-description': checkWebsiteMetaDescription,
  'website-canonical': checkWebsiteCanonical,
  'website-robots': checkWebsiteRobots,
  'website-sitemap': checkWebsiteSitemap,
  'website-og-image': checkWebsiteOgImage,
  'website-performance': checkWebsitePerformance,
  'website-mobile-responsive': checkWebsiteMobileResponsive,
  'website-tel-link': checkWebsiteTelLink,
  'website-physical-address': checkWebsitePhysicalAddress,
  'website-opening-hours': checkWebsiteOpeningHours,
  'website-localbusiness-jsonld': checkWebsiteLocalBusinessJsonLd,
  'website-menu-jsonld': checkWebsiteMenuJsonLd,
  'website-gbp-name-address-phone': checkWebsiteGbpNap,
  'google-listing': checkGoogleListing,
  'google-listing-phone-number': checkGoogleListingPhone,
  'google-listing-reviews': checkGoogleListingReviews,
  'google-listing-photos': checkGoogleListingPhotos,
  'google-listing-opening-times': checkGoogleListingOpeningTimes,
  'google-listing-primary-category': checkGoogleListingPrimaryCategory,
  'google-listing-website-matches': checkGoogleListingWebsiteMatches,
  'facebook-page': checkFacebookPage,
  'instagram-profile': checkInstagramProfile,
  'tiktok-profile': checkTikTokProfile,
  'linkedin-profile': checkLinkedInProfile,
  'youtube-profile': checkYouTubeProfile,
  'uber-eats-listing': checkUberEatsListing,
  'doordash-listing': checkDoorDashListing,
  'deliveroo-listing': checkDeliverooListing,
  'menulog-listing': checkMenulogListing,
}
