import { fetchErrorResult, noWebsiteResult, type CheckContext } from '../context'
import { locationPartsFromPlace } from '../lookups/googlePlaces'
import { checkResult } from '../schemas'
import type { CheckResult } from '../types'

const STATE_MAPPING: Record<string, string[]> = {
  QLD: ['queensland'],
  NSW: ['new south wales'],
  VIC: ['victoria'],
  ACT: ['australian capital territory', 'canberra'],
  SA: ['south australia'],
  TAS: ['tasmania'],
  WA: ['western australia'],
  NT: ['northern territory'],
}

export async function checkWebsiteTitle(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()

  try {
    const document = await ctx.getWebsiteDocument()
    const title = document.querySelector('title')?.textContent?.trim() ?? ''
    if (!title) return checkResult(false, 'No title tag found on the website')

    const businessName = ctx.business.name.toLowerCase()
    const titleLower = title.toLowerCase()
    const normalizedTitle = titleLower
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const titleWords = normalizedTitle.split(' ').filter((word) => word.length > 2)
    const containsName = titleLower.includes(businessName)

    if (!containsName) {
      return checkResult(false, `Title missing business name: "${title}"`)
    }

    const place = await ctx.getGooglePlace()
    const locationInfo = place
      ? locationPartsFromPlace(place)
      : { suburb: null, city: null, state: null, country: null, locationParts: [] }

    const matchedLocations: string[] = []
    const checkLocationMatch = (locationValue: string | null): boolean => {
      if (!locationValue) return false
      const locLower = locationValue.toLowerCase()
      if (normalizedTitle.includes(locLower)) {
        matchedLocations.push(locationValue)
        return true
      }

      const locWords = locLower.split(/\s+/).filter((word) => word.length > 2)
      if (locWords.length > 1 && locWords.every((word) => titleWords.includes(word))) {
        matchedLocations.push(`${locationValue} (word match)`)
        return true
      }
      if (locWords.length === 1 && locWords[0] && titleWords.includes(locWords[0])) {
        matchedLocations.push(`${locationValue} (exact word)`)
        return true
      }

      if (locationValue.length <= 3 && /^[A-Z]+$/.test(locationValue)) {
        const altNames = STATE_MAPPING[locationValue]
        if (altNames) {
          for (const altName of altNames) {
            if (normalizedTitle.includes(altName)) {
              matchedLocations.push(`${locationValue} (as ${altName})`)
              return true
            }
          }
        }
      }
      return false
    }

    let containsLocation = checkLocationMatch(locationInfo.suburb)
      || checkLocationMatch(locationInfo.city)
      || checkLocationMatch(locationInfo.state)
      || checkLocationMatch(locationInfo.country)

    if (!containsLocation) {
      for (const part of locationInfo.locationParts) {
        if (checkLocationMatch(part)) {
          containsLocation = true
          break
        }
      }
    }

    if (!containsLocation && locationInfo.locationParts.length > 0) {
      const allPossibleLocWords = new Set<string>()
      for (const part of locationInfo.locationParts) {
        part.toLowerCase().split(/\s+/).filter((word) => word.length > 3).forEach((word) => allPossibleLocWords.add(word))
      }
      for (const loc of [locationInfo.suburb, locationInfo.city, locationInfo.state]) {
        if (loc) loc.toLowerCase().split(/\s+/).filter((word) => word.length > 3).forEach((word) => allPossibleLocWords.add(word))
      }
      for (const word of allPossibleLocWords) {
        if (titleWords.includes(word)) {
          containsLocation = true
          matchedLocations.push(`${word} (word match)`)
          break
        }
      }
    }

    const hasLocationInfo = locationInfo.locationParts.length > 0
      || Boolean(locationInfo.suburb)
      || Boolean(locationInfo.city)
      || Boolean(locationInfo.state)
    const passesCheck = containsName && (containsLocation || !hasLocationInfo)

    let debugInfo = ''
    if (!passesCheck && !containsLocation && hasLocationInfo) {
      const locationDetails = []
      if (locationInfo.suburb) locationDetails.push(`Suburb: ${locationInfo.suburb}`)
      if (locationInfo.city) locationDetails.push(`City: ${locationInfo.city}`)
      if (locationInfo.state) locationDetails.push(`State: ${locationInfo.state}`)
      if (locationInfo.locationParts.length > 0) locationDetails.push(`Address parts: ${locationInfo.locationParts.join(', ')}`)
      debugInfo = ` [${locationDetails.join('; ')}] [Title words: ${titleWords.join(', ')}]`
    } else if (passesCheck && matchedLocations.length > 0) {
      debugInfo = ` [Matched: ${matchedLocations.join(', ')}]`
    }

    return checkResult(
      passesCheck,
      passesCheck
        ? `Title contains business name and location${debugInfo}`
        : `Title missing location: "${title}"${debugInfo}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}
