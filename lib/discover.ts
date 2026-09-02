import {
  autocompleteGooglePlaces,
  fetchApplePlace,
  fetchGooglePlace,
  fetchWebsiteHtml,
  googleSearch,
  isHttpUrl,
  parseDocument,
  pickStrongMatch,
  reverseNominatim,
  searchAppleMaps,
  searchGooglePlaces,
  searchNominatim,
  searchSocial,
  socialsFromDocument,
  type AuditEngineEnv,
  type FetchWebsiteOptions,
  type GooglePlace,
  type NominatimMatch,
  type SocialSearchHit,
} from "@listwell/audit-engine";
import { z } from "zod";
import {
  getCategoryIdFromGooglePlaceTypes,
  recommendedSocialMedia,
  type CategoryId,
} from "./category";
import { discoveredProfileSchema, type DiscoveredProfile } from "./channel";

const socialChannelSchema = z.enum(["facebook", "instagram", "tiktok", "linkedin", "youtube", "x"]);
type SocialChannel = z.infer<typeof socialChannelSchema>;

export const placeCandidateSchema = z.object({
  source: z.enum(["google", "apple", "osm"]),
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  websiteUrl: z.string().optional(),
  types: z.array(z.string()).optional(),
  suburb: z.string().optional(),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  score: z.number().optional(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

export const discoverRequestSchema = z.object({
  businessName: z.string().min(1),
  websiteUrl: z.string().optional(),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  googlePlaceId: z.string().optional(),
  appleMapsId: z.string().optional(),
  listingUrl: z.string().optional(),
  address: z.string().optional(),
  facebookUrl: z.string().optional(),
  instagramUsername: z.string().optional(),
  tiktokUsername: z.string().optional(),
  linkedinUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
  near: z.string().optional(),
});
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;

export const discoverResponseSchema = z.object({
  categoryId: z.enum(["food", "retail", "services", "other"]),
  candidates: z.array(placeCandidateSchema),
  profiles: z.array(discoveredProfileSchema),
  address: z.string().optional(),
  strongMatch: z.boolean().optional(),
});
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function namesMatch(search: string, candidate: string): boolean {
  const needle = normalizeName(search);
  const haystack = normalizeName(candidate);
  if (!needle || !haystack) {
    return false;
  }
  return haystack.includes(needle);
}

export function appleAddress(lines: string[] | undefined): string | undefined {
  if (!lines || lines.length === 0) {
    return undefined;
  }
  return lines.join(", ");
}

export function candidateFromGooglePlace(place: GooglePlace): PlaceCandidate | null {
  if (!place.id || !place.displayName?.text) {
    return null;
  }
  return placeCandidateSchema.parse({
    source: "google",
    id: place.id,
    name: place.displayName.text,
    address: place.formattedAddress,
    websiteUrl: place.websiteUri,
    types: place.types,
    categoryId: place.types ? getCategoryIdFromGooglePlaceTypes(place.types) : undefined,
  });
}

export function candidateFromNominatim(match: NominatimMatch): PlaceCandidate {
  return placeCandidateSchema.parse({
    source: "osm",
    id: match.id,
    name: match.name,
    address: match.address,
    websiteUrl: match.websiteUrl,
    types: [match.osmType, match.osmClass].filter(Boolean),
    suburb: match.suburb,
    categoryId: match.categoryId,
    score: match.score,
  });
}

export function addUniqueProfile(profiles: DiscoveredProfile[], profile: DiscoveredProfile): void {
  const exists = profiles.some((item) => {
    if (item.type !== profile.type) return false;
    if (item.title === profile.title) return true;
    if (profile.googlePlaceId && item.googlePlaceId === profile.googlePlaceId) return true;
    if (profile.appleMapsId && item.appleMapsId === profile.appleMapsId) return true;
    return false;
  });
  if (!exists) profiles.push(profile);
}

function addWebsiteOrSocialFromUri(profiles: DiscoveredProfile[], uri: string): void {
  if (uri.includes("facebook.com")) {
    addUniqueProfile(profiles, { type: "facebook", title: uri });
    return;
  }
  if (uri.includes("instagram.com")) {
    addUniqueProfile(profiles, { type: "instagram", title: uri });
    return;
  }
  addUniqueProfile(profiles, { type: "website", title: uri });
}

export function profilesFromCandidates(
  candidates: PlaceCandidate[],
  websiteUrl?: string,
): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = [];
  if (websiteUrl) {
    profiles.push({ type: "website", title: websiteUrl });
  }

  for (const candidate of candidates) {
    if (candidate.source === "google") {
      profiles.push({
        type: "google-maps",
        title: candidate.name,
        subtitle: candidate.address,
        googlePlaceId: candidate.id,
      });
      if (candidate.websiteUrl) {
        addWebsiteOrSocialFromUri(profiles, candidate.websiteUrl);
      }
    } else if (candidate.source === "apple") {
      profiles.push({
        type: "apple-maps",
        title: candidate.name,
        subtitle: candidate.address,
        appleMapsId: candidate.id,
      });
    } else if (candidate.websiteUrl) {
      addWebsiteOrSocialFromUri(profiles, candidate.websiteUrl);
    }
  }

  return profiles;
}

export function profilesFromUserInput(request: DiscoverRequest): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = [];
  if (request.websiteUrl) {
    profiles.push({ type: "website", title: request.websiteUrl });
  }
  const listingId = request.listingUrl ?? (request.googlePlaceId && isHttpUrl(request.googlePlaceId) ? request.googlePlaceId : undefined);
  if (listingId && isHttpUrl(listingId)) {
    profiles.push({
      type: "google-maps",
      title: listingId,
      subtitle: request.address,
      googlePlaceId: listingId,
    });
  }
  if (request.facebookUrl) {
    profiles.push({ type: "facebook", title: request.facebookUrl });
  }
  if (request.instagramUsername) {
    profiles.push({ type: "instagram", title: request.instagramUsername });
  }
  if (request.tiktokUsername) {
    profiles.push({ type: "tiktok", title: request.tiktokUsername });
  }
  if (request.linkedinUrl) {
    profiles.push({ type: "linkedin", title: request.linkedinUrl });
  }
  if (request.youtubeUrl) {
    profiles.push({ type: "youtube", title: request.youtubeUrl });
  }
  return profiles;
}

export async function profilesFromWebsite(
  websiteUrl: string,
  options: FetchWebsiteOptions = {},
): Promise<DiscoveredProfile[]> {
  const html = await fetchWebsiteHtml(websiteUrl, options);
  const socials = socialsFromDocument(parseDocument(html));
  const profiles: DiscoveredProfile[] = [];
  if (socials.facebook) profiles.push({ type: "facebook", title: socials.facebook });
  if (socials.instagram) profiles.push({ type: "instagram", title: socials.instagram });
  if (socials.tiktok) profiles.push({ type: "tiktok", title: socials.tiktok });
  if (socials.linkedin) profiles.push({ type: "linkedin", title: socials.linkedin });
  if (socials.youtube) profiles.push({ type: "youtube", title: socials.youtube });
  if (socials.x) profiles.push({ type: "x", title: socials.x });
  return profiles;
}

export function pickSocialHit(hits: SocialSearchHit[]): SocialSearchHit | null {
  const ranked = hits.filter((hit) => hit.score >= 0.7).sort((left, right) => right.score - left.score);
  return ranked[0] ?? null;
}

export function socialProfileFromHit(channel: SocialChannel, hit: SocialSearchHit): DiscoveredProfile {
  if (channel === "instagram" || channel === "tiktok" || channel === "x") {
    return { type: channel, title: hit.username ?? hit.url };
  }
  return { type: channel, title: hit.url };
}

export function filterProfilesForCandidate(
  profiles: DiscoveredProfile[],
  candidate: PlaceCandidate,
): DiscoveredProfile[] {
  return profiles.filter((profile) => {
    if (profile.type === "google-maps") {
      if (candidate.source === "google") {
        return profile.googlePlaceId === candidate.id;
      }
      return Boolean(profile.title && namesMatch(candidate.name, profile.title));
    }
    if (profile.type === "apple-maps") {
      if (candidate.source === "apple") {
        return profile.appleMapsId === candidate.id;
      }
      return Boolean(profile.title && namesMatch(candidate.name, profile.title));
    }
    return true;
  });
}

function categoryFromCandidates(candidates: PlaceCandidate[], fallback: CategoryId): CategoryId {
  const google = candidates.find((candidate) => candidate.source === "google" && candidate.types?.length);
  if (google?.types) {
    return getCategoryIdFromGooglePlaceTypes(google.types);
  }
  const osm = candidates.find((candidate) => candidate.source === "osm" && candidate.categoryId);
  return osm?.categoryId ?? fallback;
}

function hasAppleConfig(env: AuditEngineEnv): boolean {
  return Boolean(env.appleMapkitTeamId && env.appleMapkitKeyId && env.appleMapkitPrivateKey);
}

function placesId(value: string | undefined): string | undefined {
  if (!value || isHttpUrl(value)) return undefined;
  return value;
}

async function googleCandidates(
  request: DiscoverRequest,
  env: AuditEngineEnv,
): Promise<PlaceCandidate[]> {
  if (!env.googleApiKey) {
    return [];
  }

  const placeId = placesId(request.googlePlaceId);
  if (placeId) {
    const place = await fetchGooglePlace(placeId, env.googleApiKey);
    const candidate = place ? candidateFromGooglePlace(place) : null;
    return candidate ? [candidate] : [];
  }

  const places = await searchGooglePlaces(request.businessName, env.googleApiKey);
  return places
    .map(candidateFromGooglePlace)
    .filter((candidate): candidate is PlaceCandidate => candidate !== null)
    .filter((candidate) => namesMatch(request.businessName, candidate.name));
}

async function appleCandidates(
  request: DiscoverRequest,
  env: AuditEngineEnv,
): Promise<PlaceCandidate[]> {
  if (!hasAppleConfig(env)) {
    return [];
  }

  try {
    if (request.appleMapsId) {
      const place = await fetchApplePlace(request.appleMapsId, env);
      if (!place) {
        return [];
      }
      return [
        placeCandidateSchema.parse({
          source: "apple",
          id: place.id,
          name: place.name,
          address: appleAddress(place.formattedAddressLines),
        }),
      ];
    }

    const search = await searchAppleMaps(request.businessName, env);
    return search.results
      .filter((place) => namesMatch(request.businessName, place.name))
      .map((place) =>
        placeCandidateSchema.parse({
          source: "apple",
          id: place.id,
          name: place.name,
          address: appleAddress(place.formattedAddressLines),
        }),
      );
  } catch {
    return [];
  }
}

async function nominatimCandidates(request: DiscoverRequest, fetchImpl?: typeof fetch): Promise<PlaceCandidate[]> {
  const near = request.near ?? request.address ?? "";
  const matches = await searchNominatim(request.businessName, near, fetchImpl ? { fetchImpl } : {});
  return matches.map(candidateFromNominatim);
}

async function websiteFromSearch(businessName: string, env: AuditEngineEnv): Promise<string | undefined> {
  try {
    const results = await googleSearch(businessName, env);
    const match = results.find((result) => namesMatch(businessName, result.title) && result.link);
    return match?.link;
  } catch {
    return undefined;
  }
}

async function socialProfiles(
  businessName: string,
  categoryId: CategoryId,
  env: AuditEngineEnv,
): Promise<DiscoveredProfile[]> {
  const platforms = recommendedSocialMedia[categoryId].flatMap((channel) => {
    const parsed = socialChannelSchema.safeParse(channel);
    return parsed.success ? [parsed.data] : [];
  });

  const results = await Promise.all(
    platforms.map(async (platform) => {
      try {
        const hits = await searchSocial(platform, businessName, (query) => googleSearch(query, env));
        const hit = pickSocialHit(hits);
        return hit ? socialProfileFromHit(platform, hit) : null;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((profile): profile is DiscoveredProfile => profile !== null);
}

export async function discoverBusiness(
  input: DiscoverRequest,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions = {},
): Promise<DiscoverResponse> {
  const request = discoverRequestSchema.parse(input);
  const [google, apple] = await Promise.all([googleCandidates(request, env), appleCandidates(request, env)]);
  let candidates = [...google, ...apple];
  if (candidates.length === 0) {
    candidates = await nominatimCandidates(request, options.fetchImpl);
  }

  const categoryId = categoryFromCandidates(candidates, request.categoryId ?? "other");
  const profiles = profilesFromCandidates(candidates, request.websiteUrl);
  for (const profile of profilesFromUserInput(request)) {
    addUniqueProfile(profiles, profile);
  }

  if (request.websiteUrl) {
    try {
      const fromSite = await profilesFromWebsite(request.websiteUrl, options);
      for (const profile of fromSite) {
        addUniqueProfile(profiles, profile);
      }
    } catch {
      // Website fetch is best-effort. Stored URLs still run.
    }
  }

  if (!profiles.some((profile) => profile.type === "website")) {
    const foundWebsite = await websiteFromSearch(request.businessName, env);
    if (foundWebsite) {
      profiles.push({ type: "website", title: foundWebsite });
    }
  }

  const social = await socialProfiles(request.businessName, categoryId, env);
  for (const profile of social) {
    addUniqueProfile(profiles, profile);
  }

  const firstAddress = request.address ?? candidates.find((candidate) => candidate.address)?.address;

  return discoverResponseSchema.parse({
    categoryId,
    candidates,
    profiles,
    address: firstAddress,
  });
}

export const lookupQuerySchema = z.object({
  source: z.enum([
    "places",
    "google-search",
    "google-autocomplete",
    "google-place",
    "apple-search",
    "apple-place",
    "nominatim-search",
    "nominatim-reverse",
  ]),
  q: z.string().optional(),
  id: z.string().optional(),
  near: z.string().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
});

export const lookupResponseSchema = z.object({
  candidates: z.array(placeCandidateSchema),
  locality: z.string().optional(),
  suburb: z.string().optional(),
  city: z.string().optional(),
  strongMatchId: z.string().optional(),
});

export async function lookupPlaces(
  query: z.infer<typeof lookupQuerySchema>,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<z.infer<typeof lookupResponseSchema>> {
  const parsed = lookupQuerySchema.parse(query);
  const search = parsed.q?.trim() ?? "";

  if (parsed.source === "nominatim-reverse") {
    const lat = Number(parsed.lat);
    const lon = Number(parsed.lon);
    const locality = await reverseNominatim(lat, lon, { fetchImpl });
    return lookupResponseSchema.parse({
      candidates: [],
      locality: locality?.locality,
      suburb: locality?.suburb,
      city: locality?.city,
    });
  }

  if (parsed.source === "google-place") {
    if (!parsed.id || !env.googleApiKey || isHttpUrl(parsed.id)) {
      return lookupResponseSchema.parse({ candidates: [] });
    }
    const place = await fetchGooglePlace(parsed.id, env.googleApiKey, fetchImpl);
    const candidate = place ? candidateFromGooglePlace(place) : null;
    return lookupResponseSchema.parse({ candidates: candidate ? [candidate] : [] });
  }

  if (parsed.source === "apple-place") {
    if (!parsed.id || !hasAppleConfig(env)) {
      return lookupResponseSchema.parse({ candidates: [] });
    }
    try {
      const place = await fetchApplePlace(parsed.id, env, fetchImpl);
      if (!place) {
        return lookupResponseSchema.parse({ candidates: [] });
      }
      return lookupResponseSchema.parse({
        candidates: [
          placeCandidateSchema.parse({
            source: "apple",
            id: place.id,
            name: place.name,
            address: appleAddress(place.formattedAddressLines),
          }),
        ],
      });
    } catch {
      return lookupResponseSchema.parse({ candidates: [] });
    }
  }

  if (parsed.source === "google-autocomplete") {
    if (!search || !env.googleApiKey) {
      return lookupResponseSchema.parse({ candidates: [] });
    }
    const predictions = await autocompleteGooglePlaces(search, env.googleApiKey, fetchImpl);
    return lookupResponseSchema.parse({
      candidates: predictions.map((prediction) =>
        placeCandidateSchema.parse({
          source: "google",
          id: prediction.id,
          name: prediction.title,
          address: prediction.description,
          types: prediction.types,
        }),
      ),
    });
  }

  if (parsed.source === "nominatim-search") {
    if (search.length < 2) {
      return lookupResponseSchema.parse({ candidates: [] });
    }
    const matches = await searchNominatim(search, parsed.near ?? "", { fetchImpl });
    const candidates = matches.map(candidateFromNominatim);
    return lookupResponseSchema.parse({
      candidates,
      strongMatchId: pickStrongMatch(matches)?.id,
    });
  }

  const wantGoogle = parsed.source === "places" || parsed.source === "google-search";
  const wantApple = parsed.source === "places" || parsed.source === "apple-search";
  const [google, apple] = await Promise.all([
    wantGoogle && search && env.googleApiKey
      ? searchGooglePlaces(search, env.googleApiKey, fetchImpl).then((places) =>
          places
            .map(candidateFromGooglePlace)
            .filter((candidate): candidate is PlaceCandidate => candidate !== null),
        )
      : Promise.resolve([]),
    wantApple && search && hasAppleConfig(env)
      ? searchAppleMaps(search, env, fetchImpl)
          .then((result) =>
            result.results.map((place) =>
              placeCandidateSchema.parse({
                source: "apple",
                id: place.id,
                name: place.name,
                address: appleAddress(place.formattedAddressLines),
              }),
            ),
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  let candidates = [...google, ...apple];
  let strongMatchId: string | undefined;

  if (candidates.length === 0 && parsed.source === "places" && search.length >= 2) {
    const matches = await searchNominatim(search, parsed.near ?? "", { fetchImpl });
    candidates = matches.map(candidateFromNominatim);
    strongMatchId = pickStrongMatch(matches)?.id;
  } else {
    const named = google.filter((candidate) => namesMatch(search, candidate.name));
    if (named.length === 1) {
      strongMatchId = named[0]?.id;
    }
  }

  return lookupResponseSchema.parse({
    candidates,
    strongMatchId,
  });
}
