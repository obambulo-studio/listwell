import { z } from "zod";

import {
  MAX_COMPETITORS,
  MAX_HIDDEN_COMPETITORS,
  MAX_SEARCH_PHRASES,
  payloadByteLength,
  SEO_COMPETITOR_SOURCES,
  SEO_OBSERVATION_KINDS,
  SEO_OBSERVATION_STATUSES,
  SEO_PAYLOAD_MAX_BYTES,
  SEO_SKIP_REASONS,
} from "../convex/lib/seo";
import { SCAN_INTERVAL_MS } from "./scan-config";

export {
  decideSpend,
  entitlementAllowsResearch,
  MAX_COMPETITORS,
  MAX_HIDDEN_COMPETITORS,
  MAX_SEARCH_PHRASES,
  microsToUsd,
  SEO_ALLOWANCE_CAP_USD_MICROS,
  SEO_PAYLOAD_MAX_BYTES,
  spendMonth,
  usdToMicros,
} from "../convex/lib/seo";
export type {
  SeoCompetitorSource,
  SeoObservationKind,
  SeoObservationStatus,
  SeoSkipReason,
  SpendDecision,
} from "../convex/lib/seo";

/** DataForSEO location code for Australia. Keyword volume is national. */
export const SEO_LOCATION_CODE_AU = 2036;
export const SEO_LANGUAGE_CODE = "en";

export const GRID_CELL_COUNT = 9;
export const GRID_PLACES_PER_CELL = 3;
export const GRID_SPACING_METRES = 1000;
export const ORGANIC_RESULTS_KEPT = 20;
export const AI_CITATIONS_KEPT = 20;
export const REFERRING_DOMAINS_KEPT = 10;
export const LINK_GAP_DOMAINS_KEPT = 25;
export const LINK_PROSPECTS_KEPT = 10;
export const LINK_GAP_COMPETITORS = 2;

const TEXT_MAX_CHARS = 300;
const URL_MAX_CHARS = 500;
const PHRASE_MAX_CHARS = 80;
const METRES_PER_DEGREE_LATITUDE = 111_320;
const GRID_COORDINATE_DECIMALS = 7;
const CACHE_COORDINATE_DECIMALS = 3;
const PIN_COORDINATE_DECIMALS = 5;

const WHITESPACE_RUN = /\s+/gu;

/** Arrays are cut to the stored limit, not rejected, so a large response still saves. */
const capped = <Item extends z.ZodType>(item: Item, max: number) =>
  z.array(item).transform((items) => items.slice(0, max));

const text = (max = TEXT_MAX_CHARS) =>
  z.string().transform((value) => value.slice(0, max));

const nullableText = (max = TEXT_MAX_CHARS) => text(max).nullable();
const isoString = z.string().min(1);
const count = z.number().int().nonnegative();
const position = z.number().int().positive();
const rate = z.number().min(0).max(1);
const gridCellCount = z.number().int().min(0).max(GRID_CELL_COUNT);

export const seoObservationKindSchema = z.enum(SEO_OBSERVATION_KINDS);
export const seoObservationStatusSchema = z.enum(SEO_OBSERVATION_STATUSES);
export const seoSkipReasonSchema = z.enum(SEO_SKIP_REASONS);
export const seoCompetitorSourceSchema = z.enum(SEO_COMPETITOR_SOURCES);

export const searchPhraseSchema = z.object({
  id: z.string().min(1).max(64),
  suggested: z.boolean(),
  text: z.string().trim().min(1).max(PHRASE_MAX_CHARS),
});
export type SearchPhrase = z.infer<typeof searchPhraseSchema>;

export const searchPhrasesSchema = z
  .array(searchPhraseSchema)
  .max(MAX_SEARCH_PHRASES);

export const pinnedCompetitorSchema = z.object({
  placeId: z.string().min(1),
  source: z.literal("pinned"),
});
export type PinnedCompetitor = z.infer<typeof pinnedCompetitorSchema>;

export const pinnedCompetitorsSchema = z
  .array(pinnedCompetitorSchema)
  .max(MAX_COMPETITORS);

