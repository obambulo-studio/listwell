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
} from "@listwell/audit-engine";
import type {
  AuditEngineEnv,
  FetchWebsiteOptions,
  GooglePlace,
  NominatimMatch,
  SocialSearchHit,
} from "@listwell/audit-engine";
import { z } from "zod";

import { lookupProvidersFromEnv } from "./audit-env";
import type { LookupProviders } from "./audit-env";
import {
  getCategoryIdFromGooglePlaceTypes,
  recommendedSocialMedia,
} from "./category";
import type { CategoryId } from "./category";
import { discoveredProfileSchema } from "./channel";
import type { DiscoveredProfile } from "./channel";

const socialChannelSchema = z.enum([
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "x",
]);
type SocialChannel = z.infer<typeof socialChannelSchema>;

export const placeCandidateSchema = z.object({
  address: z.string().optional(),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  id: z.string(),
  name: z.string(),
  score: z.number().optional(),
  source: z.enum(["google", "apple", "osm"]),
  suburb: z.string().optional(),
  types: z.array(z.string()).optional(),
  websiteUrl: z.string().optional(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

export const discoverRequestSchema = z.object({
  address: z.string().optional(),
  appleMapsId: z.string().optional(),
  businessName: z.string().min(1),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  facebookUrl: z.string().optional(),
  googlePlaceId: z.string().optional(),
  instagramUsername: z.string().optional(),
  linkedinUrl: z.string().optional(),
  listingUrl: z.string().optional(),
  near: z.string().optional(),
  tiktokUsername: z.string().optional(),
  websiteUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
});
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;

export const discoverResponseSchema = z.object({
  address: z.string().optional(),
  candidates: z.array(placeCandidateSchema),
  categoryId: z.enum(["food", "retail", "services", "other"]),
  profiles: z.array(discoveredProfileSchema),
  strongMatch: z.boolean().optional(),
});
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>;

export const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .trim();

export const namesMatch = (search: string, candidate: string): boolean => {
  const needle = normalizeName(search);
  const haystack = normalizeName(candidate);
  if (!needle || !haystack) {
    return false;
  }
  return haystack.includes(needle);
};

export const appleAddress = (lines?: string[]): string | undefined => {
  if (!lines || lines.length === 0) {
    return undefined;
  }
  return lines.join(", ");
};

export const candidateFromGooglePlace = (
  place: GooglePlace
): PlaceCandidate | null => {
  if (!place.id || !place.displayName?.text) {
    return null;
  }
  return placeCandidateSchema.parse({
    address: place.formattedAddress,
    categoryId: place.types
      ? getCategoryIdFromGooglePlaceTypes(place.types)
      : undefined,
    id: place.id,
    name: place.displayName.text,
    source: "google",
    types: place.types,
    websiteUrl: place.websiteUri,
  });
};

export const candidateFromNominatim = (match: NominatimMatch): PlaceCandidate =>
  placeCandidateSchema.parse({
    address: match.address,
    categoryId: match.categoryId,
    id: match.id,
    name: match.name,
    score: match.score,
    source: "osm",
    suburb: match.suburb,
    types: [match.osmType, match.osmClass].filter(Boolean),
    websiteUrl: match.websiteUrl,
  });

export const addUniqueProfile = (
  profiles: DiscoveredProfile[],
  profile: DiscoveredProfile
): void => {
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
};

const addWebsiteOrSocialFromUri = (
  profiles: DiscoveredProfile[],
  uri: string
): void => {
  if (uri.includes("facebook.com")) {
    addUniqueProfile(profiles, { title: uri, type: "facebook" });
    return;
  }
  if (uri.includes("instagram.com")) {
    addUniqueProfile(profiles, { title: uri, type: "instagram" });
    return;
  }
  addUniqueProfile(profiles, { title: uri, type: "website" });
};

export const profilesFromCandidates = (
  candidates: PlaceCandidate[],
  websiteUrl?: string
): DiscoveredProfile[] => {
  const profiles: DiscoveredProfile[] = [];
  if (websiteUrl) {
    profiles.push({ title: websiteUrl, type: "website" });
  }

  for (const candidate of candidates) {
    if (candidate.source === "google") {
      profiles.push({
        googlePlaceId: candidate.id,
        subtitle: candidate.address,
        title: candidate.name,
        type: "google-maps",
      });
      if (candidate.websiteUrl) {
        addWebsiteOrSocialFromUri(profiles, candidate.websiteUrl);
      }
    } else if (candidate.source === "apple") {
      profiles.push({
        appleMapsId: candidate.id,
        subtitle: candidate.address,
        title: candidate.name,
        type: "apple-maps",
      });
    } else if (candidate.websiteUrl) {
      addWebsiteOrSocialFromUri(profiles, candidate.websiteUrl);
    }
  }

  return profiles;
};

export const profilesFromUserInput = (
  request: DiscoverRequest
): DiscoveredProfile[] => {
  const profiles: DiscoveredProfile[] = [];
  if (request.websiteUrl) {
    profiles.push({ title: request.websiteUrl, type: "website" });
  }
  const listingId =
    request.listingUrl ??
    (request.googlePlaceId && isHttpUrl(request.googlePlaceId)
      ? request.googlePlaceId
      : undefined);
  if (listingId && isHttpUrl(listingId)) {
    profiles.push({
      googlePlaceId: listingId,
      subtitle: request.address,
      title: listingId,
      type: "google-maps",
    });
  }
  if (request.facebookUrl) {
    profiles.push({ title: request.facebookUrl, type: "facebook" });
  }
  if (request.instagramUsername) {
    profiles.push({ title: request.instagramUsername, type: "instagram" });
  }
  if (request.tiktokUsername) {
    profiles.push({ title: request.tiktokUsername, type: "tiktok" });
  }
  if (request.linkedinUrl) {
    profiles.push({ title: request.linkedinUrl, type: "linkedin" });
  }
  if (request.youtubeUrl) {
    profiles.push({ title: request.youtubeUrl, type: "youtube" });
  }
  return profiles;
};

export const profilesFromWebsite = async (
  websiteUrl: string,
  options: FetchWebsiteOptions = {}
): Promise<DiscoveredProfile[]> => {
  const html = await fetchWebsiteHtml(websiteUrl, options);
  const socials = socialsFromDocument(parseDocument(html));
  const profiles: DiscoveredProfile[] = [];
  if (socials.facebook) {
    profiles.push({ title: socials.facebook, type: "facebook" });
  }
  if (socials.instagram) {
    profiles.push({ title: socials.instagram, type: "instagram" });
  }
  if (socials.tiktok) {
    profiles.push({ title: socials.tiktok, type: "tiktok" });
  }
  if (socials.linkedin) {
    profiles.push({ title: socials.linkedin, type: "linkedin" });
  }
  if (socials.youtube) {
    profiles.push({ title: socials.youtube, type: "youtube" });
  }
  if (socials.x) {
    profiles.push({ title: socials.x, type: "x" });
  }
  return profiles;
};

export const pickSocialHit = (
  hits: SocialSearchHit[]
): SocialSearchHit | null => {
  const ranked = hits
    .filter((hit) => hit.score >= 0.7)
    .toSorted((left, right) => right.score - left.score);
  const [top] = ranked;
  return top ?? null;
};

export const socialProfileFromHit = (
  channel: SocialChannel,
  hit: SocialSearchHit
): DiscoveredProfile => {
  if (channel === "instagram" || channel === "tiktok" || channel === "x") {
    return { title: hit.username ?? hit.url, type: channel };
  }
  return { title: hit.url, type: channel };
};

export const filterProfilesForCandidate = (
  profiles: DiscoveredProfile[],
  candidate: PlaceCandidate
): DiscoveredProfile[] =>
  profiles.filter((profile) => {
    if (profile.type === "google-maps") {
      if (candidate.source === "google") {
        return profile.googlePlaceId === candidate.id;
      }
      return Boolean(
        profile.title && namesMatch(candidate.name, profile.title)
      );
    }
    if (profile.type === "apple-maps") {
      if (candidate.source === "apple") {
        return profile.appleMapsId === candidate.id;
      }
      return Boolean(
        profile.title && namesMatch(candidate.name, profile.title)
      );
    }
    return true;
  });

const categoryFromCandidates = (
  candidates: PlaceCandidate[],
  fallback: CategoryId
): CategoryId => {
  const google = candidates.find(
    (candidate) => candidate.source === "google" && candidate.types?.length
  );
  if (google?.types) {
    return getCategoryIdFromGooglePlaceTypes(google.types);
  }
  const osm = candidates.find(
    (candidate) => candidate.source === "osm" && candidate.categoryId
  );
  return osm?.categoryId ?? fallback;
};

const hasAppleConfig = (env: AuditEngineEnv): boolean =>
  Boolean(
    env.appleMapkitTeamId && env.appleMapkitKeyId && env.appleMapkitPrivateKey
  );

const placesId = (value: string | undefined): string | undefined => {
  if (!value || isHttpUrl(value)) {
    return undefined;
  }
  return value;
};

/** Build search query variants from business name and optional suburb/city. */
export const buildPlaceSearchQueries = (
  search: string,
  near?: string
): string[] => {
  const name = search.trim();
  const location = near?.trim() ?? "";
  if (!name) {
    return [];
  }
  if (!location) {
    return [name];
  }
  const variants = [
    `${name}, ${location}`,
    `${name} ${location}`,
    `${name}, ${location}, Australia`,
    name,
  ];
  const unique = new Set<string>();
  for (const variant of variants) {
    unique.add(variant);
  }
  return [...unique];
};

export const dedupePlaceCandidates = (
  candidates: PlaceCandidate[]
): PlaceCandidate[] => {
  const seen = new Set<string>();
  const unique: PlaceCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
};

const googleCandidates = async (
  request: DiscoverRequest,
  env: AuditEngineEnv
): Promise<PlaceCandidate[]> => {
  if (!env.googleApiKey) {
    return [];
  }

  const placeId = placesId(request.googlePlaceId);
  if (placeId) {
    const place = await fetchGooglePlace(placeId, env.googleApiKey);
    const candidate = place ? candidateFromGooglePlace(place) : null;
    return candidate ? [candidate] : [];
  }

  const near = request.near ?? request.address ?? "";
  const queries = buildPlaceSearchQueries(request.businessName, near);
  const { googleApiKey } = env;
  const searchResults = await Promise.all(
    queries.map((query) => searchGooglePlaces(query, googleApiKey))
  );
  const places = searchResults.flat();
  return dedupePlaceCandidates(
    places.flatMap((place) => {
      const candidate = candidateFromGooglePlace(place);
      if (!candidate || !namesMatch(request.businessName, candidate.name)) {
        return [];
      }
      return [candidate];
    })
  );
};

const appleCandidates = async (
  request: DiscoverRequest,
  env: AuditEngineEnv
): Promise<PlaceCandidate[]> => {
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
          address: appleAddress(place.formattedAddressLines),
          id: place.id,
          name: place.name,
          source: "apple",
        }),
      ];
    }

    const near = request.near ?? request.address ?? "";
    const queries = buildPlaceSearchQueries(request.businessName, near);
    const userLocation = near.trim() || undefined;
    const searchResults = await Promise.all(
      queries.map((query) => searchAppleMaps(query, env, fetch, userLocation))
    );
    const results = searchResults.flatMap((search) => search.results);
    return dedupePlaceCandidates(
      results.flatMap((place) => {
        if (!namesMatch(request.businessName, place.name)) {
          return [];
        }
        return [
          placeCandidateSchema.parse({
            address: appleAddress(place.formattedAddressLines),
            id: place.id,
            name: place.name,
            source: "apple",
          }),
        ];
      })
    );
  } catch {
    return [];
  }
};

