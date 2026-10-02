import { checksForCategory } from "@/lib/checks/registry";
import { pointsFor } from "@/lib/checks/types";
import type { ListingReviewResult } from "@/lib/listing-review";
import { peerAuditJobSchema, scoreFromCheckValues } from "@/lib/peers";
import type { PeerAuditJob } from "@/lib/peers";
import { buildResearchView } from "@/lib/research-view";
import type { ResearchView } from "@/lib/research-view";
import {
  businessSchema,
  checkResultSchema,
  entitlementStateSchema,
  scanSummarySchema,
} from "@/lib/schema";
import type {
  Business,
  CheckResult,
  EntitlementState,
  ScanSummary,
} from "@/lib/schema";
import {
  GRID_CELL_COUNT,
  seoObservationRowSchema,
  serializeObservationPayload,
} from "@/lib/seo-schema";
import type { SeoObservationRow } from "@/lib/seo-schema";
import type { AuditSummaryResult, CompletedCheck } from "@/lib/summaries";
import { buildFallbackSummary, completedCheckSchema } from "@/lib/summaries";

/** Dev-only fixture id for UI screenshots (never resolved in production). */
export const UI_FIXTURE_BUSINESS_ID = "00000000-0000-4000-a800-000000000001";

export const devUiFixtureEnabled = (): boolean =>
  process.env.NODE_ENV === "development";

const nowIso = (): string => new Date().toISOString();

export const uiFixtureBusiness = (): Business =>
  businessSchema.parse({
    category: "food",
    createdAt: nowIso(),
    deliverooUrl: null,
    doorDashUrl: null,
    facebookUsername: "samplecafe",
    id: UI_FIXTURE_BUSINESS_ID,
    instagramUsername: "samplecafe",
    linkedinUrl: null,
    locations: [
      {
        address: "1 George St, Sydney NSW 2000",
        appleMapsId: null,
        businessId: UI_FIXTURE_BUSINESS_ID,
        createdAt: nowIso(),
        googlePlaceId: "ChIJSamplePlaceId",
        id: 1,
        name: "Sample Cafe",
        updatedAt: nowIso(),
      },
    ],
    menulogUrl: null,
    name: "Sample Cafe",
    tiktokUsername: null,
    uberEatsUrl: null,
    updatedAt: nowIso(),
    userId: null,
    websiteUrl: "https://example.com.au",
    xUsername: null,
    youtubeUrl: null,
  });

export const uiFixtureCheckResults = (): Record<string, CheckResult> => {
  const checks = checksForCategory("food");
  const results: Record<string, CheckResult> = {};
  for (const [index, definition] of checks.entries()) {
    const mod = index % 3;
    let value: boolean | null = null;
    if (mod === 0) {
      value = true;
    } else if (mod === 1) {
      value = false;
    }
    results[definition.id] = checkResultSchema.parse({
      label: value === null ? "Could not verify" : undefined,
      type: "check",
      value,
    });
  }
  return results;
};

export const uiFixtureCompletedChecks = (): CompletedCheck[] => {
  const checks = checksForCategory("food");
  const results = uiFixtureCheckResults();
  return checks.flatMap((definition) => {
    const result = results[definition.id];
    if (!result) {
      return [];
    }
    let status: "pass" | "fail" | "error" = "error";
    if (result.value === true) {
      status = "pass";
    } else if (result.value === false) {
      status = "fail";
    }
    return [
      completedCheckSchema.parse({
        channelCategory: definition.channelCategory,
        id: definition.id,
        label: result.label,
        points: pointsFor(definition, "food"),
        status,
        title: definition.title,
      }),
    ];
  });
};

export const uiFixtureSummary = (): AuditSummaryResult =>
  buildFallbackSummary(uiFixtureCompletedChecks(), "ai_binding_missing");

export const uiFixtureScanHistory = (): ScanSummary[] => [
  scanSummarySchema.parse({
    errorCount: 1,
    failCount: 4,
    finishedAt: nowIso(),
    id: "scan-fixture-1",
    passCount: 12,
    score: 68,
    startedAt: nowIso(),
    status: "complete",
    trigger: "rescan",
  }),
  scanSummarySchema.parse({
    errorCount: 2,
    failCount: 5,
    finishedAt: "2026-08-30T00:00:00.000Z",
    id: "scan-fixture-2",
    passCount: 11,
    score: 61,
    startedAt: "2026-08-30T00:00:00.000Z",
    status: "complete",
    trigger: "schedule",
  }),
];