export const hiddenCompetitorPlaceIdsSchema = z
  .array(z.string().min(1))
  .max(MAX_HIDDEN_COMPETITORS);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const normalisePhrase = (value: string): string =>
  value.trim().toLowerCase().replace(WHITESPACE_RUN, " ");

export const newSearchPhraseId = (): string => `phrase_${crypto.randomUUID()}`;

/**
 * Keeps the id when the words are unchanged. A new wording gets a new id, so
 * the old series stays on the charts as "no longer tracked".
 */
export const reviseSearchPhrases = (
  current: readonly SearchPhrase[],
  next: readonly { text: string; suggested?: boolean }[]
): SearchPhrase[] => {
  const byText = new Map(
    current.map((phrase) => [normalisePhrase(phrase.text), phrase])
  );
  const seen = new Set<string>();
  const revised: SearchPhrase[] = [];
  for (const entry of next) {
    const key = normalisePhrase(entry.text);
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const existing = byText.get(key);
    revised.push(
      searchPhraseSchema.parse({
        id: existing?.id ?? newSearchPhraseId(),
        suggested: entry.suggested ?? existing?.suggested ?? false,
        text: entry.text,
      })
    );
  }
  return searchPhrasesSchema.parse(revised.slice(0, MAX_SEARCH_PHRASES));
};

/** Moving the pin changes the id, which starts a new grid series. */
export const pinIdFromCoordinates = (center: Coordinates): string =>
  `pin_${center.latitude.toFixed(PIN_COORDINATE_DECIMALS)}_${center.longitude.toFixed(PIN_COORDINATE_DECIMALS)}`;

export const roundedCoordinateKey = (center: Coordinates): string =>
  `${center.latitude.toFixed(CACHE_COORDINATE_DECIMALS)},${center.longitude.toFixed(CACHE_COORDINATE_DECIMALS)}`;

const roundGridCoordinate = (value: number): number =>
  Number(value.toFixed(GRID_COORDINATE_DECIMALS));

/** 3×3 points around the pin, row by row from the north-west corner. */
export const gridPoints = (
  center: Coordinates,
  spacingMetres = GRID_SPACING_METRES
): Coordinates[] => {
  const latitudeStep = spacingMetres / METRES_PER_DEGREE_LATITUDE;
  const longitudeStep =
    spacingMetres /
    (METRES_PER_DEGREE_LATITUDE * Math.cos((center.latitude * Math.PI) / 180));
  const points: Coordinates[] = [];
  for (const row of [1, 0, -1]) {
    for (const column of [-1, 0, 1]) {
      points.push(
        coordinatesSchema.parse({
          latitude: roundGridCoordinate(center.latitude + row * latitudeStep),
          longitude: roundGridCoordinate(
            center.longitude + column * longitudeStep
          ),
        })
      );
    }
  }
  return points;
};

/** A period starts when its scan was due: `nextScanAt` minus one interval. */
export const researchPeriodStart = (nextScanAt: string): string => {
  const due = Date.parse(nextScanAt);
  if (Number.isNaN(due)) {
    throw new TypeError("nextScanAt is not a valid date");
  }
  return new Date(due - SCAN_INTERVAL_MS).toISOString();
};

const gridPlaceSchema = z.object({
  cid: z.string().nullable(),
  placeId: z.string().nullable(),
  rank: position,
  rating: z.number().nullable(),
  reviewCount: count.nullable(),
  title: text(),
});
export type GridPlace = z.infer<typeof gridPlaceSchema>;

const gridCellSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .max(GRID_CELL_COUNT - 1),
  latitude: z.number(),
  longitude: z.number(),
  rank: position.nullable(),
  top: capped(gridPlaceSchema, GRID_PLACES_PER_CELL),
});

export const rankGridPayloadSchema = z.object({
  cells: capped(gridCellSchema, GRID_CELL_COUNT),
  center: coordinatesSchema,
  checkedAt: isoString,
  phrase: text(PHRASE_MAX_CHARS),
  phraseId: z.string().min(1),
  pinId: z.string().min(1),
  spacingMetres: z.number().positive(),
});
export type RankGridPayload = z.infer<typeof rankGridPayloadSchema>;