const nominatimCandidates = async (
  request: DiscoverRequest,
  fetchImpl?: typeof fetch
): Promise<PlaceCandidate[]> => {
  const near = request.near ?? request.address ?? "";
  const matches = await searchNominatim(
    request.businessName,
    near,
    fetchImpl ? { fetchImpl } : {}
  );
  return matches.map(candidateFromNominatim);
};

const websiteFromSearch = async (
  businessName: string,
  env: AuditEngineEnv
): Promise<string | undefined> => {
  try {
    const results = await googleSearch(businessName, env);
    const match = results.find(
      (result) => namesMatch(businessName, result.title) && result.link
    );
    return match?.link;
  } catch {
    return undefined;
  }
};

const socialProfiles = async (
  businessName: string,
  categoryId: CategoryId,
  env: AuditEngineEnv
): Promise<DiscoveredProfile[]> => {
  const platforms = recommendedSocialMedia[categoryId].flatMap((channel) => {
    const parsed = socialChannelSchema.safeParse(channel);
    return parsed.success ? [parsed.data] : [];
  });

  const results = await Promise.all(
    platforms.map(async (platform) => {
      try {
        const hits = await searchSocial(platform, businessName, (query) =>
          googleSearch(query, env)
        );
        const hit = pickSocialHit(hits);
        return hit ? socialProfileFromHit(platform, hit) : null;
      } catch {
        return null;
      }
    })
  );

  return results.filter(
    (profile): profile is DiscoveredProfile => profile !== null
  );
};

