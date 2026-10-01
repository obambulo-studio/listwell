import {
  fetchGooglePlace,
  locationPartsFromAddress,
} from "@listwell/audit-engine";

import { getAuditEngineEnv } from "./audit-env";
import { updateBusiness } from "./data";
import {
  businessPin,
  businessPlaceId,
  placePinFromCoordinates,
} from "./place-pin";
import type { PlacePin } from "./place-pin";
import type { Business } from "./schema";
import { coordinatesSchema } from "./seo-schema";

const locationInput = (
  location: Business["locations"][number],
  pin?: PlacePin
) => ({
  address: location.address ?? undefined,
  appleMapsId: location.appleMapsId ?? undefined,
  googlePlaceId: location.googlePlaceId ?? undefined,
  latitude: pin?.latitude ?? location.latitude ?? undefined,
  longitude: pin?.longitude ?? location.longitude ?? undefined,
  name: location.name ?? undefined,
  pinId: pin?.pinId ?? location.pinId ?? undefined,
});

/** Persists a pin when a scan already loaded a Google Place that has coordinates. */
export const persistMissingBusinessPin = async (
  business: Business
): Promise<Business> => {
  if (businessPin(business)) {
    return business;
  }
  const placeId = businessPlaceId(business);
  if (!placeId) {
    return business;
  }
  try {
    const env = await getAuditEngineEnv();
    if (!env.googleApiKey) {
      return business;
    }
    const place = await fetchGooglePlace(placeId, env.googleApiKey);
    if (!place?.location) {
      return business;
    }
    const parsed = coordinatesSchema.safeParse(place.location);
    if (!parsed.success) {
      return business;
    }
    const pin = placePinFromCoordinates(parsed.data);
    return await updateBusiness(business.id, {
      locations: business.locations.map((location) =>
        location.googlePlaceId === placeId
          ? locationInput(location, pin)
          : locationInput(location)
      ),
    });
  } catch (error) {
    console.error("Could not save the business pin", error);
    return business;
  }
};

export const suburbFromBusiness = (business: Business): string | null => {
  for (const location of business.locations) {
    const { suburb } = locationPartsFromAddress(location.address);
    if (suburb) {
      return suburb;
    }
  }
  return null;
};
