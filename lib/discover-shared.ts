// Schemas and helpers shared by the discover API and client components.
// Keep this file free of `@listwell/audit-engine` and Worker env imports so
// client bundles stay small.
import { z } from "zod";

import { discoveredProfileSchema } from "./channel";
import type { DiscoveredProfile } from "./channel";

export const placeCandidateSchema = z.object({
  address: z.string().optional(),
  categoryId: z.enum(["food", "retail", "services", "other"]).optional(),
  id: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  name: z.string(),
  score: z.number().optional(),
  source: z.enum(["google", "apple", "osm"]),
  suburb: z.string().optional(),
  types: z.array(z.string()).optional(),
  websiteUrl: z.string().optional(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

export const discoverResponseSchema = z.object({
  address: z.string().optional(),
  candidates: z.array(placeCandidateSchema),
  categoryDisplayLabel: z.string(),
  categoryId: z.enum(["food", "retail", "services", "other"]),
  profiles: z.array(discoveredProfileSchema),
  strongMatch: z.boolean().optional(),
  strongMatchId: z.string().optional(),
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
