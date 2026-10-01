import { describe, expect, it } from "vitest";

import { SEO_OBSERVATION_KINDS } from "../convex/lib/seo";
import {
  decideSpend,
  entitlementAllowsResearch,
  gridPoints,
  gridTop3Count,
  ORGANIC_RESULTS_KEPT,
  pinIdFromCoordinates,
  rankGridPayloadSchema,
  readObservationPayload,
  researchPeriodStart,
  reviseSearchPhrases,
  SEO_PAYLOAD_MAX_BYTES,
  serializeObservationPayload,
} from "./seo-schema";
import type { SeoObservationPayloadInput } from "./seo-schema";

const checkedAt = "2026-10-01T00:00:00.000Z";
const center = { latitude: -37.8136, longitude: 144.9631 };

const fixtures: SeoObservationPayloadInput[] = [
  {
    kind: "rank_grid",
    payload: {
      cells: gridPoints(center).map((point, index) => ({
        index,
        latitude: point.latitude,
        longitude: point.longitude,
        rank: index === 4 ? 2 : null,
        top: [
          {
            cid: "1",
            placeId: "place_a",
            rank: 1,
            rating: 4.6,
            reviewCount: 120,
            title: "Cafe A",
          },
          {
            cid: "2",
            placeId: "place_self",
            rank: 2,
            rating: 4.8,
            reviewCount: 40,
            title: "Our cafe",
          },
        ],
      })),
      center,
      checkedAt,
      phrase: "cafe fitzroy",
      phraseId: "phrase_1",
      pinId: pinIdFromCoordinates(center),
      spacingMetres: 1000,
    },
  },
  {
    kind: "organic_serp",
    payload: {
      aiOverview: {
        citations: [
          {
            domain: "example.com.au",
            source: "Example",
            title: "Best cafes",
            url: "https://example.com.au/cafes",
          },
        ],
        present: true,
      },
      checkedAt,
      locationCode: 2036,
      phrase: "cafe fitzroy",
      phraseId: "phrase_1",
      position: 4,
      results: [
        {
          domain: "example.com.au",
          position: 1,
          title: "Best cafes",
          url: "https://example.com.au/cafes",
        },
      ],
    },
  },
  {
    kind: "keyword_metrics",
    payload: {
      checkedAt,
      keywords: [
        {
          cpc: 1.2,
          intent: "commercial",
          keyword: "cafe fitzroy",
          keywordDifficulty: 12,
          phraseId: "phrase_1",
          searchVolume: 880,
        },
      ],
      locationCode: 2036,
      scope: "national",
    },
  },
  {
    kind: "review_sample",
    payload: {
      averageSampleRating: 4.5,
      checkedAt,
      isSelf: true,
      latestReviewAt: checkedAt,
      ownerReplyRate: 0.5,
      placeId: "place_self",
      reviewsLast90Days: 6,
      sampleSize: 20,
    },
  },
  {
    kind: "gbp_posts_qa",
    payload: {
      checkedAt,
      latestPostAt: null,
      latestQuestionAt: checkedAt,
      postsCount: 0,
      postsLast90Days: 0,
      questionsCount: 3,
      unansweredCount: 1,
    },
  },
  {
    kind: "domain_overview",
    payload: {
      checkedAt,
      domain: "ourcafe.com.au",
      estimatedTraffic: 310.5,
      locationCode: 2036,
      rankedKeywords: 42,
      top10Keywords: 7,
    },
  },
  {
    kind: "backlinks",
    payload: {
      backlinks: 120,
      checkedAt,
      domain: "ourcafe.com.au",
      rank: 18,
      referringDomains: 31,
      topReferringDomains: [
        { backlinks: 4, domain: "broadsheet.com.au", rank: 60 },
      ],
    },
  },
  {
    kind: "link_gap",
    payload: {
      checkedAt,
      competitorDomains: ["cafea.com.au", "cafeb.com.au"],
      domain: "ourcafe.com.au",
      domains: [
        {
          domain: "broadsheet.com.au",
          linksTo: ["cafea.com.au"],
          rank: 60,
        },
      ],
    },
  },
  {
    kind: "review_gap",
    payload: {
      rows: [
        {
          isSelf: true,
          latestReviewAt: checkedAt,
          name: "Our cafe",
          ownerReplyRate: 0.5,
          placeId: "place_self",
          rating: 4.8,
          reviewCount: 40,
        },
      ],
    },
  },
  {
    kind: "link_prospects",
    payload: {
      domains: [
        {
          competitorDomains: ["cafea.com.au"],
          domain: "broadsheet.com.au",
          rank: 60,
        },
      ],
      source: "link_gap",
    },
  },
  {
    kind: "ai_mention",
    payload: {
      citedUrl: null,
      phrase: "cafe fitzroy",
      phraseId: "phrase_1",
      status: "not_cited",
    },
  },
  {
    kind: "competitor_snapshot",
    payload: {
      competitors: [
        {
          distanceMetres: 450,
          latestReviewAt: null,
          listingScore: 82,
          mapPackCells: { phrase_1: 6 },
          name: "Cafe A",
          organicPosition: { phrase_1: 3 },
          ownerReplyRate: null,
          photoCount: 54,
          placeId: "place_a",
          primaryType: "cafe",
          rating: 4.6,
          reviewCount: 120,
          source: "map_pack",
        },
      ],
    },
  },
  {
    kind: "next_fix",
    payload: {
      checkId: "google-hours",
      competitorCount: 3,
      competitorPassCount: 3,
    },
  },
  {
    kind: "period_summary",
    payload: {
      aiOverview: { phrase_1: "none" },
      competitors: { place_a: { gridTop3Count: { phrase_1: 6 }, rating: 4.6 } },
      gridTop3Count: { [pinIdFromCoordinates(center)]: { phrase_1: 1 } },
      listingScore: 76,
      organicPosition: { phrase_1: 4 },
      reviewCount: 40,
    },
  },
];

