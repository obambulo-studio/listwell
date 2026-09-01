import { fetchErrorResult, noPlaceResult, type CheckContext } from '../context'
import { checkResult } from '../schemas'
import type { CheckResult } from '../types'

export async function checkGoogleListing(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(ctx.business.locations.some((location) => Boolean(location.googlePlaceId)))
}

export async function checkGoogleListingPhone(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()
    return checkResult(Boolean(place.nationalPhoneNumber))
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}

export async function checkGoogleListingReviews(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()

    const count = place.userRatingCount ?? 0
    const rating = place.rating ?? 0
    const hasGoodRating = rating >= 4.0
    const hasEnoughReviews = count >= 20
    const passesCheck = hasGoodRating && hasEnoughReviews

    let label = `${count} reviews with ${rating.toFixed(1)} rating. Good job!`
    if (!passesCheck) {
      if (!hasGoodRating && !hasEnoughReviews) {
        label = `Only ${count} reviews with ${rating.toFixed(1)} rating. Need ≥ 20 reviews with ≥ 4.0 rating.`
      } else if (!hasGoodRating) {
        label = `Rating is ${rating.toFixed(1)}, which is below 4.0 target.`
      } else {
        label = `Only ${count} reviews. Need at least 20 reviews.`
      }
    }

    return checkResult(passesCheck, label)
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}

export async function checkGoogleListingPhotos(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()
    const photoCount = place.photos?.length ?? 0
    const hasPhotos = photoCount > 0
    return checkResult(
      hasPhotos,
      hasPhotos ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} found` : 'No photos found on Google listing',
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}

export async function checkGoogleListingOpeningTimes(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()
    return checkResult(Boolean(place.currentOpeningHours))
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}

export async function checkGoogleListingPrimaryCategory(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()
    const hasTypes = Boolean(place.types && place.types.length > 0)
    const primary = place.types?.[0]
    return checkResult(hasTypes, primary ? `Primary category: ${primary}` : undefined)
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}

export async function checkGoogleListingWebsiteMatches(ctx: CheckContext): Promise<CheckResult> {
  try {
    const place = await ctx.getGooglePlace()
    if (!place) return noPlaceResult()
    const matches = Boolean(place.websiteUri && ctx.business.websiteUrl && place.websiteUri === ctx.business.websiteUrl)
    return checkResult(matches)
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching Google listing')
  }
}