export const discoverBusiness = async (
  input: DiscoverRequest,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions = {}
): Promise<DiscoverResponse> => {
  const request = discoverRequestSchema.parse(input);
  const [google, apple] = await Promise.all([
    googleCandidates(request, env),
    appleCandidates(request, env),
  ]);
  let candidates = [...google, ...apple];
  if (candidates.length === 0) {
    candidates = await nominatimCandidates(request, options.fetchImpl);
  }

  const categoryId = categoryFromCandidates(
    candidates,
    request.categoryId ?? "other"
  );
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
      profiles.push({ title: foundWebsite, type: "website" });
    }
  }

  const social = await socialProfiles(request.businessName, categoryId, env);
  for (const profile of social) {
    addUniqueProfile(profiles, profile);
  }

  const firstAddress =
    request.address ??
    candidates.find((candidate) => candidate.address)?.address;

  return discoverResponseSchema.parse({
    address: firstAddress,
    candidates,
    categoryId,
    profiles,
  });
};

export const lookupQuerySchema = z.object({
  id: z.string().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
  near: z.string().optional(),
  q: z.string().optional(),
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
});

export const lookupProvidersSchema = z.object({
  apple: z.boolean(),
  google: z.boolean(),
  osm: z.literal(true),
});

export const lookupResponseSchema = z.object({
  candidates: z.array(placeCandidateSchema),
  city: z.string().optional(),
  locality: z.string().optional(),
  providers: lookupProvidersSchema.optional(),
  strongMatchId: z.string().optional(),
  suburb: z.string().optional(),
});