describe("seo observation payloads", () => {
  it("has a fixture for every kind", () => {
    expect(fixtures.map((fixture) => fixture.kind).toSorted()).toStrictEqual(
      [...SEO_OBSERVATION_KINDS].toSorted()
    );
  });

  it.each(fixtures)("round-trips $kind", (fixture) => {
    const payloadJson = serializeObservationPayload(fixture);
    const read = readObservationPayload({ kind: fixture.kind, payloadJson });
    expect(read?.kind).toBe(fixture.kind);
    expect(read?.payload).toStrictEqual(JSON.parse(payloadJson));
  });

  it("rejects a payload under the wrong kind", () => {
    expect(() =>
      readObservationPayload({
        kind: "backlinks",
        payloadJson: JSON.stringify({ status: "cited" }),
      })
    ).toThrow("expected");
  });

  it("returns null for rows without a payload", () => {
    expect(
      readObservationPayload({ kind: "rank_grid", payloadJson: null })
    ).toBeNull();
  });

  it("trims a large organic payload under the document limit", () => {
    const longText = "x".repeat(5000);
    const results = Array.from({ length: 5000 }, (_, index) => ({
      domain: `site-${index}.com.au`,
      position: index + 1,
      title: longText,
      url: `https://site-${index}.com.au/${longText}`,
    }));
    const payloadJson = serializeObservationPayload({
      kind: "organic_serp",
      payload: {
        aiOverview: {
          citations: results.map((result) => ({
            domain: result.domain,
            source: longText,
            title: longText,
            url: result.url,
          })),
          present: true,
        },
        checkedAt,
        locationCode: 2036,
        phrase: "cafe fitzroy",
        phraseId: "phrase_1",
        position: null,
        results,
      },
    });
    const parsed = readObservationPayload({
      kind: "organic_serp",
      payloadJson,
    });
    expect(new TextEncoder().encode(payloadJson).length).toBeLessThan(
      SEO_PAYLOAD_MAX_BYTES
    );
    expect(
      parsed?.kind === "organic_serp" && parsed.payload.results
    ).toHaveLength(ORGANIC_RESULTS_KEPT);
  });

  it("refuses a payload that is still over the limit after trimming", () => {
    const organicPosition = Object.fromEntries(
      Array.from({ length: 100_000 }, (_, index) => [`phrase_${index}`, 1])
    );
    expect(() =>
      serializeObservationPayload({
        kind: "period_summary",
        payload: { organicPosition },
      })
    ).toThrow("over the stored size limit");
  });
});