const aiCitationSchema = z.object({
  domain: nullableText(),
  source: nullableText(),
  title: nullableText(),
  url: nullableText(URL_MAX_CHARS),
});
export type AiCitation = z.infer<typeof aiCitationSchema>;

const organicResultSchema = z.object({
  domain: nullableText(),
  position,
  title: nullableText(),
  url: nullableText(URL_MAX_CHARS),
});
export type OrganicResult = z.infer<typeof organicResultSchema>;

export const organicSerpPayloadSchema = z.object({
  aiOverview: z.object({
    citations: capped(aiCitationSchema, AI_CITATIONS_KEPT),
    present: z.boolean(),
  }),
  checkedAt: isoString,
  locationCode: z.number().int(),
  phrase: text(PHRASE_MAX_CHARS),
  phraseId: z.string().min(1),
  position: position.nullable(),
  results: capped(organicResultSchema, ORGANIC_RESULTS_KEPT),
});
export type OrganicSerpPayload = z.infer<typeof organicSerpPayloadSchema>;

const keywordMetricSchema = z.object({
  cpc: z.number().nonnegative().nullable(),
  intent: nullableText(40),
  keyword: text(PHRASE_MAX_CHARS),
  keywordDifficulty: z.number().min(0).max(100).nullable(),
  phraseId: z.string().min(1),
  searchVolume: count.nullable(),
});
export type KeywordMetric = z.infer<typeof keywordMetricSchema>;

export const keywordMetricsPayloadSchema = z.object({
  checkedAt: isoString,
  keywords: capped(keywordMetricSchema, MAX_SEARCH_PHRASES),
  locationCode: z.number().int(),
  scope: z.literal("national"),
});
export type KeywordMetricsPayload = z.infer<typeof keywordMetricsPayloadSchema>;

/** Aggregates only. Reviewer names and review text are never stored. */
export const reviewSamplePayloadSchema = z.object({
  averageSampleRating: z.number().min(0).max(5).nullable(),
  checkedAt: isoString,
  isSelf: z.boolean(),
  latestReviewAt: isoString.nullable(),
  ownerReplyRate: rate.nullable(),
  placeId: z.string().min(1),
  reviewsLast90Days: count,
  sampleSize: count,
});
export type ReviewSamplePayload = z.infer<typeof reviewSamplePayloadSchema>;

export const gbpPostsQaPayloadSchema = z.object({
  checkedAt: isoString,
  latestPostAt: isoString.nullable(),
  latestQuestionAt: isoString.nullable(),
  postsCount: count,
  postsLast90Days: count,
  questionsCount: count,
  unansweredCount: count,
});
export type GbpPostsQaPayload = z.infer<typeof gbpPostsQaPayloadSchema>;

export const domainOverviewPayloadSchema = z.object({
  checkedAt: isoString,
  domain: text(),
  estimatedTraffic: z.number().nonnegative().nullable(),
  locationCode: z.number().int(),
  rankedKeywords: count.nullable(),
  top10Keywords: count.nullable(),
});
export type DomainOverviewPayload = z.infer<typeof domainOverviewPayloadSchema>;

const referringDomainSchema = z.object({
  backlinks: count.nullable(),
  domain: text(),
  rank: z.number().nonnegative().nullable(),
});
export type ReferringDomain = z.infer<typeof referringDomainSchema>;

export const backlinksPayloadSchema = z.object({
  backlinks: count.nullable(),
  checkedAt: isoString,
  domain: text(),
  rank: z.number().nonnegative().nullable(),
  referringDomains: count.nullable(),
  topReferringDomains: capped(referringDomainSchema, REFERRING_DOMAINS_KEPT),
});
export type BacklinksPayload = z.infer<typeof backlinksPayloadSchema>;

