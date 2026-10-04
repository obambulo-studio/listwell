import {
  businessSnapshotSchema,
  checksForCategory as engineChecksForCategory,
  fetchGooglePlace,
  isHttpUrl,
  locationPartsFromPlace,
  runChecks,
  searchGooglePlacesNear,
  searchNearbyPlaces,
  specificPrimaryType,
} from "@listwell/audit-engine";
import type {
  AuditEngineEnv,
  BusinessSnapshot,
  CheckResult,
  FetchWebsiteOptions,
  GooglePlace,
} from "@listwell/audit-engine";
import { z } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getExecutionContext,
  getFetchWebsiteOptions,
} from "./audit-env";
import {
  competitorTypesFor,
  getCategoryIdFromGooglePlaceTypes,
  primaryGooglePlaceTypeLabel,
} from "./category";
import type { CompetitorTypeQuery } from "./category";
import type { DiscoveredProfile } from "./channel";
import { scorePercent } from "./chat-onboarding";
import { checksForCategory } from "./checks/registry";
import { persistCompetitorPeriod } from "./competitor-snapshot";
import type { SnapshotPeer } from "./competitor-snapshot";
import { getLatestCompleteScanDetails, getResearchEntitlement } from "./data";
import {
  addUniqueProfile,
  profilesFromWebsite,
  socialProfiles,
} from "./discover";
import { mapProfilesToBusinessData } from "./profiles";
import { convexObservationStore } from "./research-observations";
import { cellsHeldInGrid, positionForHost } from "./research-report";
import type { NextFixCheck } from "./research-report";
import { runInSeries } from "./run-in-series";
import { SCAN_REUSE_WINDOW_MS } from "./scan-freshness";
import type { Business } from "./schema";
import {
  hiddenCompetitorPlaceIdsSchema,
  MAX_COMPETITORS,
  MAX_HIDDEN_COMPETITORS,
  pinnedCompetitorsSchema,
  readObservationPayload,
  researchPeriodStart,
} from "./seo-schema";
import type {
  OrganicSerpPayload,
  PinnedCompetitor,
  RankGridPayload,
  SeoObservationRow,
} from "./seo-schema";

export const PEER_LIMIT = 3;
export const NEARBY_RADIUS_METERS = 5000;
export const WIDENED_RADIUS_METERS = 15_000;
const NEARBY_RESULT_COUNT = 10;
const NEARBY_SEARCH_COUNT = 20;
const PEER_JOB_TTL_SECONDS = 60 * 60 * 24;
const PEER_RUNNING_WINDOW_MS = 30 * 60 * 1000;
const PLACE_ID_PREFIX = /^places\//u;

export const PEER_ORDER_CAPTION =
  "Peers are the closest businesses of the same kind. A similar type fills in when few exact matches are nearby.";

const peerCheckSchema = z.object({
  fromSearch: z.boolean().optional(),
  label: z.string().optional(),
  value: z.boolean().nullable(),
});

export const peerColumnSchema = z.object({
  checks: z.record(z.string(), peerCheckSchema),
  distanceMetres: z.number().nonnegative().nullable().optional(),
  fail: z.number(),
  mapPackPhrase: z.string().optional(),
  name: z.string(),
  pass: z.number(),
  photoCount: z.number().int().nonnegative().nullable().optional(),
  phraseCells: z.record(z.string(), z.number().int().min(0).max(9)).optional(),
  phrasePosition: z.record(z.string(), z.number().int().positive()).optional(),
  placeId: z.string(),
  primaryCategory: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),
  score: z.number(),
  skipped: z.number(),
  source: z.enum(["pinned", "map_pack", "nearby"]).optional(),
});
export type PeerColumn = z.infer<typeof peerColumnSchema>;

export const peerSubjectFactsSchema = z.object({
  photoCount: z.number().int().nonnegative().nullable(),
  primaryCategory: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
});
export type PeerSubjectFacts = z.infer<typeof peerSubjectFactsSchema>;

export const peerAuditReasonSchema = z.enum([
  "no_place",
  "no_api_key",
  "no_type",
  "no_location",
  "no_peers",
]);
export type PeerAuditReason = z.infer<typeof peerAuditReasonSchema>;

export const peerAuditJobSchema = z.object({
  businessId: z.string(),
  createdAt: z.number(),
  error: z.string().optional(),
  id: z.string(),
  peers: z.array(peerColumnSchema),
  phraseRows: z
    .array(
      z.object({
        id: z.string(),
        subjectCells: z.number().int().min(0).max(9).optional(),
        subjectPosition: z.number().int().positive().optional(),
        text: z.string(),
      })
    )
    .optional(),
  placeTypeLabel: z.string().optional(),
  primaryType: z.string().optional(),
  radiusMeters: z.number().optional(),
  reason: peerAuditReasonSchema.optional(),
  source: z.enum(["nearby", "text"]).optional(),
  status: z.enum(["queued", "running", "complete", "error"]),
  subjectFacts: peerSubjectFactsSchema.optional(),
  updatedAt: z.number(),
});
export type PeerAuditJob = z.infer<typeof peerAuditJobSchema>;

export interface PeerSelection {
  peers: GooglePlace[];
  radiusMeters: number;
  source: "nearby" | "text";
}

export interface PeerSearchResult extends PeerSelection {
  placeTypeLabel: string | null;
  primaryType: string | null;
  unavailable: "no_location" | "no_type" | null;
}

export interface PeerCheckRow {
  id: string;
  peerValues: (boolean | null)[];
  subjectValue: boolean | null;
}

export interface PeerScore {
  fail: number;
  pass: number;
  score: number;
  skipped: number;
}

export interface SelectedCompetitor {
  mapPackPhrase?: string;
  place: GooglePlace;
  source: "pinned" | "map_pack" | "nearby";
}

export interface MapPackLeader {
  cells: number;
  phrase: string;
  placeId: string;
}

export interface CompetitorCheckGap {
  peerValues: readonly (boolean | null)[];
  subjectValue: boolean | null;
  title: string;
}

export interface CompetitorNumberGap {
  higherIsBetter: boolean;
  kind: "photoCount" | "rating" | "reviewCount";
  peers: readonly (number | null)[];
  subject: number | null;
}

export interface CompetitorLists {
  competitors: PinnedCompetitor[];
  hiddenCompetitorPlaceIds: string[];
}

const EARTH_RADIUS_METRES = 6_371_000;

export const normaliseCompetitorPlaceId = (id: string): string =>
  id.trim().replace(/^places\//u, "");

const canonicalPlaceId = (id: string): string => normaliseCompetitorPlaceId(id);

const uniquePlaceIds = (ids: readonly string[]): string[] => {
  const unique = new Set<string>();
  for (const id of ids) {
    const canonical = canonicalPlaceId(id);
    if (canonical.length === 0) {
      continue;
    }
    unique.add(canonical);
  }
  return [...unique];
};

const selectionFingerprint = (value: string): string => {
  let hash = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    hash = (hash * 33 + code) % 2_147_483_647;
  }
  return hash.toString(16);
};