const placeCandidateRank = (
  candidate: PlaceCandidate,
  search: string,
  near?: string
): number => {
  let score = namesMatch(search, candidate.name) ? 1 : 0;
  const normalizedNear = near ? normalizeName(near) : "";
  const addressText = normalizeName(
    [candidate.address, candidate.suburb].filter(Boolean).join(" ")
  );
  if (normalizedNear && addressText.includes(normalizedNear)) {
    score += 0.5;
  }
  if (candidate.score !== undefined) {
    score += candidate.score * 0.3;
  }
  return score;
};

export const rankPlaceCandidates = (
  candidates: PlaceCandidate[],
  search: string,
  near?: string
): PlaceCandidate[] =>
  [...candidates].toSorted(
    (left, right) =>
      placeCandidateRank(right, search, near) -
      placeCandidateRank(left, search, near)
  );

const searchGoogleCandidatesForQueries = async (
  queries: string[],
  env: AuditEngineEnv,
  fetchImpl: typeof fetch
): Promise<PlaceCandidate[]> => {
  if (!env.googleApiKey || queries.length === 0) {
    return [];
  }
  const { googleApiKey } = env;
  const batches = await Promise.all(
    queries.map((query) =>
      searchGooglePlaces(query, googleApiKey, fetchImpl).then((places) =>
        places.flatMap((place) => {
          const candidate = candidateFromGooglePlace(place);
          return candidate ? [candidate] : [];
        })
      )
    )
  );
  return dedupePlaceCandidates(batches.flat());
};

