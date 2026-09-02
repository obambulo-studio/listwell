import { fetchErrorResult, noListingResult, type CheckContext } from '../context'
import { hasAttachedListing, urlsMatch, type ListingEvidence } from '../lookups/listingEvidence'
import { checkResult } from '../schemas'
import type { CheckResult } from '../types'

interface ListingFacts {
  mode: 'listing' | 'website' | 'inconclusive' | 'missing'
  evidence: ListingEvidence
  reason?: string
}

async function listingFacts(ctx: CheckContext): Promise<ListingFacts> {
  const listing = await ctx.getListingEvidence()
  if (listing.sourceUrl && !listing.fetched) {
    return {
      mode: 'inconclusive',
      evidence: listing,
      reason: `Listing page could not be read: ${listing.fetchReason ?? 'unknown error'}`,
    }
  }
  if (listing.fetched) {
    return { mode: 'listing', evidence: listing }
  }

  const website = await ctx.getWebsiteEvidence()
  if (website.fetched) {
    return { mode: 'website', evidence: website }
  }
  return {
    mode: 'missing',
    evidence: listing,
    reason: listing.fetchReason ?? 'No Google listing URL or website facts to check',
  }
}

function sourceLabel(mode: ListingFacts['mode']): string {
  if (mode === 'listing') return 'pasted listing page'
  if (mode === 'website') return 'business website'
  return 'available sources'
}

export async function checkGoogleListing(ctx: CheckContext): Promise<CheckResult> {
  const attached = hasAttachedListing(ctx.business.locations)
  return checkResult(
    attached,
    attached
      ? 'A Google listing URL or identifier is attached to this audit'
      : 'No Google listing URL provided',
  )
}

export async function checkGoogleListingPhone(ctx: CheckContext): Promise<CheckResult> {
  try {
    const facts = await listingFacts(ctx)
    if (facts.mode === 'inconclusive') return checkResult(null, facts.reason)
    if (facts.mode === 'missing') return noListingResult(facts.reason)
    return checkResult(
      Boolean(facts.evidence.phone),
      facts.evidence.phone
        ? `Phone found on the ${sourceLabel(facts.mode)}: ${facts.evidence.phone}`
        : `No phone number found on the ${sourceLabel(facts.mode)}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}

export async function checkGoogleListingReviews(ctx: CheckContext): Promise<CheckResult> {
  try {
    const facts = await listingFacts(ctx)
    if (facts.mode === 'inconclusive') return checkResult(null, facts.reason)
    if (facts.mode === 'missing') {
      return checkResult(null, 'Review counts are not visible without a readable listing page or website schema. We do not invent ratings.')
    }

    const count = facts.evidence.reviewCount
    const rating = facts.evidence.rating
    if (count === undefined && rating === undefined) {
      return checkResult(
        null,
        `No aggregate rating was published on the ${sourceLabel(facts.mode)}. We do not invent review counts.`,
      )
    }

    const safeCount = count ?? 0
    const safeRating = rating ?? 0
    const passes = safeRating >= 4 && safeCount >= 20
    return checkResult(
      passes,
      `${safeCount} reviews with ${safeRating.toFixed(1)} rating on the ${sourceLabel(facts.mode)}${passes ? '' : '. Need ≥ 20 reviews with ≥ 4.0 rating.'}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}

export async function checkGoogleListingPhotos(ctx: CheckContext): Promise<CheckResult> {
  try {
    const listing = await ctx.getListingEvidence()
    if (listing.sourceUrl && !listing.fetched) {
      return checkResult(null, `Listing page could not be read: ${listing.fetchReason ?? 'unknown error'}`)
    }
    if (!listing.fetched) {
      return checkResult(null, 'Photos cannot be counted without a readable listing page. We do not invent photo counts.')
    }
    const photoCount = listing.photoCount ?? 0
    return checkResult(
      photoCount > 0,
      photoCount > 0
        ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} found on the pasted listing page`
        : 'No photos found on the pasted listing page',
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}

export async function checkGoogleListingOpeningTimes(ctx: CheckContext): Promise<CheckResult> {
  try {
    const facts = await listingFacts(ctx)
    if (facts.mode === 'inconclusive') return checkResult(null, facts.reason)
    if (facts.mode === 'missing') return noListingResult(facts.reason)
    return checkResult(
      Boolean(facts.evidence.hours),
      facts.evidence.hours
        ? `Opening hours found on the ${sourceLabel(facts.mode)}: ${facts.evidence.hours}`
        : `No opening hours found on the ${sourceLabel(facts.mode)}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}

export async function checkGoogleListingPrimaryCategory(ctx: CheckContext): Promise<CheckResult> {
  try {
    const facts = await listingFacts(ctx)
    if (facts.mode === 'inconclusive') return checkResult(null, facts.reason)
    if (facts.mode === 'missing') return noListingResult(facts.reason)
    return checkResult(
      Boolean(facts.evidence.category),
      facts.evidence.category
        ? `Category on the ${sourceLabel(facts.mode)}: ${facts.evidence.category}`
        : `No category found on the ${sourceLabel(facts.mode)}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}

export async function checkGoogleListingWebsiteMatches(ctx: CheckContext): Promise<CheckResult> {
  try {
    const listing = await ctx.getListingEvidence()
    if (listing.sourceUrl && !listing.fetched) {
      return checkResult(null, `Listing page could not be read: ${listing.fetchReason ?? 'unknown error'}`)
    }
    if (!listing.fetched) {
      return checkResult(null, 'No website link found on a listing page to compare.')
    }
    const matches = urlsMatch(listing.website, ctx.business.websiteUrl)
    return checkResult(
      matches,
      matches
        ? `Listing website matches ${ctx.business.websiteUrl}`
        : listing.website
          ? `Listing website ${listing.website} does not match ${ctx.business.websiteUrl ?? 'the stored website'}`
          : 'No website link found on the pasted listing page',
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error reading listing facts')
  }
}