const linkGapDomainSchema = z.object({
  domain: text(),
  linksTo: capped(text(), LINK_GAP_COMPETITORS),
  rank: z.number().nonnegative().nullable(),
});
export type LinkGapDomain = z.infer<typeof linkGapDomainSchema>;

export const linkGapPayloadSchema = z.object({
  checkedAt: isoString,
  competitorDomains: capped(text(), LINK_GAP_COMPETITORS),
  domain: text(),
  domains: capped(linkGapDomainSchema, LINK_GAP_DOMAINS_KEPT),
});
export type LinkGapPayload = z.infer<typeof linkGapPayloadSchema>;

const reviewGapRowSchema = z.object({
  isSelf: z.boolean(),
  latestReviewAt: isoString.nullable(),
  name: nullableText(),
  ownerReplyRate: rate.nullable(),
  placeId: z.string().min(1),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: count.nullable(),
});

export const reviewGapPayloadSchema = z.object({
  rows: capped(reviewGapRowSchema, MAX_COMPETITORS + 1),
});
export type ReviewGapPayload = z.infer<typeof reviewGapPayloadSchema>;

export const linkProspectsPayloadSchema = z.object({
  domains: capped(
    z.object({
      competitorDomains: capped(text(), LINK_GAP_COMPETITORS),
      domain: text(),
      rank: z.number().nonnegative().nullable(),
    }),
    LINK_PROSPECTS_KEPT
  ),
  source: z.enum(["link_gap", "own_referring_domains"]),
});
export type LinkProspectsPayload = z.infer<typeof linkProspectsPayloadSchema>;

/** `none` means Google showed no AI Overview, which differs from `not_cited`. */
export const aiOverviewStatusSchema = z.enum(["none", "cited", "not_cited"]);
export type AiOverviewStatus = z.infer<typeof aiOverviewStatusSchema>;

export const aiMentionPayloadSchema = z.object({
  citedUrl: nullableText(URL_MAX_CHARS),
  phrase: text(PHRASE_MAX_CHARS),
  phraseId: z.string().min(1),
  status: aiOverviewStatusSchema,
});
export type AiMentionPayload = z.infer<typeof aiMentionPayloadSchema>;

const phraseRecord = <Value extends z.ZodType>(value: Value) =>
  z.record(z.string(), value);

const competitorSnapshotEntrySchema = z.object({
  distanceMetres: z.number().nonnegative().nullable(),
  latestReviewAt: isoString.nullable(),
  listingScore: z.number().min(0).max(100).nullable(),
  mapPackCells: phraseRecord(gridCellCount),
  name: text(),
  organicPosition: phraseRecord(position),
  ownerReplyRate: rate.nullable(),
  photoCount: count.nullable(),
  placeId: z.string().min(1),
  primaryType: nullableText(80),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: count.nullable(),
  source: seoCompetitorSourceSchema,
});
export type CompetitorSnapshotEntry = z.infer<
  typeof competitorSnapshotEntrySchema
>;

export const competitorSnapshotPayloadSchema = z.object({
  competitors: capped(competitorSnapshotEntrySchema, MAX_COMPETITORS),
});
export type CompetitorSnapshotPayload = z.infer<
  typeof competitorSnapshotPayloadSchema
>;

export const nextFixPayloadSchema = z.object({
  checkId: z.string().min(1),
  competitorCount: count,
  competitorPassCount: count,
});
export type NextFixPayload = z.infer<typeof nextFixPayloadSchema>;

/**
 * The only input to the charts and the email. Every field is optional: a
 * skipped step leaves a gap, never a zero.
 */
