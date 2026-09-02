import { z } from 'zod'
import { googlePlaceSchema } from '../schemas'
import type { GooglePlace, PlacePrediction } from '../types'

export const AUSTRALIA_LOCATION_RESTRICTION = {
  rectangle: {
    low: { latitude: -44.0, longitude: 112.0 },
    high: { latitude: -10.0, longitude: 154.0 },
  },
} as const

const googlePlacesSearchSchema = z.object({
  places: z.array(googlePlaceSchema).optional(),
})

const googleAutocompleteSchema = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string(),
      types: z.array(z.string()).optional(),
      structuredFormat: z.object({
        mainText: z.object({ text: z.string() }),
        secondaryText: z.object({ text: z.string() }).optional(),
      }),
    }),
  })).optional(),
})

export function parseGooglePlacesSearch(value: unknown): GooglePlace[] {
  const parsed = googlePlacesSearchSchema.safeParse(value)
  if (!parsed.success) return []
  return (parsed.data.places ?? []).filter((place): place is GooglePlace & { id: string } => Boolean(place.id))
}

export function parseGooglePlaceAutocomplete(value: unknown): PlacePrediction[] {
  const parsed = googleAutocompleteSchema.safeParse(value)
  if (!parsed.success) return []
  return (parsed.data.suggestions ?? []).map((suggestion) => ({
    id: suggestion.placePrediction.placeId,
    title: suggestion.placePrediction.structuredFormat.mainText.text,
    description: suggestion.placePrediction.structuredFormat.secondaryText?.text,
    types: suggestion.placePrediction.types ?? [],
  }))
}

export async function searchGooglePlaces(
  query: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GooglePlace[]> {
  if (query.trim().length < 2) return []

  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types',
    },
    body: JSON.stringify({
      textQuery: query,
      includePureServiceAreaBusinesses: true,
      locationRestriction: AUSTRALIA_LOCATION_RESTRICTION,
    }),
  })

  if (!response.ok) return []
  return parseGooglePlacesSearch(await response.json())
}

export async function autocompleteGooglePlaces(
  query: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlacePrediction[]> {
  if (query.trim().length < 2) return []

  const response = await fetchImpl('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
    },
    body: JSON.stringify({
      input: query,
      locationRestriction: AUSTRALIA_LOCATION_RESTRICTION,
      includedPrimaryTypes: ['food', 'establishment', 'health', 'finance', 'general_contractor'],
    }),
  })

  if (!response.ok) return []
  return parseGooglePlaceAutocomplete(await response.json())
}

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
