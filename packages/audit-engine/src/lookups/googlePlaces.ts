import { googlePlaceSchema } from '../schemas'
import type { GooglePlace } from '../types'

export async function fetchGooglePlace(
  placeId: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GooglePlace | null> {
  const response = await fetchImpl(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-FieldMask': 'id,displayName,nationalPhoneNumber,currentOpeningHours,websiteUri,reviews,userRatingCount,formattedAddress,rating,photos,types,addressComponents',
      'X-Goog-Api-Key': googleApiKey,
    },
  })

  if (!response.ok) return null

  const json: unknown = await response.json()
  const parsed = googlePlaceSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export function locationPartsFromPlace(place: GooglePlace): {
  suburb: string | null
  city: string | null
  state: string | null
  country: string | null
  locationParts: string[]
} {
  let suburb: string | null = null
  let city: string | null = null
  let state: string | null = null
  let country: string | null = null

  for (const component of place.addressComponents ?? []) {
    const types = component.types ?? []
    const text = component.longText ?? component.shortText
    if (!text) continue
    if (types.includes('locality')) city = text
    else if (types.includes('sublocality') || types.includes('sublocality_level_1')) suburb = text
    else if (types.includes('administrative_area_level_1')) state = text
    else if (types.includes('country')) country = text
  }

  const locationParts = (place.formattedAddress ?? '')
    .split(',')
    .map((part) => part.trim().replace(/\d+/g, '').trim())
    .filter((part) => part.length > 1 && /[a-zA-Z]/.test(part))

  return { suburb, city, state, country, locationParts }
}
