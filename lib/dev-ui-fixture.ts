import { buildResearchView } from "@/lib/research-view";
import type { ResearchView } from "@/lib/research-view";
import { businessSchema, entitlementStateSchema } from "@/lib/schema";
import type { Business, EntitlementState } from "@/lib/schema";
import {
  GRID_CELL_COUNT,
  seoObservationRowSchema,
  serializeObservationPayload,
} from "@/lib/seo-schema";
import type { SeoObservationRow } from "@/lib/seo-schema";
import {
  UI_FIXTURE_BUSINESS_ID,
  uiFixtureBusiness,
} from "@/lib/sample-report-fixture";

export {
  SAMPLE_REPORT_BUSINESS_ID,
  UI_FIXTURE_BUSINESS_ID,
  sampleReportPreviewAccess,
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixtureCompletedChecks,
  uiFixtureListingReview,
  uiFixtureOwnerAccess,
  uiFixturePeerAudit,
  uiFixtureScanHistory,
  uiFixtureSummary,
} from "@/lib/sample-report-fixture";

export const devUiFixtureEnabled = (): boolean =>
  process.env.NODE_ENV === "development";

const nowIso = (): string => new Date().toISOString();

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