describe("grid and phrases", () => {
  it("builds a 3×3 grid around the pin, north-west first", () => {
    const points = gridPoints(center);
    expect(points).toHaveLength(9);
    expect(points[4]).toStrictEqual(center);
    expect(points[0]?.latitude).toBeGreaterThan(center.latitude);
    expect(points[0]?.longitude).toBeLessThan(center.longitude);
    expect(points[8]?.latitude).toBeLessThan(center.latitude);
  });

  it("spaces grid points one kilometre apart", () => {
    const [, north] = gridPoints(center);
    const northStep = (north?.latitude ?? 0) - center.latitude;
    expect(northStep * 111_320).toBeCloseTo(1000, 0);
  });

  it("counts top-three cells for the business and a competitor", () => {
    const fixture = fixtures.find((entry) => entry.kind === "rank_grid");
    const payload = rankGridPayloadSchema.parse(fixture?.payload);
    expect(gridTop3Count(payload)).toBe(1);
    expect(gridTop3Count(payload, "place_a")).toBe(9);
  });

  it("keeps a phrase id when only case or spacing changes", () => {
    const current = reviseSearchPhrases([], [{ text: "Cafe Fitzroy" }]);
    const [first] = current;
    const revised = reviseSearchPhrases(current, [
      { text: "  cafe   fitzroy " },
      { text: "brunch fitzroy" },
      { text: "Brunch Fitzroy" },
      { text: "coffee collingwood" },
      { text: "espresso" },
    ]);
    expect(revised).toHaveLength(3);
    expect(revised[0]?.id).toBe(first?.id);
    expect(revised[1]?.id).not.toBe(first?.id);
    expect(revised.map((phrase) => phrase.text)).toStrictEqual([
      "cafe   fitzroy",
      "brunch fitzroy",
      "coffee collingwood",
    ]);
  });

  it("gives an edited phrase a new id", () => {
    const current = reviseSearchPhrases([], [{ text: "cafe fitzroy" }]);
    const revised = reviseSearchPhrases(current, [{ text: "cafe carlton" }]);
    expect(revised[0]?.id).not.toBe(current[0]?.id);
  });

  it("starts the period one scan interval before the next scan", () => {
    expect(researchPeriodStart("2026-10-31T00:00:00.000Z")).toBe(
      "2026-10-01T00:00:00.000Z"
    );
  });
});

describe("spend decisions", () => {
  const base = {
    capUsdMicros: 750_000,
    ceilingUsdMicros: 50_000_000,
    estimateUsdMicros: 20_000,
    monthSpentUsdMicros: 0,
    spentUsdMicros: 0,
  };

  it("allows a call inside the cap and the ceiling", () => {
    expect(decideSpend(base)).toStrictEqual({ ok: true });
  });

  it("refuses a call that would pass the business cap", () => {
    expect(decideSpend({ ...base, spentUsdMicros: 740_000 })).toStrictEqual({
      ok: false,
      reason: "allowance",
    });
  });

  it("checks the global ceiling first", () => {
    expect(
      decideSpend({
        ...base,
        monthSpentUsdMicros: 49_990_000,
        spentUsdMicros: 740_000,
      })
    ).toStrictEqual({ ok: false, reason: "ceiling" });
  });

  it("only lets an active monthly report spend", () => {
    expect(
      entitlementAllowsResearch([{ kind: "report_monthly", status: "active" }])
    ).toBeTruthy();
    expect(
      entitlementAllowsResearch([
        { kind: "report_monthly", status: "revoked" },
        { kind: "report_once", status: "active" },
      ])
    ).toBeFalsy();
  });
});
