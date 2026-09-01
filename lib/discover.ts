import {
  autocompleteGooglePlaces,
  fetchApplePlace,
  fetchGooglePlace,
  googleSearch,
  searchAppleMaps,
  searchGooglePlaces,
  searchSocial,
  type AuditEngineEnv,
  type GooglePlace,
  type SocialSearchHit,
} from "@listwell/audit-engine";
import { z } from "zod";
import {
  getCategoryIdFromGooglePlaceTypes,
  recommendedSocialMedia,
  type CategoryId,
} from "./category";
import { discoveredProfileSchema, type DiscoveredProfile } from "./channel";

const SOCIAL_CHANNELS = ["facebook", "instagram", "tiktok", "linkedin", "youtube", "x"] as const;
type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

export const placeCandidateSchema = z.object({
  source: z.enum(["google", "apple"]),
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  websiteUrl: z.string().optional(),
  types: z.array(z.string()).optional(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

export const discoverRequestSchema = z.object({
  businessName: z.string().min(1),
  websiteUrl: z.string().optional(),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  googlePlaceId: z.string().optional(),
  appleMapsId: z.string().optional(),
});
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;

export const discoverResponseSchema = z.object({
  categoryId: z.enum(["food", "retail", "services", "other"]),
  candidates: z.array(placeCandidateSchema),
  profiles: z.array(discoveredProfileSchema),
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
  });
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
    } else {
      profiles.push({
        type: "apple-maps",
        title: candidate.name,
        subtitle: candidate.address,
        appleMapsId: candidate.id,
      });
    }
  }

  return profiles;
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

function addUniqueProfile(profiles: DiscoveredProfile[], profile: DiscoveredProfile): void {
  const exists = profiles.some((item) => {
    if (item.type !== profile.type) {
      return false;
    }
    if (item.title === profile.title) {
      return true;
    }
    if (profile.googlePlaceId && item.googlePlaceId === profile.googlePlaceId) {
      return true;
    }
    if (profile.appleMapsId && item.appleMapsId === profile.appleMapsId) {
      return true;
    }
    return false;
  });
  if (!exists) {
    profiles.push(profile);
  }
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
  return fallback;
}

function hasAppleConfig(env: AuditEngineEnv): boolean {
  return Boolean(env.appleMapkitTeamId && env.appleMapkitKeyId && env.appleMapkitPrivateKey);
}

async function googleCandidates(
  request: DiscoverRequest,
  env: AuditEngineEnv,
): Promise<PlaceCandidate[]> {
  if (!env.googleApiKey) {
    return [];
  }

  if (request.googlePlaceId) {
    const place = await fetchGooglePlace(request.googlePlaceId, env.googleApiKey);
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
  const platforms = recommendedSocialMedia[categoryId].filter((channel): channel is SocialChannel =>
    SOCIAL_CHANNELS.includes(channel as SocialChannel),
  );

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
): Promise<DiscoverResponse> {
  const request = discoverRequestSchema.parse(input);
  const [google, apple] = await Promise.all([googleCandidates(request, env), appleCandidates(request, env)]);
  const candidates = [...google, ...apple];
  const categoryId = categoryFromCandidates(candidates, request.categoryId ?? "other");

  const profiles = profilesFromCandidates(candidates, request.websiteUrl);
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

  return discoverResponseSchema.parse({
    categoryId,
    candidates,
    profiles,
  });
}

export const lookupQuerySchema = z.object({
  source: z.enum(["places", "google-search", "google-autocomplete", "google-place", "apple-search", "apple-place"]),
  q: z.string().optional(),
  id: z.string().optional(),
});

export const lookupResponseSchema = z.object({
  candidates: z.array(placeCandidateSchema),
});

export async function lookupPlaces(
  query: z.infer<typeof lookupQuerySchema>,
  env: AuditEngineEnv,
): Promise<PlaceCandidate[]> {
  const parsed = lookupQuerySchema.parse(query);
  const search = parsed.q?.trim() ?? "";

  if (parsed.source === "google-place") {
    if (!parsed.id || !env.googleApiKey) {
      return [];
    }
    const place = await fetchGooglePlace(parsed.id, env.googleApiKey);
    const candidate = place ? candidateFromGooglePlace(place) : null;
    return candidate ? [candidate] : [];
  }

  if (parsed.source === "apple-place") {
    if (!parsed.id || !hasAppleConfig(env)) {
      return [];
    }
    try {
      const place = await fetchApplePlace(parsed.id, env);
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
    } catch {
      return [];
    }
  }

  if (parsed.source === "google-autocomplete") {
    if (!search || !env.googleApiKey) {
      return [];
    }
    const predictions = await autocompleteGooglePlaces(search, env.googleApiKey);
    return predictions.map((prediction) =>
      placeCandidateSchema.parse({
        source: "google",
        id: prediction.id,
        name: prediction.title,
        address: prediction.description,
        types: prediction.types,
      }),
    );
  }

  const wantGoogle = parsed.source === "places" || parsed.source === "google-search";
  const wantApple = parsed.source === "places" || parsed.source === "apple-search";
  const [google, apple] = await Promise.all([
    wantGoogle && search && env.googleApiKey
      ? searchGooglePlaces(search, env.googleApiKey).then((places) =>
          places
            .map(candidateFromGooglePlace)
            .filter((candidate): candidate is PlaceCandidate => candidate !== null),
        )
      : Promise.resolve([]),
    wantApple && search && hasAppleConfig(env)
      ? searchAppleMaps(search, env)
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

  return [...google, ...apple];
}

