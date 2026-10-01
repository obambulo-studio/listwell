import type { Business, CreateBusinessRequest } from "./schema";
import { coordinatesSchema, pinIdFromCoordinates } from "./seo-schema";
import type { Coordinates } from "./seo-schema";

export interface PlacePin extends Coordinates {
  pinId: string;
}

export const placePinFromCoordinates = (
  coordinates: Coordinates
): PlacePin => ({
  ...coordinatesSchema.parse(coordinates),
  pinId: pinIdFromCoordinates(coordinates),
});

export const businessPin = (business: Business): PlacePin | null => {
  for (const location of business.locations) {
    if (location.latitude === null || location.longitude === null) {
      continue;
    }
    const parsed = coordinatesSchema.safeParse({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    if (!parsed.success) {
      continue;
    }
    return {
      ...parsed.data,
      pinId: location.pinId ?? pinIdFromCoordinates(parsed.data),
    };
  }
  return null;
};

export const businessPlaceId = (business: Business): string | null => {
  for (const location of business.locations) {
    const placeId = location.googlePlaceId?.trim();
    if (placeId) {
      return placeId;
    }
  }
  return null;
};

/** Copies a Google Place pin onto the matching location. Leaves an existing pin. */
export const withDiscoveryPin = (
  locations: CreateBusinessRequest["locations"],
  candidate:
    | {
        id?: string;
        latitude?: number;
        longitude?: number;
        source?: string;
      }
    | undefined
): CreateBusinessRequest["locations"] => {
  if (!candidate || candidate.source !== "google") {
    return locations;
  }
  if (candidate.latitude === undefined || candidate.longitude === undefined) {
    return locations;
  }
  const parsed = coordinatesSchema.safeParse({
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  });
  if (!parsed.success) {
    return locations;
  }
  const pin = placePinFromCoordinates(parsed.data);
  if (locations.length === 0) {
    return [
      {
        googlePlaceId: candidate.id,
        latitude: pin.latitude,
        longitude: pin.longitude,
        pinId: pin.pinId,
      },
    ];
  }
  const matched = locations.find(
    (location) =>
      candidate.id !== undefined && location.googlePlaceId === candidate.id
  );
  const unpinned = locations.find(
    (location) => location.latitude === undefined
  );
  const chosen = matched ?? unpinned;
  if (!chosen || chosen.latitude !== undefined) {
    return locations;
  }
  return locations.map((location) => {
    if (location !== chosen) {
      return location;
    }
    return {
      ...location,
      googlePlaceId: location.googlePlaceId ?? candidate.id,
      latitude: pin.latitude,
      longitude: pin.longitude,
      pinId: pin.pinId,
    };
  });
};