export const uiFixtureOwnerAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    fixStepsWithoutPayment: false,
    kind: null,
    maskedEmail: null,
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: false,
    unlocked: false,
    yearlyAvailable: true,
  });

export const uiFixtureUnlockedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    kind: "report_once",
    monthlyAvailable: true,
    onceRescan: {
      available: true,
      remaining: 1,
      windowEndsAt: "2026-10-31T00:00:00.000Z",
    },
    paymentsEnabled: true,
    sessionRequired: false,
    unlocked: true,
    yearlyAvailable: true,
  });

export const uiFixtureCheckoutReturnedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    kind: "report_once",
    maskedEmail: "a***@example.com",
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: true,
    unlocked: true,
    yearlyAvailable: true,
  });

export const uiFixtureSharedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    paymentsEnabled: true,
    unlocked: false,
  });

export const uiFixtureListingReview = (): ListingReviewResult => ({
  available: true,
  cached: false,
  content: {
    businessDescription: {
      basedOnSourceIds: ["google_places"],
      suggestedText:
        "Sample Cafe is a neighbourhood coffee shop in Sydney CBD, serving specialty espresso and fresh pastries seven days a week.",
    },
    categories: {
      basedOnSourceIds: ["google_places"],
      primary: "Cafe",
      secondary: ["Coffee shop", "Breakfast restaurant"],
    },
    napMismatches: [
      {
        field: "phone",
        suggestedFix: "Use the same format on Google and your website.",
        values: [
          { sourceId: "google_places", value: "02 9000 0000" },
          { sourceId: "website", value: "(02) 9000-0000" },
        ],
      },
    ],
    photoChecklistGaps: [
      {
        item: "Interior seating",
        reason: "Helps customers understand the dine-in experience.",
      },
    ],
    reviewReplyTemplates: [
      {
        reviewSnippet: "Great coffee, friendly staff.",
        suggestedReply:
          "Thanks for visiting Sample Cafe. We are glad you enjoyed the coffee and we hope to see you again soon.",
      },
    ],
  },
  degradedReason: null,
  disclaimer:
    "Suggestions are generated from listing data and may need your review before publishing.",
  fingerprint: "ui-fixture-listing-review",
  source: "fallback",
});

export const uiFixturePeerAudit = (): PeerAuditJob => {
  const checks: PeerAuditJob["peers"][number]["checks"] = {};
  const values: (boolean | null)[] = [];
  for (const [id, result] of Object.entries(uiFixtureCheckResults())) {
    const value = result.value === false ? true : result.value;
    checks[id] = { value };
    values.push(value);
  }
  const scored = scoreFromCheckValues(values);
  return peerAuditJobSchema.parse({
    businessId: UI_FIXTURE_BUSINESS_ID,
    createdAt: Date.parse("2026-09-01T00:00:00.000Z"),
    id: "peer-job-fixture",
    peers: [
      {
        checks,
        fail: scored.fail,
        name: "Other Cafe",
        pass: scored.pass,
        placeId: "peer-fixture",
        score: scored.score,
        skipped: scored.skipped,
      },
    ],
    placeTypeLabel: "Cafe",
    primaryType: "cafe",
    radiusMeters: 5000,
    status: "complete",
    updatedAt: Date.parse("2026-09-01T00:00:00.000Z"),
  });
};

const AUGUST = "2026-08-01T00:00:00.000Z";
const SEPTEMBER = "2026-09-01T00:00:00.000Z";
const PIN_ID = "pin-sydney";

const fixtureRow = (
  id: string,
  observed: Parameters<typeof serializeObservationPayload>[0],
  periodStart: string
): SeoObservationRow =>
  seoObservationRowSchema.parse({
    businessExternalId: UI_FIXTURE_BUSINESS_ID,
    costUsdMicros: 0,
    id,
    kind: observed.kind,
    observedAt: periodStart,
    payloadJson: serializeObservationPayload(observed),
    periodStart,
    phraseId: null,
    pinId: null,
    skipReason: null,
    status: "complete",
  });

const gridCells = () =>
  Array.from({ length: GRID_CELL_COUNT }, (_, index) => ({
    index,
    latitude: -33.8688,
    longitude: 151.2093,
    rank: index < 4 ? index + 1 : null,
    top: [
      {
        cid: null,
        placeId: "ChIJSamplePlaceId",
        rank: 1,
        rating: 4.6,
        reviewCount: 48,
        title: "Sample Cafe",
      },
      {
        cid: null,
        placeId: "bean-bar",
        rank: 2,
        rating: 4.4,
        reviewCount: 40,
        title: "Bean Bar",
      },
    ],
  }));