export const periodSummaryPayloadSchema = z.object({
  aiOverview: phraseRecord(aiOverviewStatusSchema).optional(),
  competitors: z
    .record(
      z.string(),
      z.object({
        gridTop3Count: phraseRecord(gridCellCount).optional(),
        listingScore: z.number().min(0).max(100).optional(),
        organicPosition: phraseRecord(position).optional(),
        rating: z.number().min(0).max(5).optional(),
        reviewCount: count.optional(),
      })
    )
    .optional(),
  estimatedTraffic: z.number().nonnegative().optional(),
  gridTop3Count: z.record(z.string(), phraseRecord(gridCellCount)).optional(),
  listingScore: z.number().min(0).max(100).optional(),
  organicPosition: phraseRecord(position).optional(),
  ownerReplyRate: rate.optional(),
  rating: z.number().min(0).max(5).optional(),
  referringDomains: count.optional(),
  reviewCount: count.optional(),
  searchVolume: phraseRecord(count).optional(),
});
export type PeriodSummaryPayload = z.infer<typeof periodSummaryPayloadSchema>;

export const seoObservationPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rank_grid"), payload: rankGridPayloadSchema }),
  z.object({
    kind: z.literal("organic_serp"),
    payload: organicSerpPayloadSchema,
  }),
  z.object({
    kind: z.literal("keyword_metrics"),
    payload: keywordMetricsPayloadSchema,
  }),
  z.object({
    kind: z.literal("review_sample"),
    payload: reviewSamplePayloadSchema,
  }),
  z.object({
    kind: z.literal("gbp_posts_qa"),
    payload: gbpPostsQaPayloadSchema,
  }),
  z.object({
    kind: z.literal("domain_overview"),
    payload: domainOverviewPayloadSchema,
  }),
  z.object({ kind: z.literal("backlinks"), payload: backlinksPayloadSchema }),
  z.object({ kind: z.literal("link_gap"), payload: linkGapPayloadSchema }),
  z.object({ kind: z.literal("review_gap"), payload: reviewGapPayloadSchema }),
  z.object({
    kind: z.literal("link_prospects"),
    payload: linkProspectsPayloadSchema,
  }),
  z.object({ kind: z.literal("ai_mention"), payload: aiMentionPayloadSchema }),
  z.object({
    kind: z.literal("competitor_snapshot"),
    payload: competitorSnapshotPayloadSchema,
  }),
  z.object({ kind: z.literal("next_fix"), payload: nextFixPayloadSchema }),
  z.object({
    kind: z.literal("period_summary"),
    payload: periodSummaryPayloadSchema,
  }),
]);
export type SeoObservationPayload = z.infer<typeof seoObservationPayloadSchema>;
export type SeoObservationPayloadInput = z.input<
  typeof seoObservationPayloadSchema
>;

/** Parses, trims to the stored limits, and refuses anything over the document limit. */
export const serializeObservationPayload = (
  input: SeoObservationPayloadInput
): string => {
  const { payload } = seoObservationPayloadSchema.parse(input);
  const json = JSON.stringify(payload);
  if (payloadByteLength(json) > SEO_PAYLOAD_MAX_BYTES) {
    throw new Error(`${input.kind} payload is over the stored size limit`);
  }
  return json;
};

export const seoObservationRowSchema = z.object({
  businessExternalId: z.string(),
  costUsdMicros: count,
  id: z.string(),
  kind: seoObservationKindSchema,
  observedAt: z.string(),
  payloadJson: z.string().nullable(),
  periodStart: z.string(),
  phraseId: z.string().nullable(),
  pinId: z.string().nullable(),
  skipReason: seoSkipReasonSchema.nullable(),
  status: seoObservationStatusSchema,
});
export type SeoObservationRow = z.infer<typeof seoObservationRowSchema>;

/** Null for rows without a payload (queued, skipped, error). Throws on a bad payload. */
export const readObservationPayload = (
  row: Pick<SeoObservationRow, "kind" | "payloadJson">
): SeoObservationPayload | null => {
  if (!row.payloadJson) {
    return null;
  }
  return seoObservationPayloadSchema.parse({
    kind: row.kind,
    payload: JSON.parse(row.payloadJson),
  });
};

export const gridTop3Count = (
  payload: RankGridPayload,
  placeId?: string
): number => {
  if (!placeId) {
    return payload.cells.filter((cell) => cell.rank !== null && cell.rank <= 3)
      .length;
  }
  return payload.cells.filter((cell) =>
    cell.top.some((place) => place.placeId === placeId)
  ).length;
};