/** Nearby-only reports share one cache. Pins and hides get their own key. */
export const peerSelectionCacheKey = (input: {
  hiddenPlaceIds: readonly string[];
  mapPackPlaceIds?: readonly string[];
  pinnedPlaceIds: readonly string[];
  preview: boolean;
}): string => {
  const hidden = uniquePlaceIds(input.hiddenPlaceIds).toSorted();
  if (input.preview) {
    return hidden.length > 0
      ? `preview:${selectionFingerprint(hidden.join(","))}`
      : "nearby";
  }
  const pinned = uniquePlaceIds(input.pinnedPlaceIds).toSorted();
  const mapPack = uniquePlaceIds(input.mapPackPlaceIds ?? []).toSorted();
  if (pinned.length === 0 && hidden.length === 0 && mapPack.length === 0) {
    return "nearby";
  }
  return `set:${selectionFingerprint(`${pinned.join(",")}|${hidden.join(",")}|${mapPack.join(",")}`)}`;
};

export const peerSelectionKeyForBusiness = (
  business: Pick<Business, "competitors" | "hiddenCompetitorPlaceIds">,
  preview: boolean,
  mapPackPlaceIds: readonly string[] = []
): string =>
  peerSelectionCacheKey({
    hiddenPlaceIds: business.hiddenCompetitorPlaceIds,
    mapPackPlaceIds,
    pinnedPlaceIds: business.competitors.map(
      (competitor) => competitor.placeId
    ),
    preview,
  });

export const competitorReason = (
  source: "nearby" | "pinned" | "map_pack" | undefined,
  mapPackPhrase?: string
): string => {
  if (source === "pinned") {
    return "You added this";
  }
  if (source === "map_pack") {
    return mapPackPhrase
      ? `Wins the map pack for '${mapPackPhrase}'`
      : "Wins the map pack";
  }
  return "Nearby, same type";
};

const phraseWithMostCells = (phrases: ReadonlyMap<string, number>): string => {
  let phrase = "";
  let best = -1;
  for (const [name, count] of phrases) {
    const closerName = phrase.length === 0 || name.localeCompare(phrase) < 0;
    if (count > best || (count === best && closerName)) {
      best = count;
      phrase = name;
    }
  }
  return phrase;
};

/** Places that hold the most map-pack cells across saved phrases. Hidden places never return. */
export const mapPackLeaders = (input: {
  grids: readonly {
    cells: readonly { top: readonly { placeId: string | null }[] }[];
    phrase: string;
  }[];
  hiddenPlaceIds: readonly string[];
  selfPlaceId: string;
}): MapPackLeader[] => {
  const hidden = new Set(
    input.hiddenPlaceIds.map((id) => canonicalPlaceId(id))
  );
  const self = canonicalPlaceId(input.selfPlaceId);
  const totals = new Map<string, number>();
  const byPhrase = new Map<string, Map<string, number>>();
  for (const grid of input.grids) {
    const seenInGrid = new Set<string>();
    for (const cell of grid.cells) {
      for (const place of cell.top) {
        if (!place.placeId) {
          continue;
        }
        const id = canonicalPlaceId(place.placeId);
        if (
          id.length === 0 ||
          id === self ||
          hidden.has(id) ||
          seenInGrid.has(id)
        ) {
          continue;
        }
        seenInGrid.add(id);
        totals.set(id, (totals.get(id) ?? 0) + 1);
        const phrases = byPhrase.get(id) ?? new Map<string, number>();
        phrases.set(grid.phrase, (phrases.get(grid.phrase) ?? 0) + 1);
        byPhrase.set(id, phrases);
      }
    }
  }
  const leaders: MapPackLeader[] = [];
  for (const [placeId, cells] of totals) {
    leaders.push({
      cells,
      phrase: phraseWithMostCells(byPhrase.get(placeId) ?? new Map()),
      placeId,
    });
  }
  leaders.sort((left, right) => {
    if (right.cells !== left.cells) {
      return right.cells - left.cells;
    }
    return left.placeId.localeCompare(right.placeId);
  });
  return leaders;
};

