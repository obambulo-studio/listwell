import {
  createCheckContext,
  fetchApplePlace,
  fetchGooglePlace,
  firstGooglePlaceId,
  isHttpUrl,
  searchNominatim,
  type AuditEngineEnv,
  type BusinessSnapshot,
  type FetchWebsiteOptions,
  type ListingEvidence,
  type NominatimMatch,
} from "@listwell/audit-engine";
import { z } from "zod";

export const listingReviewSourceIdSchema = z.enum([
  "audit_record",
  "website",
  "listing_page",
  "google_places",
  "apple_maps",
  "openstreetmap",
]);

export type ListingReviewSourceId = z.infer<typeof listingReviewSourceIdSchema>;

export const listingReviewSourceSchema = z.object({
  address: z.string().optional(),
  category: z.string().optional(),
  hours: z.string().optional(),
  id: listingReviewSourceIdSchema,
  label: z.string().min(1),
  name: z.string().optional(),
  phone: z.string().optional(),
  photoCount: z.number().int().nonnegative().optional(),
  rating: z.number().optional(),
  recentReviews: z
    .array(
      z.object({
        rating: z.number().optional(),
        text: z.string().min(1),
      })
    )
    .optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  website: z.string().optional(),
});

export const listingReviewInputSchema = z.object({
  auditBusinessName: z.string().min(1),
  category: z.string().min(1),
  fingerprint: z.string().min(1),
  sources: z.array(listingReviewSourceSchema).min(1),
});

export type ListingReviewInput = z.infer<typeof listingReviewInputSchema>;
export type ListingReviewSource = z.infer<typeof listingReviewSourceSchema>;

const evidenceSource = (
  id: ListingReviewSourceId,
  label: string,
  evidence: ListingEvidence
): ListingReviewSource | null => {
  if (!evidence.fetched) {
    return null;
  }
  return listingReviewSourceSchema.parse({
    address: evidence.address,
    category: evidence.category,
    hours: evidence.hours,
    id,
    label,
    name: evidence.name,
    phone: evidence.phone,
    photoCount: evidence.photoCount,
    rating: evidence.rating,
    reviewCount: evidence.reviewCount,
    website: evidence.website,
  });
};

const osmSource = (match: NominatimMatch): ListingReviewSource =>
  listingReviewSourceSchema.parse({
    address: match.address,
    category: [match.osmType, match.osmClass].filter(Boolean).join(" / "),
    hours: match.hours,
    id: "openstreetmap",
    label: "OpenStreetMap",
    name: match.name,
    phone: match.phone,
    website: match.websiteUrl,
  });

const auditRecordSource = (business: BusinessSnapshot): ListingReviewSource => {
  const location = business.locations[0];
  return listingReviewSourceSchema.parse({
    address: location?.address ?? undefined,
    id: "audit_record",
    label: "Your Listwell audit",
    name: location?.name ?? business.name,
    website: business.websiteUrl ?? undefined,
  });
};

const bytesToHex = (bytes: Uint8Array): string => {
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return hex.join("");
};

const fingerprintFromSources = async (
  sources: ListingReviewSource[]
): Promise<string> => {
  const stable = sources.map((source) => ({
    address: source.address ?? null,
    category: source.category ?? null,
    hours: source.hours ?? null,
    id: source.id,
    name: source.name ?? null,
    phone: source.phone ?? null,
    photoCount: source.photoCount ?? null,
    rating: source.rating ?? null,
    reviewCount: source.reviewCount ?? null,
    website: source.website ?? null,
  }));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(stable))
  );
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
};

export const gatherListingReviewInput = async (input: {
  business: BusinessSnapshot;
  engineEnv: AuditEngineEnv;
  fetchOptions: FetchWebsiteOptions;
}): Promise<ListingReviewInput> => {
  const { business, engineEnv, fetchOptions } = input;
  const ctx = createCheckContext(business, engineEnv, fetchOptions);
  const sources: ListingReviewSource[] = [auditRecordSource(business)];

  const location = business.locations[0];
  const near = location?.address ?? "";
  const osmPromise = searchNominatim(business.name, near, {
    fetchImpl: ctx.fetchImpl,
  }).then((matches) => matches[0] ?? null);

  const websitePromise = ctx.getWebsiteEvidence().catch(() => null);
  const listingPromise = ctx.getListingEvidence().catch(() => null);

  const placeId = firstGooglePlaceId(business);
  const googleApiPromise =
    placeId && !isHttpUrl(placeId) && engineEnv.googleApiKey
      ? fetchGooglePlace(placeId, engineEnv.googleApiKey, ctx.fetchImpl).catch(
          () => null
        )
      : Promise.resolve(null);

  const appleId = business.locations.find((row) => row.appleMapsId)?.appleMapsId;
  const applePromise =
    appleId && engineEnv.appleMapkitTeamId
      ? fetchApplePlace(appleId, engineEnv, ctx.fetchImpl).catch(() => null)
      : Promise.resolve(null);

  const [website, listing, googlePlace, applePlace, osmMatch] =
    await Promise.all([
      websitePromise,
      listingPromise,
      googleApiPromise,
      applePromise,
      osmPromise,
    ]);

  const fromWebsite = website
    ? evidenceSource("website", "Business website", website)
    : null;
  if (fromWebsite) {
    sources.push(fromWebsite);
  }

  const fromListing = listing
    ? evidenceSource("listing_page", "Google listing page", listing)
    : null;
  if (fromListing) {
    sources.push(fromListing);
  }

  if (googlePlace) {
    sources.push(
      listingReviewSourceSchema.parse({
        address: googlePlace.formattedAddress,
        category: googlePlace.types?.slice(0, 3).join(", "),
        id: "google_places",
        label: "Google Places",
        name: googlePlace.displayName?.text,
        phone: googlePlace.nationalPhoneNumber,
        photoCount: googlePlace.photos?.length,
        rating: googlePlace.rating,
        reviewCount: googlePlace.userRatingCount,
        website: googlePlace.websiteUri,
      })
    );
  }

  if (applePlace) {
    sources.push(
      listingReviewSourceSchema.parse({
        address: applePlace.formattedAddressLines?.join(", "),
        id: "apple_maps",
        label: "Apple Maps",
        name: applePlace.name,
      })
    );
  }

  if (osmMatch) {
    sources.push(osmSource(osmMatch));
  }

  const parsedSources = z.array(listingReviewSourceSchema).parse(sources);
  return listingReviewInputSchema.parse({
    auditBusinessName: business.name,
    category: business.category,
    fingerprint: await fingerprintFromSources(parsedSources),
    sources: parsedSources,
  });
};
