import {
  fetchWebsiteHtml,
  parseDocument,
  pickStrongMatch,
  reverseNominatim,
  searchNominatim,
  socialsFromDocument,
  type AuditEngineEnv,
  type FetchWebsiteOptions,
  type NominatimMatch,
} from "@listwell/audit-engine";
import { z } from "zod";
import { discoveredProfileSchema, type DiscoveredProfile } from "./channel";

export const placeCandidateSchema = z.object({
  source: z.enum(["osm", "google", "apple"]),
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
  listingUrl: z.string().optional(),
  address: z.string().optional(),
  facebookUrl: z.string().optional(),
  instagramUsername: z.string().optional(),
  tiktokUsername: z.string().optional(),
  linkedinUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
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
    if (item.type !== profile.type) return false
    if (item.title === profile.title) return true
    if (profile.googlePlaceId && item.googlePlaceId === profile.googlePlaceId) return true
    return false
  })
  if (!exists) profiles.push(profile)
}

export function profilesFromUserInput(request: DiscoverRequest): DiscoveredProfile[] {
  const profiles: DiscoveredProfile[] = []
  if (request.websiteUrl) {
    profiles.push({ type: "website", title: request.websiteUrl })
  }
  if (request.listingUrl) {
    profiles.push({
      type: "google-maps",
      title: request.listingUrl,
      subtitle: request.address,
      googlePlaceId: request.listingUrl,
    })
  }
  if (request.facebookUrl) {
    profiles.push({ type: "facebook", title: request.facebookUrl })
  }
  if (request.instagramUsername) {
    profiles.push({ type: "instagram", title: request.instagramUsername })
  }
  if (request.tiktokUsername) {
    profiles.push({ type: "tiktok", title: request.tiktokUsername })
  }
  if (request.linkedinUrl) {
    profiles.push({ type: "linkedin", title: request.linkedinUrl })
  }
  if (request.youtubeUrl) {
    profiles.push({ type: "youtube", title: request.youtubeUrl })
  }
  return profiles
}

export async function profilesFromWebsite(
  websiteUrl: string,
  options: FetchWebsiteOptions = {},
): Promise<DiscoveredProfile[]> {
  const html = await fetchWebsiteHtml(websiteUrl, options)
  const socials = socialsFromDocument(parseDocument(html))
  const profiles: DiscoveredProfile[] = []
  if (socials.facebook) profiles.push({ type: "facebook", title: socials.facebook })
  if (socials.instagram) profiles.push({ type: "instagram", title: socials.instagram })
  if (socials.tiktok) profiles.push({ type: "tiktok", title: socials.tiktok })
  if (socials.linkedin) profiles.push({ type: "linkedin", title: socials.linkedin })
  if (socials.youtube) profiles.push({ type: "youtube", title: socials.youtube })
  if (socials.x) profiles.push({ type: "x", title: socials.x })
  return profiles
}

export async function discoverBusiness(
  input: DiscoverRequest,
  _env: AuditEngineEnv,
  options: FetchWebsiteOptions = {},
): Promise<DiscoverResponse> {
  const request = discoverRequestSchema.parse(input)
  const profiles = profilesFromUserInput(request)
  const categoryId = request.categoryId ?? "other"

  if (request.websiteUrl) {
    try {
      const fromSite = await profilesFromWebsite(request.websiteUrl, options)
      for (const profile of fromSite) {
        addUniqueProfile(profiles, profile)
      }
    } catch {
      // Website fetch is best-effort. Stored URLs still run.
    }
  }

  return discoverResponseSchema.parse({
    categoryId,
    candidates: [],
    profiles,
    address: request.address,
  })
}

export const lookupQuerySchema = z.object({
  source: z.enum(["nominatim-search", "nominatim-reverse"]),
  q: z.string().optional(),
  near: z.string().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
})

export const lookupResponseSchema = z.object({
  candidates: z.array(placeCandidateSchema),
  locality: z.string().optional(),
  suburb: z.string().optional(),
  city: z.string().optional(),
  strongMatchId: z.string().optional(),
})

export async function lookupPlaces(
  query: z.infer<typeof lookupQuerySchema>,
  _env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<z.infer<typeof lookupResponseSchema>> {
  const parsed = lookupQuerySchema.parse(query)

  if (parsed.source === "nominatim-reverse") {
    const lat = Number(parsed.lat)
    const lon = Number(parsed.lon)
    const locality = await reverseNominatim(lat, lon, { fetchImpl })
    return lookupResponseSchema.parse({
      candidates: [],
      locality: locality?.locality,
      suburb: locality?.suburb,
      city: locality?.city,
    })
  }

  const search = parsed.q?.trim() ?? ""
  if (search.length < 2) {
    return lookupResponseSchema.parse({ candidates: [] })
  }

  const matches = await searchNominatim(search, parsed.near ?? "", { fetchImpl })
  const candidates = matches.map(candidateFromNominatim)
  const strong = pickStrongMatch(matches)
  return lookupResponseSchema.parse({
    candidates,
    strongMatchId: strong?.id,
  })
}