export const uiFixtureMonthlyAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    kind: "report_monthly",
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: false,
    unlocked: true,
    yearlyAvailable: true,
  });

export const uiFixtureMonthlyBusiness = (): Business =>
  businessSchema.parse({
    ...uiFixtureBusiness(),
    locations: [
      {
        address: "1 George St, Sydney NSW 2000",
        appleMapsId: null,
        businessId: UI_FIXTURE_BUSINESS_ID,
        createdAt: nowIso(),
        googlePlaceId: "ChIJSamplePlaceId",
        id: 1,
        latitude: -33.8688,
        longitude: 151.2093,
        name: "Sample Cafe",
        pinId: PIN_ID,
        updatedAt: nowIso(),
      },
    ],
    searchPhrases: [
      { id: "phrase-cafe", suggested: true, text: "cafe Newtown" },
      { id: "phrase-coffee", suggested: false, text: "coffee Sydney" },
      { id: "phrase-brunch", suggested: false, text: "brunch near me" },
    ],
  });

const summaryPayload = (
  period: "previous" | "current"
): Parameters<typeof serializeObservationPayload>[0] => {
  const current = period === "current";
  return {
    kind: "period_summary",
    payload: {
      aiOverview: {
        "phrase-brunch": "none",
        "phrase-cafe": current ? "cited" : "not_cited",
        "phrase-coffee": current ? "cited" : "none",
      },
      competitors: {
        "bean-bar": {
          gridTop3Count: { "phrase-cafe": current ? 6 : 2 },
          listingScore: current ? 74 : 70,
          rating: 4.4,
          reviewCount: current ? 40 : 26,
        },
        "other-cafe": {
          gridTop3Count: { "phrase-cafe": 1 },
          listingScore: 62,
          rating: 4.2,
          reviewCount: current ? 18 : 16,
        },
      },
      estimatedTraffic: current ? 150 : 120,
      gridTop3Count: {
        [PIN_ID]: { "phrase-cafe": current ? 6 : 4 },
      },
      listingScore: current ? 68 : 61,
      organicPosition: { "phrase-cafe": current ? 5 : 8 },
      ownerReplyRate: current ? 0.4 : 0.2,
      rating: 4.6,
      referringDomains: current ? 11 : 8,
      reviewCount: current ? 48 : 40,
      searchVolume: {
        "phrase-brunch": 2400,
        "phrase-cafe": 1900,
        "phrase-coffee": 5400,
      },
    },
  };
};

