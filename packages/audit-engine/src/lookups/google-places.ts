import { z } from "zod";

import { googlePlaceSchema } from "../schemas";
import type { GooglePlace, PlacePrediction } from "../types";

const PLACE_LIST_FIELD_MASK =
  "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types,places.primaryType,places.primaryTypeDisplayName,places.location,places.rating,places.userRatingCount,places.photos";

const GENERIC_PRIMARY_TYPES = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
  "establishment",
  "finance",
  "food",
  "general_contractor",
  "geocode",
  "health",
  "locality",
  "point_of_interest",
  "political",
  "postal_code",
  "premise",
  "route",
  "street_address",
  "sublocality",
]);

export const AUSTRALIA_LOCATION_RESTRICTION = {
  rectangle: {
    high: { latitude: -10, longitude: 154 },
    low: { latitude: -44, longitude: 112 },
  },
} as const;

const googlePlacesSearchSchema = z.object({
  places: z.array(googlePlaceSchema).optional(),
});

const googleAutocompleteSchema = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z.object({
          placeId: z.string(),
          structuredFormat: z.object({
            mainText: z.object({ text: z.string() }),
            secondaryText: z.object({ text: z.string() }).optional(),
          }),
          types: z.array(z.string()).optional(),
        }),
      })
    )
    .optional(),
});

export const specificPrimaryType = (
  type: string | undefined
): string | null => {
  if (!type || GENERIC_PRIMARY_TYPES.has(type)) {
    return null;
  }
  return type;
};

export const parseGooglePlacesSearch = (value: unknown): GooglePlace[] => {
  const parsed = googlePlacesSearchSchema.safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return (parsed.data.places ?? []).filter(
    (place): place is GooglePlace & { id: string } => Boolean(place.id)
  );
};

export const parseGooglePlaceAutocomplete = (
  value: unknown
): PlacePrediction[] => {
  const parsed = googleAutocompleteSchema.safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return (parsed.data.suggestions ?? []).map((suggestion) => ({
    description:
      suggestion.placePrediction.structuredFormat.secondaryText?.text,
    id: suggestion.placePrediction.placeId,
    title: suggestion.placePrediction.structuredFormat.mainText.text,
    types: suggestion.placePrediction.types ?? [],
  }));
};

export const searchGooglePlaces = async (
  query: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<GooglePlace[]> => {
  if (query.trim().length < 2) {
    return [];
  }

  const response = await fetchImpl(
    "https://places.googleapis.com/v1/places:searchText",
    {
      body: JSON.stringify({
        includePureServiceAreaBusinesses: true,
        locationRestriction: AUSTRALIA_LOCATION_RESTRICTION,
        textQuery: query,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types",
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return [];
  }
  return parseGooglePlacesSearch(await response.json());
};

export const autocompleteGooglePlaces = async (
  query: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<PlacePrediction[]> => {
  if (query.trim().length < 2) {
    return [];
  }

  const response = await fetchImpl(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      body: JSON.stringify({
        includedPrimaryTypes: [
          "food",
          "establishment",
          "health",
          "finance",
          "general_contractor",
        ],
        input: query,
        locationRestriction: AUSTRALIA_LOCATION_RESTRICTION,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return [];
  }
  return parseGooglePlaceAutocomplete(await response.json());
};

export const fetchGooglePlace = async (
  placeId: string,
  googleApiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<GooglePlace | null> => {
  const response = await fetchImpl(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      headers: {
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask":
          "id,displayName,nationalPhoneNumber,currentOpeningHours,websiteUri,reviews,userRatingCount,formattedAddress,rating,photos,types,primaryType,primaryTypeDisplayName,location,addressComponents",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const json: unknown = await response.json();
  const parsed = googlePlaceSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

export const locationPartsFromPlace = (
  place: GooglePlace
): {
  suburb: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  locationParts: string[];
} => {
  let suburb: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const component of place.addressComponents ?? []) {
    const types = component.types ?? [];
    const text = component.longText ?? component.shortText;
    if (!text) {
      continue;
    }
    const typeSet = new Set(types);
    if (typeSet.has("locality")) {
      city = text;
    } else if (
      typeSet.has("sublocality") ||
      typeSet.has("sublocality_level_1")
    ) {
      suburb = text;
    } else if (typeSet.has("administrative_area_level_1")) {
      state = text;
    } else if (typeSet.has("country")) {
      country = text;
    }
  }

  const locationParts: string[] = [];
  for (const part of (place.formattedAddress ?? "").split(",")) {
    const cleaned = part.trim().replaceAll(/\d+/gu, "").trim();
    if (cleaned.length > 1 && /[a-zA-Z]/u.test(cleaned)) {
      locationParts.push(cleaned);
    }
  }

  return { city, country, locationParts, state, suburb };
};

export interface NearbyPlaceSearch {
  googleApiKey: string;
  includedTypes: string[];
  latitude: number;
  longitude: number;
  maxResultCount?: number;
  radiusMeters: number;
}

export const searchNearbyPlaces = async (
  input: NearbyPlaceSearch,
  fetchImpl: typeof fetch = fetch
): Promise<GooglePlace[]> => {
  if (input.includedTypes.length === 0 || input.googleApiKey.length === 0) {
    return [];
  }

  const response = await fetchImpl(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      body: JSON.stringify({
        includedTypes: input.includedTypes,
        locationRestriction: {
          circle: {
            center: {
              latitude: input.latitude,
              longitude: input.longitude,
            },
            radius: input.radiusMeters,
          },
        },
        maxResultCount: input.maxResultCount ?? 10,
        rankPreference: "POPULARITY",
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.googleApiKey,
        "X-Goog-FieldMask": PLACE_LIST_FIELD_MASK,
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return [];
  }
  return parseGooglePlacesSearch(await response.json());
};

export const searchGooglePlacesNear = async (
  query: string,
  googleApiKey: string,
  center: { latitude: number; longitude: number },
  radiusMeters: number,
  fetchImpl: typeof fetch = fetch
): Promise<GooglePlace[]> => {
  if (query.trim().length < 2 || googleApiKey.length === 0) {
    return [];
  }

  const response = await fetchImpl(
    "https://places.googleapis.com/v1/places:searchText",
    {
      body: JSON.stringify({
        includePureServiceAreaBusinesses: true,
        locationBias: {
          circle: {
            center,
            radius: radiusMeters,
          },
        },
        maxResultCount: 8,
        textQuery: query,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
        "X-Goog-FieldMask": PLACE_LIST_FIELD_MASK,
      },
      method: "POST",
    }
  );

  if (!response.ok) {
    return [];
  }
  return parseGooglePlacesSearch(await response.json());
};