const searchAppleCandidatesForQueries = async (
  queries: string[],
  near: string | undefined,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch
): Promise<PlaceCandidate[]> => {
  if (!hasAppleConfig(env) || queries.length === 0) {
    return [];
  }
  try {
    const userLocation = near?.trim() || undefined;
    const batches = await Promise.all(
      queries.map((query) =>
        searchAppleMaps(query, env, fetchImpl, userLocation).then((result) =>
          result.results.map((place) =>
            placeCandidateSchema.parse({
              address: appleAddress(place.formattedAddressLines),
              id: place.id,
              name: place.name,
              source: "apple",
            })
          )
        )
      )
    );
    return dedupePlaceCandidates(batches.flat());
  } catch {
    return [];
  }
};

const lookupMapCandidates = async (
  search: string,
  near: string | undefined,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch,
  options: { wantGoogle: boolean; wantApple: boolean; includeOsm: boolean }
): Promise<{ candidates: PlaceCandidate[]; strongMatchId?: string }> => {
  const queries = buildPlaceSearchQueries(search, near);
  const trimmedNear = near?.trim() ?? "";

  const [google, apple, osmMatches] = await Promise.all([
    options.wantGoogle
      ? searchGoogleCandidatesForQueries(queries, env, fetchImpl)
      : Promise.resolve([]),
    options.wantApple
      ? searchAppleCandidatesForQueries(
          queries,
          trimmedNear || undefined,
          env,
          fetchImpl
        )
      : Promise.resolve([]),
    options.includeOsm && search.length >= 2
      ? searchNominatim(search, trimmedNear, { fetchImpl })
      : Promise.resolve([]),
  ]);

  let candidates = dedupePlaceCandidates([
    ...google,
    ...apple,
    ...osmMatches.map(candidateFromNominatim),
  ]);

  let strongMatchId = pickStrongMatch(osmMatches)?.id;

  if (
    candidates.length === 0 &&
    options.includeOsm &&
    search.length >= 2 &&
    !trimmedNear
  ) {
    const fallbackMatches = await searchNominatim(search, "", { fetchImpl });
    candidates = fallbackMatches.map(candidateFromNominatim);
    strongMatchId = pickStrongMatch(fallbackMatches)?.id;
  }

  if (!strongMatchId) {
    const namedGoogle = google.filter((candidate) =>
      namesMatch(search, candidate.name)
    );
    if (namedGoogle.length === 1) {
      strongMatchId = namedGoogle[0]?.id;
    }
  }

  return {
    candidates: rankPlaceCandidates(
      candidates,
      search,
      trimmedNear || undefined
    ).slice(0, 8),
    strongMatchId,
  };
};

const withLookupProviders = (
  response: z.infer<typeof lookupResponseSchema>,
  providers: LookupProviders
): z.infer<typeof lookupResponseSchema> =>
  lookupResponseSchema.parse({ ...response, providers });

type LookupQuery = z.infer<typeof lookupQuerySchema>;
type LookupResponse = z.infer<typeof lookupResponseSchema>;

const lookupNominatimReverse = async (
  parsed: LookupQuery,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  const lat = Number(parsed.lat);
  const lon = Number(parsed.lon);
  const locality = await reverseNominatim(lat, lon, { fetchImpl });
  return withLookupProviders(
    {
      candidates: [],
      city: locality?.city,
      locality: locality?.locality,
      suburb: locality?.suburb,
    },
    providers
  );
};