/** Two stored months, or one when `periodCount` is 1. */
export const uiFixtureResearchView = (periodCount = 2): ResearchView => {
  const business = uiFixtureMonthlyBusiness();
  const summaries = [
    fixtureRow("summary-sep", summaryPayload("current"), SEPTEMBER),
  ];
  if (periodCount > 1) {
    summaries.push(
      fixtureRow("summary-aug", summaryPayload("previous"), AUGUST)
    );
  }
  const snapshots = [
    fixtureRow(
      "snapshot-sep",
      {
        kind: "competitor_snapshot",
        payload: {
          competitors: [
            {
              distanceMetres: 400,
              latestReviewAt: "2026-09-12T00:00:00.000Z",
              listingScore: 74,
              mapPackCells: { "phrase-cafe": 6 },
              name: "Bean Bar",
              organicPosition: { "phrase-cafe": 3 },
              ownerReplyRate: 0.5,
              photoCount: 20,
              placeId: "bean-bar",
              primaryType: "cafe",
              rating: 4.4,
              reviewCount: 40,
              source: "map_pack",
            },
            {
              distanceMetres: 800,
              latestReviewAt: "2026-08-02T00:00:00.000Z",
              listingScore: 62,
              mapPackCells: { "phrase-cafe": 1 },
              name: "Other Cafe",
              organicPosition: {},
              ownerReplyRate: 0.1,
              photoCount: 8,
              placeId: "other-cafe",
              primaryType: "cafe",
              rating: 4.2,
              reviewCount: 18,
              source: "nearby",
            },
          ],
        },
      },
      SEPTEMBER
    ),
  ];
  const periodRows = [
    fixtureRow(
      "grid-cafe",
      {
        kind: "rank_grid",
        payload: {
          cells: gridCells(),
          center: { latitude: -33.8688, longitude: 151.2093 },
          checkedAt: SEPTEMBER,
          phrase: "cafe Newtown",
          phraseId: "phrase-cafe",
          pinId: PIN_ID,
          spacingMetres: 500,
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "ai-cafe",
      {
        kind: "ai_mention",
        payload: {
          citedUrl: "https://example.com.au",
          phrase: "cafe Newtown",
          phraseId: "phrase-cafe",
          status: "cited",
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "ai-coffee",
      {
        kind: "ai_mention",
        payload: {
          citedUrl: null,
          phrase: "coffee Sydney",
          phraseId: "phrase-coffee",
          status: "not_cited",
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "ai-brunch",
      {
        kind: "ai_mention",
        payload: {
          citedUrl: null,
          phrase: "brunch near me",
          phraseId: "phrase-brunch",
          status: "none",
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "serp-cafe",
      {
        kind: "organic_serp",
        payload: {
          aiOverview: { citations: [], present: true },
          checkedAt: SEPTEMBER,
          locationCode: 2036,
          phrase: "cafe Newtown",
          phraseId: "phrase-cafe",
          position: 5,
          results: [
            {
              domain: "example.com.au",
              position: 5,
              title: "Sample Cafe",
              url: "https://example.com.au",
            },
          ],
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "keywords",
      {
        kind: "keyword_metrics",
        payload: {
          checkedAt: SEPTEMBER,
          keywords: [
            {
              cpc: 1.2,
              intent: "local",
              keyword: "cafe Newtown",
              keywordDifficulty: 32,
              phraseId: "phrase-cafe",
              searchVolume: 1900,
            },
            {
              cpc: 0.9,
              intent: "local",
              keyword: "coffee Sydney",
              keywordDifficulty: 48,
              phraseId: "phrase-coffee",
              searchVolume: 5400,
            },
            {
              cpc: 0.7,
              intent: "local",
              keyword: "brunch near me",
              keywordDifficulty: 21,
              phraseId: "phrase-brunch",
              searchVolume: 2400,
            },
          ],
          locationCode: 2036,
          scope: "national",
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "reviews",
      {
        kind: "review_gap",
        payload: {
          rows: [
            {
              isSelf: true,
              latestReviewAt: "2026-09-20T00:00:00.000Z",
              name: "Sample Cafe",
              ownerReplyRate: 0.4,
              placeId: "ChIJSamplePlaceId",
              rating: 4.6,
              reviewCount: 48,
            },
            {
              isSelf: false,
              latestReviewAt: "2026-09-12T00:00:00.000Z",
              name: "Bean Bar",
              ownerReplyRate: 0.5,
              placeId: "bean-bar",
              rating: 4.4,
              reviewCount: 40,
            },
            {
              isSelf: false,
              latestReviewAt: "2026-08-02T00:00:00.000Z",
              name: "Other Cafe",
              ownerReplyRate: 0.1,
              placeId: "other-cafe",
              rating: 4.2,
              reviewCount: 18,
            },
          ],
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "posts",
      {
        kind: "gbp_posts_qa",
        payload: {
          checkedAt: SEPTEMBER,
          latestPostAt: "2026-09-10T00:00:00.000Z",
          latestQuestionAt: null,
          postsCount: 4,
          postsLast90Days: 1,
          questionsCount: 2,
          unansweredCount: 1,
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "domain",
      {
        kind: "domain_overview",
        payload: {
          checkedAt: SEPTEMBER,
          domain: "example.com.au",
          estimatedTraffic: 150,
          locationCode: 2036,
          rankedKeywords: 40,
          top10Keywords: 6,
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "backlinks",
      {
        kind: "backlinks",
        payload: {
          backlinks: 30,
          checkedAt: SEPTEMBER,
          domain: "example.com.au",
          rank: 20,
          referringDomains: 11,
          topReferringDomains: [
            { backlinks: 4, domain: "broadsheet.com.au", rank: 40 },
          ],
        },
      },
      SEPTEMBER
    ),
    fixtureRow(
      "prospects",
      {
        kind: "link_prospects",
        payload: {
          domains: [
            {
              competitorDomains: ["beanbar.example"],
              domain: "timeout.com",
              rank: 50,
            },
          ],
          source: "link_gap",
        },
      },
      SEPTEMBER
    ),
  ];
  return buildResearchView({
    periodRows,
    phrases: business.searchPhrases,
    pinId: PIN_ID,
    snapshotRows: snapshots,
    summaryRows: summaries,
  });
};