/** Pinned, then map-pack leaders, then nearby. Preview skips pins and map pack. Hidden places never return. */
export const selectCompetitorPlaces = (input: {
  hiddenPlaceIds: readonly string[];
  mapPackPlaces?: readonly { phrase: string; place: GooglePlace }[];
  nearbyPlaces: readonly GooglePlace[];
  pinnedPlaces: readonly GooglePlace[];
  preview: boolean;
  selfPlaceId: string;
}): SelectedCompetitor[] => {
  const hidden = new Set(
    input.hiddenPlaceIds.map((id) => canonicalPlaceId(id))
  );
  const self = canonicalPlaceId(input.selfPlaceId);
  const selected: SelectedCompetitor[] = [];
  const seen = new Set<string>();

  const take = (
    place: GooglePlace,
    source: SelectedCompetitor["source"],
    mapPackPhrase?: string
  ) => {
    if (!place.id || selected.length >= PEER_LIMIT) {
      return;
    }
    const id = canonicalPlaceId(place.id);
    if (id.length === 0 || id === self || hidden.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    selected.push(
      source === "map_pack" && mapPackPhrase
        ? { mapPackPhrase, place, source }
        : { place, source }
    );
  };

  if (!input.preview) {
    for (const place of input.pinnedPlaces) {
      take(place, "pinned");
    }
    for (const leader of input.mapPackPlaces ?? []) {
      take(leader.place, "map_pack", leader.phrase);
    }
  }
  for (const place of input.nearbyPlaces) {
    take(place, "nearby");
  }
  return selected;
};

export const competitorCheckStatus = (
  value: boolean | null
): "fail" | "pass" | "unknown" => {
  if (value === true) {
    return "pass";
  }
  if (value === false) {
    return "fail";
  }
  return "unknown";
};

const countBetter = (
  subject: number,
  peers: readonly (number | null)[],
  higherIsBetter: boolean
): { better: number; worse: number } => {
  let better = 0;
  let worse = 0;
  for (const peer of peers) {
    if (peer === null) {
      continue;
    }
    if (higherIsBetter ? peer > subject : peer < subject) {
      better += 1;
    } else if (higherIsBetter ? peer < subject : peer > subject) {
      worse += 1;
    }
  }
  return { better, worse };
};

const numberGapLine = (row: CompetitorNumberGap, better: number): string => {
  const total = row.peers.length;
  if (row.kind === "photoCount") {
    return `${better} of ${total} competitors have more photos than you. You have ${row.subject}.`;
  }
  if (row.kind === "reviewCount") {
    return `${better} of ${total} competitors have more reviews than you. You have ${row.subject}.`;
  }
  return `${better} of ${total} competitors have a higher rating than you. Yours is ${row.subject?.toFixed(1)}.`;
};

/** Checks the business fails while two competitors pass, and number rows where it is last. */
export const whereCompetitorsBeatYou = (input: {
  checks: readonly CompetitorCheckGap[];
  numbers: readonly CompetitorNumberGap[];
}): string[] => {
  const lines: string[] = [];
  for (const check of input.checks) {
    if (check.subjectValue !== false) {
      continue;
    }
    let passes = 0;
    for (const value of check.peerValues) {
      if (value === true) {
        passes += 1;
      }
    }
    if (passes >= 2) {
      lines.push(
        `${passes} of ${check.peerValues.length} competitors pass ${check.title}. You do not.`
      );
    }
  }
  for (const row of input.numbers) {
    if (row.subject === null || row.peers.length === 0) {
      continue;
    }
    const { better, worse } = countBetter(
      row.subject,
      row.peers,
      row.higherIsBetter
    );
    if (worse === 0 && better > 0) {
      lines.push(numberGapLine(row, better));
    }
  }
  return lines;
};

export const bestNumberIndexes = (
  values: readonly (number | null)[],
  higherIsBetter: boolean
): number[] => {
  let best: number | null = null;
  for (const value of values) {
    if (value === null) {
      continue;
    }
    if (best === null || (higherIsBetter ? value > best : value < best)) {
      best = value;
    }
  }
  if (best === null) {
    return [];
  }
  const indexes: number[] = [];
  let index = 0;
  for (const value of values) {
    if (value === best) {
      indexes.push(index);
    }
    index += 1;
  }
  return indexes;
};

const withBest = (text: string, best: boolean): string =>
  best ? `${text} Best` : text;

export const formatRatingCell = (
  value: number | null,
  best: boolean
): string => (value === null ? "Unknown" : withBest(value.toFixed(1), best));

export const formatCountCell = (
  value: number | null,
  best: boolean,
  singular: string,
  plural: string
): string => {
  if (value === null) {
    return "Unknown";
  }
  const noun = value === 1 ? singular : plural;
  return withBest(`${value} ${noun}`, best);
};

export const formatPositionCell = (
  value: number | null,
  best: boolean
): string => (value === null ? "Unknown" : withBest(`Position ${value}`, best));

export const formatDistanceCell = (
  metres: number | null,
  best: boolean
): string => {
  if (metres === null) {
    return "Unknown";
  }
  const text =
    metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`;
  return withBest(text, best);
};

const toPinned = (ids: readonly string[]): PinnedCompetitor[] =>
  pinnedCompetitorsSchema.parse(
    ids.map((id) => ({ placeId: id, source: "pinned" }))
  );

export const nextCompetitorLists = (input: {
  action: "hide" | "pin" | "unpin";
  competitors: readonly { placeId: string }[];
  hiddenCompetitorPlaceIds: readonly string[];
  placeId: string;
}): CompetitorLists => {
  const placeId = canonicalPlaceId(input.placeId);
  if (placeId.length === 0) {
    throw new Error("Missing place");
  }
  const pinnedIds = uniquePlaceIds(
    input.competitors.map((competitor) => competitor.placeId)
  );
  const hiddenIds = uniquePlaceIds(input.hiddenCompetitorPlaceIds);

  if (input.action === "pin") {
    const nextPinned = [...pinnedIds.filter((id) => id !== placeId), placeId];
    if (nextPinned.length > MAX_COMPETITORS) {
      throw new Error("Too many pinned competitors");
    }
    return {
      competitors: toPinned(nextPinned),
      hiddenCompetitorPlaceIds: hiddenCompetitorPlaceIdsSchema.parse(
        hiddenIds.filter((id) => id !== placeId)
      ),
    };
  }

  if (input.action === "unpin") {
    return {
      competitors: toPinned(pinnedIds.filter((id) => id !== placeId)),
      hiddenCompetitorPlaceIds: hiddenCompetitorPlaceIdsSchema.parse(hiddenIds),
    };
  }

  const nextHidden = [...hiddenIds.filter((id) => id !== placeId), placeId];
  if (nextHidden.length > MAX_HIDDEN_COMPETITORS) {
    throw new Error("Too many hidden competitors");
  }
  return {
    competitors: toPinned(pinnedIds.filter((id) => id !== placeId)),
    hiddenCompetitorPlaceIds: hiddenCompetitorPlaceIdsSchema.parse(nextHidden),
  };
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const distanceMetresBetween = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number => {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const start = toRadians(from.latitude);
  const end = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(start) * Math.cos(end) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    2 *
      EARTH_RADIUS_METRES *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

const primaryCategoryFor = (place: GooglePlace): string | null => {
  const display = place.primaryTypeDisplayName?.text?.trim() ?? "";
  if (display.length > 0) {
    return display;
  }
  if (!place.primaryType) {
    return null;
  }
  return primaryGooglePlaceTypeLabel([place.primaryType]) ?? place.primaryType;
};

const photoCountFor = (place: GooglePlace): number | null =>
  Array.isArray(place.photos) ? place.photos.length : null;

const metricOrNull = (value: number | undefined): number | null =>
  typeof value === "number" ? value : null;

const subjectFactsFor = (place: GooglePlace): PeerSubjectFacts =>
  peerSubjectFactsSchema.parse({
    photoCount: photoCountFor(place),
    primaryCategory: primaryCategoryFor(place),
    rating: metricOrNull(place.rating),
    reviewCount: metricOrNull(place.userRatingCount),
  });

const presenceCheckId = (channel: DiscoveredProfile["type"]): string | null => {
  switch (channel) {
    case "facebook": {
      return "facebook-page";
    }
    case "instagram": {
      return "instagram-profile";
    }
    case "linkedin": {
      return "linkedin-profile";
    }
    case "tiktok": {
      return "tiktok-profile";
    }
    case "youtube": {
      return "youtube-profile";
    }
    default: {
      return null;
    }
  }
};

const SEARCH_QUALITY_CHECKS = [
  "social-profile-banner",
  "social-profile-freshness",
  "social-profile-image-match",
];

export const searchSourcedCheckIds = (
  channels: readonly DiscoveredProfile["type"][]
): ReadonlySet<string> => {
  const ids = new Set<string>();
  let foundSocial = false;
  for (const channel of channels) {
    const checkId = presenceCheckId(channel);
    if (checkId) {
      ids.add(checkId);
      foundSocial = true;
    } else if (channel === "x") {
      foundSocial = true;
    }
  }
  if (foundSocial) {
    for (const checkId of SEARCH_QUALITY_CHECKS) {
      ids.add(checkId);
    }
  }
  return ids;
};

const placeDisplayName = (place: GooglePlace): string => {
  const name = place.displayName?.text?.trim() ?? "";
  return name.length > 0 ? name : "Nearby business";
};

const placeTypeList = (place: GooglePlace): string[] => {
  const types: string[] = [];
  if (place.primaryType) {
    types.push(place.primaryType);
  }
  for (const type of place.types ?? []) {
    types.push(type);
  }
  return types;
};

const placeTypeLabelFor = (place: GooglePlace, primaryType: string): string => {
  const display = place.primaryTypeDisplayName?.text?.trim() ?? "";
  if (display.length > 0) {
    return display;
  }
  return primaryGooglePlaceTypeLabel([primaryType]) ?? primaryType;
};

const EXACT_TYPE_SCORE = 3;
const DIRECT_TYPE_SCORE = 2;
const RELATED_TYPE_SCORE = 1;

const emptySearch = (
  unavailable: PeerSearchResult["unavailable"]
): PeerSearchResult => ({
  peers: [],
  placeTypeLabel: null,
  primaryType: null,
  radiusMeters: NEARBY_RADIUS_METERS,
  source: "nearby",
  unavailable,
});

const peerSearchType = (place: GooglePlace): string | null => {
  const primary = specificPrimaryType(place.primaryType);
  if (primary) {
    return primary;
  }
  for (const type of place.types ?? []) {
    const specific = specificPrimaryType(type);
    if (specific) {
      return specific;
    }
  }
  return null;
};

const typeScore = (
  place: GooglePlace,
  primaryType: string,
  query: CompetitorTypeQuery
): number => {
  const primary = place.primaryType;
  if (primary) {
    if (primary === primaryType) {
      return EXACT_TYPE_SCORE;
    }
    if (query.direct.includes(primary)) {
      return DIRECT_TYPE_SCORE;
    }
    if (query.related.includes(primary)) {
      return RELATED_TYPE_SCORE;
    }
    return 0;
  }
  const types = place.types ?? [];
  if (types.includes(primaryType)) {
    return EXACT_TYPE_SCORE;
  }
  if (types.some((type) => query.direct.includes(type))) {
    return DIRECT_TYPE_SCORE;
  }
  if (types.some((type) => query.related.includes(type))) {
    return RELATED_TYPE_SCORE;
  }
  return 0;
};

interface RankedPeer {
  distance: number;
  group: number;
  index: number;
  place: GooglePlace;
  score: number;
}

const placeDistance = (
  place: GooglePlace,
  origin: { latitude: number; longitude: number } | undefined
): number => {
  if (!origin || !place.location) {
    return Number.POSITIVE_INFINITY;
  }
  return distanceMetresBetween(origin, place.location);
};

const rankPeerPlaces = (input: {
  group: number;
  origin?: { latitude: number; longitude: number };
  places: readonly GooglePlace[];
  primaryType: string;
  query: CompetitorTypeQuery;
  selfPlaceId: string;
}): RankedPeer[] => {
  const self = canonicalPlaceId(input.selfPlaceId);
  const ranked: RankedPeer[] = [];
  const byId = new Map<string, RankedPeer>();
  for (const [index, place] of input.places.entries()) {
    if (!place.id) {
      continue;
    }
    const id = canonicalPlaceId(place.id);
    if (id.length === 0 || id === self) {
      continue;
    }
    const score = typeScore(place, input.primaryType, input.query);
    if (score === 0) {
      continue;
    }
    const next: RankedPeer = {
      distance: placeDistance(place, input.origin),
      group: input.group,
      index,
      place,
      score,
    };
    const current = byId.get(id);
    const replace =
      !current ||
      next.score > current.score ||
      (next.score === current.score && next.distance < current.distance);
    if (replace) {
      byId.set(id, next);
    }
  }
  for (const peer of byId.values()) {
    ranked.push(peer);
  }
  ranked.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    if (left.group !== right.group) {
      return left.group - right.group;
    }
    return left.index - right.index;
  });
  return ranked;
};

const selectionFromRanked = (
  ranked: readonly RankedPeer[],
  limit: number,
  source: PeerSelection["source"]
): PeerSelection => {
  const picked = ranked.slice(0, limit);
  const widened = picked.some((peer) => peer.group > 0);
  return {
    peers: picked.map((peer) => peer.place),
    radiusMeters: widened ? WIDENED_RADIUS_METERS : NEARBY_RADIUS_METERS,
    source,
  };
};

export const choosePeerPlaces = (input: {
  closePlaces: readonly GooglePlace[];
  farPlaces: readonly GooglePlace[];
  limit?: number;
  origin?: { latitude: number; longitude: number };
  primaryType: string;
  selfPlaceId: string;
  textPlaces: readonly GooglePlace[];
}): PeerSelection => {
  const limit = input.limit ?? PEER_LIMIT;
  const query = competitorTypesFor(input.primaryType);
  const rank = (places: readonly GooglePlace[], group: number) =>
    rankPeerPlaces({
      group,
      origin: input.origin,
      places,
      primaryType: input.primaryType,
      query,
      selfPlaceId: input.selfPlaceId,
    });
  const close = rank(input.closePlaces, 0);
  const directClose = close.filter((peer) => peer.score >= DIRECT_TYPE_SCORE);
  if (directClose.length >= 2) {
    return selectionFromRanked(directClose, limit, "nearby");
  }
  if (close.length >= 2) {
    return selectionFromRanked(close, limit, "nearby");
  }
  const merged = rank([...input.closePlaces, ...input.farPlaces], 0);
  const farIds = new Set(
    input.farPlaces.flatMap((place) =>
      place.id ? [canonicalPlaceId(place.id)] : []
    )
  );
  const closeIds = new Set(
    input.closePlaces.flatMap((place) =>
      place.id ? [canonicalPlaceId(place.id)] : []
    )
  );
  if (merged.length > 0 && input.farPlaces.length > 0) {
    const picked = merged.slice(0, limit);
    const widened = picked.some((peer) => {
      const id = canonicalPlaceId(peer.place.id ?? "");
      return farIds.has(id) && !closeIds.has(id);
    });
    return {
      peers: picked.map((peer) => peer.place),
      radiusMeters: widened ? WIDENED_RADIUS_METERS : NEARBY_RADIUS_METERS,
      source: "nearby",
    };
  }
  if (close.length > 0) {
    return selectionFromRanked(close, limit, "nearby");
  }
  return selectionFromRanked(rank(input.textPlaces, 1), limit, "text");
};

export const findPeerPlaces = async (input: {
  fetchImpl?: typeof fetch;
  googleApiKey: string;
  limit?: number;
  place: GooglePlace;
  selfPlaceId: string;
}): Promise<PeerSearchResult> => {
  const primaryType = peerSearchType(input.place);
  if (!primaryType) {
    return emptySearch("no_type");
  }
  const { location } = input.place;
  if (!location) {
    return emptySearch("no_location");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const limit = input.limit ?? PEER_LIMIT;
  const query = competitorTypesFor(primaryType);
  const searchAt = (radiusMeters: number, includedPrimaryTypes: string[]) =>
    searchNearbyPlaces(
      {
        googleApiKey: input.googleApiKey,
        includedPrimaryTypes,
        latitude: location.latitude,
        longitude: location.longitude,
        maxResultCount: NEARBY_SEARCH_COUNT,
        radiusMeters,
        rankPreference: "DISTANCE",
      },
      fetchImpl
    );

  const choose = (
    closePlaces: readonly GooglePlace[],
    farPlaces: readonly GooglePlace[],
    textPlaces: readonly GooglePlace[]
  ) =>
    choosePeerPlaces({
      closePlaces,
      farPlaces,
      limit,
      origin: location,
      primaryType,
      selfPlaceId: input.selfPlaceId,
      textPlaces,
    });

  let closePlaces = await searchAt(NEARBY_RADIUS_METERS, query.direct);
  let selection = choose(closePlaces, [], []);
  if (selection.peers.length < 2 && query.related.length > 0) {
    const relatedPlaces = await searchAt(NEARBY_RADIUS_METERS, query.related);
    closePlaces = [...closePlaces, ...relatedPlaces];
    selection = choose(closePlaces, [], []);
  }
  let farPlaces: GooglePlace[] = [];
  if (selection.peers.length < 2) {
    farPlaces = await searchAt(WIDENED_RADIUS_METERS, query.direct);
    selection = choose(closePlaces, farPlaces, []);
  }

  if (selection.peers.length === 0) {
    const parts = locationPartsFromPlace(input.place);
    const near = parts.suburb ?? parts.city ?? "";
    const label = placeTypeLabelFor(input.place, primaryType);
    const textQuery = near.length > 0 ? `${label} near ${near}` : label;
    const textPlaces = await searchGooglePlacesNear(
      textQuery,
      input.googleApiKey,
      location,
      WIDENED_RADIUS_METERS,
      fetchImpl
    );
    selection = choose(closePlaces, farPlaces, textPlaces);
  }

  return {
    ...selection,
    placeTypeLabel: placeTypeLabelFor(input.place, primaryType),
    primaryType,
    unavailable: null,
  };
};

export const scoreFromCheckValues = (
  values: readonly (boolean | null)[]
): PeerScore => {
  let pass = 0;
  let fail = 0;
  let skipped = 0;
  for (const value of values) {
    if (value === true) {
      pass += 1;
    } else if (value === false) {
      fail += 1;
    } else {
      skipped += 1;
    }
  }
  return {
    fail,
    pass,
    score: scorePercent({ fail, pass }),
    skipped,
  };
};

export const orderPeerCheckRows = <T extends PeerCheckRow>(
  rows: readonly T[]
): T[] => {
  const gap: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const behind =
      row.subjectValue === false &&
      row.peerValues.some((value) => value === true);
    if (behind) {
      gap.push(row);
    } else {
      rest.push(row);
    }
  }
  return [...gap, ...rest];
};

export const snapshotForPeer = (
  place: GooglePlace,
  extraProfiles: readonly DiscoveredProfile[] = []
): BusinessSnapshot => {
  const name = placeDisplayName(place);
  const category = getCategoryIdFromGooglePlaceTypes(placeTypeList(place));
  const profiles: DiscoveredProfile[] = [];
  if (place.id) {
    profiles.push({
      googlePlaceId: place.id,
      subtitle: place.formattedAddress,
      title: name,
      type: "google-maps",
    });
  }
  if (place.websiteUri) {
    profiles.push({ title: place.websiteUri, type: "website" });
  }
  for (const profile of extraProfiles) {
    addUniqueProfile(profiles, profile);
  }
  const data = mapProfilesToBusinessData(name, category, profiles);
  return businessSnapshotSchema.parse({
    ...data,
    id: place.id ?? name,
  });
};

export const googlePlaceIdFromLocations = (
  locations: readonly { googlePlaceId?: string | null }[]
): string | null => {
  for (const location of locations) {
    const id = location.googlePlaceId?.trim() ?? "";
    if (id.length > 0 && !isHttpUrl(id)) {
      return id;
    }
  }
  return null;
};

export const peerAuditCaption = (job: PeerAuditJob): string => {
  if (job.source === "text") {
    return "Peers came from a search for this kind of business near you.";
  }
  return PEER_ORDER_CAPTION;
};

export const peerAuditHeading = (job: PeerAuditJob): string => {
  if (!job.placeTypeLabel || job.radiusMeters === undefined) {
    return "Compare";
  }
  const kilometres = job.radiusMeters / 1000;
  return `${job.placeTypeLabel} within ${kilometres} km`;
};

export const peerAuditMessage = (job: PeerAuditJob): string | null => {
  switch (job.reason) {
    case "no_place": {
      return "This audit has no Google place, so nearby businesses cannot be compared.";
    }
    case "no_api_key": {
      return "Google Places is not configured, so nearby businesses cannot be compared.";
    }
    case "no_type": {
      return "Google did not return a specific place type, so nearby businesses cannot be compared.";
    }
    case "no_location": {
      return "Google did not return a map location, so nearby businesses cannot be compared.";
    }
    case "no_peers": {
      return "No other businesses with this place type were found nearby.";
    }
    default: {
      if (job.status === "error") {
        return "Nearby comparison could not finish.";
      }
      return null;
    }
  }
};

const peerCacheKey = (businessId: string, placeId: string | null): string =>
  `${businessId}:${placeId ?? "none"}`;

/** Same place shares one peer audit across business ids. */
export const sharedPeerCacheKey = (placeId: string): string =>
  `place:${placeId.trim().replace(PLACE_ID_PREFIX, "")}`;

export const isPeerJobReusable = (
  job: Pick<PeerAuditJob, "createdAt" | "status" | "updatedAt">,
  now: number
): boolean => {
  if (job.status === "error") {
    return false;
  }
  if (job.status === "complete") {
    const age = now - job.updatedAt;
    return age >= 0 && age < SCAN_REUSE_WINDOW_MS;
  }
  const age = now - job.createdAt;
  return age >= 0 && age < PEER_RUNNING_WINDOW_MS;
};

const peerCacheKeys = (
  businessId: string,
  placeId: string | null,
  selectionKey: string
): string[] => {
  const specific =
    selectionKey === "nearby"
      ? peerCacheKey(businessId, placeId)
      : `${peerCacheKey(businessId, placeId)}:${selectionKey}`;
  if (selectionKey === "nearby" && placeId) {
    return [sharedPeerCacheKey(placeId), specific];
  }
  return [specific];
};

const peerJobStorageKey = (id: string): string => `peer-job:${id}`;

const peerLatestStorageKey = (cacheKey: string): string =>
  `peer-latest:${cacheKey}`;

interface PeerJobMemory {
  jobs: Map<string, PeerAuditJob>;
  latest: Map<string, string>;
}

declare global {
  var listwellPeerJobs: PeerJobMemory | undefined;
}

const peerMemory: PeerJobMemory = globalThis.listwellPeerJobs ?? {
  jobs: new Map<string, PeerAuditJob>(),
  latest: new Map<string, string>(),
};
globalThis.listwellPeerJobs = peerMemory;

const blankJob = (businessId: string): PeerAuditJob =>
  peerAuditJobSchema.parse({
    businessId,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    peers: [],
    status: "queued",
    updatedAt: Date.now(),
  });

const writePeerJob = async (
  job: PeerAuditJob,
  cacheKeys: readonly string[]
): Promise<PeerAuditJob> => {
  const parsed = peerAuditJobSchema.parse(job);
  peerMemory.jobs.set(parsed.id, parsed);
  for (const cacheKey of cacheKeys) {
    peerMemory.latest.set(cacheKey, parsed.id);
  }
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return parsed;
  }
  await kv.put(peerJobStorageKey(parsed.id), JSON.stringify(parsed), {
    expirationTtl: PEER_JOB_TTL_SECONDS,
  });
  await Promise.all(
    cacheKeys.map((cacheKey) =>
      kv.put(peerLatestStorageKey(cacheKey), parsed.id, {
        expirationTtl: PEER_JOB_TTL_SECONDS,
      })
    )
  );
  return parsed;
};

export const readPeerJob = async (id: string): Promise<PeerAuditJob | null> => {
  const memoryJob = peerMemory.jobs.get(id);
  if (memoryJob) {
    return memoryJob;
  }
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return null;
  }
  const raw = await env.AUDIT_KV.get(peerJobStorageKey(id), "json");
  const parsed = peerAuditJobSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  peerMemory.jobs.set(parsed.data.id, parsed.data);
  return parsed.data;
};

const readJobForCacheKey = async (
  cacheKey: string
): Promise<PeerAuditJob | null> => {
  const memoryId = peerMemory.latest.get(cacheKey);
  if (memoryId) {
    return readPeerJob(memoryId);
  }
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return null;
  }
  const jobId = await env.AUDIT_KV.get(peerLatestStorageKey(cacheKey));
  if (typeof jobId !== "string" || jobId.length === 0) {
    return null;
  }
  return readPeerJob(jobId);
};

export const readLatestPeerJob = async (
  businessId: string,
  placeId: string | null,
  selectionKey = "nearby"
): Promise<PeerAuditJob | null> => {
  const now = Date.now();
  const jobs = await Promise.all(
    peerCacheKeys(businessId, placeId, selectionKey).map((cacheKey) =>
      readJobForCacheKey(cacheKey)
    )
  );
  return (
    jobs.find((job) => job !== null && isPeerJobReusable(job, now)) ?? null
  );
};

const columnFromResults = (
  place: GooglePlace,
  results: Partial<Record<string, CheckResult | undefined>>,
  input: {
    fromSearchIds: ReadonlySet<string>;
    mapPackPhrase?: string;
    origin: { latitude: number; longitude: number } | null;
    phraseCells?: Record<string, number>;
    phrasePosition?: Record<string, number>;
    source: SelectedCompetitor["source"];
  }
): PeerColumn => {
  const checks: PeerColumn["checks"] = {};
  const values: (boolean | null)[] = [];
  for (const [id, result] of Object.entries(results)) {
    if (!result) {
      continue;
    }
    const fromSearch = input.fromSearchIds.has(id) && result.value !== null;
    checks[id] = {
      ...(fromSearch ? { fromSearch: true } : {}),
      ...(result.label ? { label: result.label } : {}),
      value: result.value,
    };
    values.push(result.value);
  }
  const scored = scoreFromCheckValues(values);
  const distanceMetres =
    input.origin && place.location
      ? distanceMetresBetween(input.origin, place.location)
      : null;
  return peerColumnSchema.parse({
    checks,
    distanceMetres,
    fail: scored.fail,
    ...(input.mapPackPhrase ? { mapPackPhrase: input.mapPackPhrase } : {}),
    name: placeDisplayName(place),
    pass: scored.pass,
    ...(input.phraseCells ? { phraseCells: input.phraseCells } : {}),
    ...(input.phrasePosition ? { phrasePosition: input.phrasePosition } : {}),
    photoCount: photoCountFor(place),
    placeId: place.id ?? placeDisplayName(place),
    primaryCategory: primaryCategoryFor(place),
    rating: metricOrNull(place.rating),
    reviewCount: metricOrNull(place.userRatingCount),
    score: scored.score,
    skipped: scored.skipped,
    source: input.source,
  });
};

const auditOnePeer = async (
  place: GooglePlace,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions,
  input: {
    mapPackPhrase?: string;
    origin: { latitude: number; longitude: number } | null;
    phraseCells?: Record<string, number>;
    phrasePosition?: Record<string, number>;
    source: SelectedCompetitor["source"];
  }
): Promise<PeerColumn> => {
  const name = placeDisplayName(place);
  const category = getCategoryIdFromGooglePlaceTypes(placeTypeList(place));
  const extra: DiscoveredProfile[] = [];
  if (place.websiteUri && isHttpUrl(place.websiteUri)) {
    try {
      const fromSite = await profilesFromWebsite(place.websiteUri, options);
      for (const profile of fromSite) {
        extra.push(profile);
      }
    } catch {
      // Homepage fetch is best-effort. The Places website URL still runs.
    }
  }
  const parts = locationPartsFromPlace(place);
  const near = parts.suburb ?? parts.city ?? undefined;
  const social = await socialProfiles(name, category, env, near);
  for (const profile of social) {
    extra.push(profile);
  }
  const fromSearchIds = searchSourcedCheckIds(
    social.map((profile) => profile.type)
  );
  const snapshot = snapshotForPeer(place, extra);
  const checkIds = engineChecksForCategory(category).map(
    (definition) => definition.id
  );
  const results = await runChecks(snapshot, checkIds, {
    ...options,
    env,
    includeQueued: true,
  });
  return columnFromResults(place, results, {
    fromSearchIds,
    mapPackPhrase: input.mapPackPhrase,
    origin: input.origin,
    phraseCells: input.phraseCells,
    phrasePosition: input.phrasePosition,
    source: input.source,
  });
};

const saveJob = async (
  jobId: string,
  cacheKeys: readonly string[],
  patch: Partial<PeerAuditJob>
): Promise<PeerAuditJob | null> => {
  const current = await readPeerJob(jobId);
  if (!current) {
    return null;
  }
  return writePeerJob(
    peerAuditJobSchema.parse({
      ...current,
      ...patch,
      businessId: current.businessId,
      id: current.id,
      updatedAt: Date.now(),
    }),
    cacheKeys
  );
};

const auditSelectedPeers = async (
  jobId: string,
  cacheKeys: readonly string[],
  peers: readonly SelectedCompetitor[],
  env: AuditEngineEnv,
  options: FetchWebsiteOptions,
  origin: { latitude: number; longitude: number } | null,
  metrics: {
    cellsForPlace: ReadonlyMap<string, Record<string, number>>;
    positionForPlace: ReadonlyMap<string, Record<string, number>>;
  }
): Promise<boolean> => {
  let failed = false;
  await runInSeries(peers, async (selected) => {
    try {
      const placeId = canonicalPlaceId(selected.place.id ?? "");
      const column = await auditOnePeer(selected.place, env, options, {
        mapPackPhrase: selected.mapPackPhrase,
        origin,
        phraseCells: metrics.cellsForPlace.get(placeId),
        phrasePosition: metrics.positionForPlace.get(placeId),
        source: selected.source,
      });
      const current = await readPeerJob(jobId);
      if (!current) {
        return column;
      }
      await writePeerJob(
        peerAuditJobSchema.parse({
          ...current,
          peers: [...current.peers, column],
          status: "running",
          updatedAt: Date.now(),
        }),
        cacheKeys
      );
      return column;
    } catch {
      failed = true;
      return null;
    }
  });
  return failed;
};

const loadPinnedPlaces = async (input: {
  competitors: readonly { placeId: string }[];
  fetchImpl?: typeof fetch;
  googleApiKey: string;
  hiddenPlaceIds: readonly string[];
  nearbyPlaces: readonly GooglePlace[];
  selfPlaceId: string;
}): Promise<GooglePlace[]> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const hidden = new Set(
    input.hiddenPlaceIds.map((id) => canonicalPlaceId(id))
  );
  const self = canonicalPlaceId(input.selfPlaceId);
  const pool = new Map<string, GooglePlace>();
  for (const place of input.nearbyPlaces) {
    if (place.id) {
      pool.set(canonicalPlaceId(place.id), place);
    }
  }
  const resolved = await Promise.all(
    input.competitors.map((competitor) => {
      const id = canonicalPlaceId(competitor.placeId);
      if (id.length === 0 || id === self || hidden.has(id)) {
        return null;
      }
      const known = pool.get(id);
      if (known) {
        return known;
      }
      return fetchGooglePlace(id, input.googleApiKey, fetchImpl);
    })
  );
  const pinned: GooglePlace[] = [];
  for (const place of resolved) {
    if (place?.id) {
      pinned.push(place);
    }
  }
  return pinned;
};

interface MapPackContext {
  grids: RankGridPayload[];
  leaders: MapPackLeader[];
  observations: SeoObservationRow[];
  organic: OrganicSerpPayload[];
  periodStart: string | null;
}

const emptyMapPack = (): MapPackContext => ({
  grids: [],
  leaders: [],
  observations: [],
  organic: [],
  periodStart: null,
});

const newestByPhrase = <Item extends { checkedAt: string; phraseId: string }>(
  rows: readonly Item[]
): Item[] => {
  const byPhrase = new Map<string, Item>();
  for (const row of rows) {
    const existing = byPhrase.get(row.phraseId);
    if (!existing || existing.checkedAt < row.checkedAt) {
      byPhrase.set(row.phraseId, row);
    }
  }
  return [...byPhrase.values()];
};

const loadMapPackContext = async (
  business: Business,
  includeMapPack: boolean
): Promise<MapPackContext> => {
  if (!includeMapPack) {
    return emptyMapPack();
  }
  try {
    const entitlement = await getResearchEntitlement(business.id);
    if (
      entitlement?.kind !== "report_monthly" ||
      entitlement.status !== "active" ||
      !entitlement.nextScanAt
    ) {
      return emptyMapPack();
    }
    const periodStart = researchPeriodStart(entitlement.nextScanAt);
    const observations = await convexObservationStore.listForPeriod(
      business.id,
      periodStart
    );
    const grids: RankGridPayload[] = [];
    const organic: OrganicSerpPayload[] = [];
    for (const row of observations) {
      const parsed = readObservationPayload(row);
      if (!parsed) {
        continue;
      }
      if (parsed.kind === "rank_grid") {
        grids.push(parsed.payload);
      }
      if (parsed.kind === "organic_serp") {
        organic.push(parsed.payload);
      }
    }
    return {
      grids,
      leaders: mapPackLeaders({
        grids,
        hiddenPlaceIds: business.hiddenCompetitorPlaceIds,
        selfPlaceId: googlePlaceIdFromLocations(business.locations) ?? "",
      }),
      observations,
      organic,
      periodStart,
    };
  } catch (error) {
    console.error("Map-pack competitors could not be loaded", error);
    return emptyMapPack();
  }
};

const phraseMetricsFor = (
  context: MapPackContext,
  selfPlaceId: string,
  peers: readonly { placeId: string; website: string | null }[]
): {
  cellsForPlace: Map<string, Record<string, number>>;
  phraseRows: NonNullable<PeerAuditJob["phraseRows"]>;
  positionForPlace: Map<string, Record<string, number>>;
} => {
  const grids = newestByPhrase(context.grids);
  const organic = newestByPhrase(context.organic);
  const phraseRows: NonNullable<PeerAuditJob["phraseRows"]> = [];
  const cellsForPlace = new Map<string, Record<string, number>>();
  const positionForPlace = new Map<string, Record<string, number>>();
  const organicByPhraseId = new Map<string, OrganicSerpPayload>();
  for (const item of organic) {
    if (organicByPhraseId.has(item.phraseId)) {
      continue;
    }
    organicByPhraseId.set(item.phraseId, item);
  }
  const seen = new Set<string>();
  for (const grid of grids) {
    seen.add(grid.phraseId);
    const row: NonNullable<PeerAuditJob["phraseRows"]>[number] = {
      id: grid.phraseId,
      subjectCells: cellsHeldInGrid(grid.cells, selfPlaceId),
      text: grid.phrase,
    };
    const serp = organicByPhraseId.get(grid.phraseId);
    if (serp?.position) {
      row.subjectPosition = serp.position;
    }
    phraseRows.push(row);
    for (const peer of peers) {
      const cells = cellsForPlace.get(peer.placeId) ?? {};
      cells[grid.phraseId] = cellsHeldInGrid(grid.cells, peer.placeId);
      cellsForPlace.set(peer.placeId, cells);
    }
  }
  for (const serp of organic) {
    if (!seen.has(serp.phraseId)) {
      const row: NonNullable<PeerAuditJob["phraseRows"]>[number] = {
        id: serp.phraseId,
        text: serp.phrase,
      };
      if (serp.position) {
        row.subjectPosition = serp.position;
      }
      phraseRows.push(row);
    }
    for (const peer of peers) {
      const position = positionForHost(serp.results, peer.website);
      if (position === undefined) {
        continue;
      }
      const positions = positionForPlace.get(peer.placeId) ?? {};
      positions[serp.phraseId] = position;
      positionForPlace.set(peer.placeId, positions);
    }
  }
  return { cellsForPlace, phraseRows, positionForPlace };
};

const snapshotPeers = (peers: readonly PeerColumn[]): SnapshotPeer[] =>
  peers.flatMap((peer) => {
    if (!peer.source) {
      return [];
    }
    return [
      {
        distanceMetres: peer.distanceMetres ?? null,
        listingScore: peer.score,
        name: peer.name,
        photoCount: peer.photoCount ?? null,
        phraseCells: peer.phraseCells,
        phrasePosition: peer.phrasePosition,
        placeId: peer.placeId,
        primaryCategory: peer.primaryCategory ?? null,
        rating: peer.rating ?? null,
        reviewCount: peer.reviewCount ?? null,
        source: peer.source,
      },
    ];
  });

const nextFixChecksFor = async (
  business: Business,
  peers: readonly PeerColumn[]
): Promise<NextFixCheck[]> => {
  const scan = await getLatestCompleteScanDetails(business.id);
  if (!scan?.results) {
    return [];
  }
  return checksForCategory(business.category).map((definition) => ({
    id: definition.id,
    peerValues: peers.map((peer) => peer.checks[definition.id]?.value ?? null),
    subjectValue: scan.results?.[definition.id]?.value ?? null,
    title: definition.title,
  }));
};

const saveFinishedPeerJob = async (input: {
  business: Business;
  cacheKeys: readonly string[];
  failed: boolean;
  jobId: string;
  mapPack: MapPackContext;
}): Promise<void> => {
  const current = await readPeerJob(input.jobId);
  if (!current) {
    return;
  }
  if (current.peers.length === 0 && input.failed) {
    await saveJob(input.jobId, input.cacheKeys, {
      error: "Nearby businesses could not be audited",
      status: "error",
    });
    return;
  }
  if (current.peers.length === 0) {
    await saveJob(input.jobId, input.cacheKeys, {
      reason: "no_peers",
      status: "complete",
    });
    return;
  }
  // The complete status must be saved before the missing-period return.
  // react-doctor-disable-next-line react-doctor/async-defer-await
  await saveJob(input.jobId, input.cacheKeys, { status: "complete" });
  if (!input.mapPack.periodStart) {
    return;
  }
  try {
    const finished = await readPeerJob(input.jobId);
    if (!finished) {
      return;
    }
    await persistCompetitorPeriod({
      businessExternalId: input.business.id,
      nextFixChecks: await nextFixChecksFor(input.business, finished.peers),
      observations: input.mapPack.observations,
      peers: snapshotPeers(finished.peers),
      periodStart: input.mapPack.periodStart,
    });
  } catch (error) {
    console.error("Competitor snapshot could not be saved", error);
  }
};

const executePeerAudit = async (
  jobId: string,
  cacheKeys: readonly string[],
  business: Business,
  placeId: string | null,
  preview: boolean,
  mapPack: MapPackContext
): Promise<void> => {
  try {
    if (!placeId) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_place",
        status: "complete",
      });
      return;
    }

    await saveJob(jobId, cacheKeys, { status: "running" });

    const [env, options] = await Promise.all([
      getAuditEngineEnv(),
      getFetchWebsiteOptions(),
    ]);
    if (!env.googleApiKey) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_api_key",
        status: "complete",
      });
      return;
    }

    const place = await fetchGooglePlace(
      placeId,
      env.googleApiKey,
      options.fetchImpl
    );
    if (!place) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_place",
        status: "complete",
      });
      return;
    }

    const selfPlaceId = place.id ?? placeId;
    const search = await findPeerPlaces({
      fetchImpl: options.fetchImpl,
      googleApiKey: env.googleApiKey,
      limit: NEARBY_RESULT_COUNT,
      place,
      selfPlaceId,
    });
    const nearbyPlaces = search.unavailable ? [] : search.peers;
    const pinnedPlaces = preview
      ? []
      : await loadPinnedPlaces({
          competitors: business.competitors,
          fetchImpl: options.fetchImpl,
          googleApiKey: env.googleApiKey,
          hiddenPlaceIds: business.hiddenCompetitorPlaceIds,
          nearbyPlaces,
          selfPlaceId,
        });
    const mapPackPlaces = preview
      ? []
      : await loadPinnedPlaces({
          competitors: mapPack.leaders.map((leader) => ({
            placeId: leader.placeId,
          })),
          fetchImpl: options.fetchImpl,
          googleApiKey: env.googleApiKey,
          hiddenPlaceIds: business.hiddenCompetitorPlaceIds,
          nearbyPlaces: [...nearbyPlaces, ...pinnedPlaces],
          selfPlaceId,
        });
    const phraseByPlace = new Map(
      mapPack.leaders.map((leader) => [
        canonicalPlaceId(leader.placeId),
        leader.phrase,
      ])
    );
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: business.hiddenCompetitorPlaceIds,
      mapPackPlaces: mapPackPlaces.flatMap((candidate) => {
        const phrase = phraseByPlace.get(canonicalPlaceId(candidate.id ?? ""));
        return phrase ? [{ phrase, place: candidate }] : [];
      }),
      nearbyPlaces,
      pinnedPlaces,
      preview,
      selfPlaceId,
    });
    const metrics = phraseMetricsFor(
      mapPack,
      canonicalPlaceId(selfPlaceId),
      selected.map((item) => ({
        placeId: canonicalPlaceId(item.place.id ?? ""),
        website: item.place.websiteUri ?? null,
      }))
    );
    // The running snapshot must be written before the empty-selection return.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    await saveJob(jobId, cacheKeys, {
      phraseRows: metrics.phraseRows,
      placeTypeLabel: search.placeTypeLabel ?? undefined,
      primaryType: search.primaryType ?? undefined,
      radiusMeters: search.radiusMeters,
      source: search.source,
      status: "running",
      subjectFacts: subjectFactsFor(place),
    });

    if (selected.length === 0) {
      await saveJob(jobId, cacheKeys, {
        reason: search.unavailable ?? "no_peers",
        status: "complete",
      });
      return;
    }

    const failed = await auditSelectedPeers(
      jobId,
      cacheKeys,
      selected,
      env,
      options,
      place.location ?? null,
      metrics
    );
    await saveFinishedPeerJob({
      business,
      cacheKeys,
      failed,
      jobId,
      mapPack,
    });
  } catch (error) {
    await saveJob(jobId, cacheKeys, {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    });
  }
};

export const peerSelectionKeyForAudit = async (
  business: Business,
  options: { includeMapPack?: boolean; preview: boolean }
): Promise<string> => {
  const mapPack = await loadMapPackContext(
    business,
    options.includeMapPack === true && !options.preview
  );
  return peerSelectionKeyForBusiness(
    business,
    options.preview,
    mapPack.leaders.map((leader) => leader.placeId)
  );
};

export const ensurePeerAudit = async (
  business: Business,
  options: { includeMapPack?: boolean; preview: boolean }
): Promise<PeerAuditJob> => {
  const placeId = googlePlaceIdFromLocations(business.locations);
  const mapPack = await loadMapPackContext(
    business,
    options.includeMapPack === true && !options.preview
  );
  const selectionKey = peerSelectionKeyForBusiness(
    business,
    options.preview,
    mapPack.leaders.map((leader) => leader.placeId)
  );
  const cacheKeys = peerCacheKeys(business.id, placeId, selectionKey);
  const existing = await readLatestPeerJob(business.id, placeId, selectionKey);
  if (existing && isPeerJobReusable(existing, Date.now())) {
    await writePeerJob(existing, cacheKeys);
    if (mapPack.periodStart && existing.status === "complete") {
      try {
        await persistCompetitorPeriod({
          businessExternalId: business.id,
          nextFixChecks: await nextFixChecksFor(business, existing.peers),
          observations: mapPack.observations,
          peers: snapshotPeers(existing.peers),
          periodStart: mapPack.periodStart,
        });
      } catch (error) {
        console.error("Competitor snapshot could not be saved", error);
      }
    }
    return existing;
  }

  const job = await writePeerJob(blankJob(business.id), cacheKeys);
  const run = async () => {
    await executePeerAudit(
      job.id,
      cacheKeys,
      business,
      placeId,
      options.preview,
      mapPack
    );
  };
  const execution = await getExecutionContext();
  if (execution) {
    execution.waitUntil(run());
    return job;
  }
  await run();
  return (await readPeerJob(job.id)) ?? job;
};