const lookupGooglePlaceById = async (
  parsed: LookupQuery,
  env: AuditEngineEnv,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  if (!parsed.id || !env.googleApiKey || isHttpUrl(parsed.id)) {
    return withLookupProviders({ candidates: [] }, providers);
  }
  const place = await fetchGooglePlace(parsed.id, env.googleApiKey, fetchImpl);
  const candidate = place ? candidateFromGooglePlace(place) : null;
  return withLookupProviders(
    { candidates: candidate ? [candidate] : [] },
    providers
  );
};

const lookupApplePlaceById = async (
  parsed: LookupQuery,
  env: AuditEngineEnv,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  if (!parsed.id || !hasAppleConfig(env)) {
    return withLookupProviders({ candidates: [] }, providers);
  }
  try {
    const place = await fetchApplePlace(parsed.id, env, fetchImpl);
    if (!place) {
      return withLookupProviders({ candidates: [] }, providers);
    }
    return withLookupProviders(
      {
        candidates: [
          placeCandidateSchema.parse({
            address: appleAddress(place.formattedAddressLines),
            id: place.id,
            name: place.name,
            source: "apple",
          }),
        ],
      },
      providers
    );
  } catch {
    return withLookupProviders({ candidates: [] }, providers);
  }
};

const lookupGoogleAutocomplete = async (
  search: string,
  env: AuditEngineEnv,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  if (!search || !env.googleApiKey) {
    return withLookupProviders({ candidates: [] }, providers);
  }
  const predictions = await autocompleteGooglePlaces(
    search,
    env.googleApiKey,
    fetchImpl
  );
  return withLookupProviders(
    {
      candidates: predictions.map((prediction) =>
        placeCandidateSchema.parse({
          address: prediction.description,
          id: prediction.id,
          name: prediction.title,
          source: "google",
          types: prediction.types,
        })
      ),
    },
    providers
  );
};

const lookupNominatimSearch = async (
  search: string,
  parsed: LookupQuery,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  if (search.length < 2) {
    return withLookupProviders({ candidates: [] }, providers);
  }
  const matches = await searchNominatim(search, parsed.near ?? "", {
    fetchImpl,
  });
  const candidates = matches.map(candidateFromNominatim);
  return withLookupProviders(
    {
      candidates,
      strongMatchId: pickStrongMatch(matches)?.id,
    },
    providers
  );
};

const lookupMapSearch = async (
  search: string,
  parsed: LookupQuery,
  env: AuditEngineEnv,
  providers: LookupProviders,
  fetchImpl: typeof fetch
): Promise<LookupResponse> => {
  if (!search) {
    return withLookupProviders({ candidates: [] }, providers);
  }
  const wantGoogle =
    parsed.source === "places" || parsed.source === "google-search";
  const wantApple =
    parsed.source === "places" || parsed.source === "apple-search";
  const includeOsm = parsed.source === "places";
  const { candidates, strongMatchId } = await lookupMapCandidates(
    search,
    parsed.near,
    env,
    fetchImpl,
    { includeOsm, wantApple, wantGoogle }
  );
  return withLookupProviders({ candidates, strongMatchId }, providers);
};

export const lookupPlaces = (
  query: LookupQuery,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch
): Promise<LookupResponse> => {
  const parsed = lookupQuerySchema.parse(query);
  const search = parsed.q?.trim() ?? "";
  const providers = lookupProvidersFromEnv(env);

  switch (parsed.source) {
    case "nominatim-reverse": {
      return lookupNominatimReverse(parsed, providers, fetchImpl);
    }
    case "google-place": {
      return lookupGooglePlaceById(parsed, env, providers, fetchImpl);
    }
    case "apple-place": {
      return lookupApplePlaceById(parsed, env, providers, fetchImpl);
    }
    case "google-autocomplete": {
      return lookupGoogleAutocomplete(search, env, providers, fetchImpl);
    }
    case "nominatim-search": {
      return lookupNominatimSearch(search, parsed, providers, fetchImpl);
    }
    default: {
      return lookupMapSearch(search, parsed, env, providers, fetchImpl);
    }
  }
};
