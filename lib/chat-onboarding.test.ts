import { describe, expect, it } from "vitest";

import {
  buildBasicReportStats,
  resolveListingLookupNext,
  scorePercent,
  visibilityCounts,
} from "./chat-onboarding";
import type { PlaceCandidate } from "./discover";

const sampleCandidate = (id: string): PlaceCandidate => ({
  id,
  name: "Joe's Pizza",
  source: "google",
});

describe(resolveListingLookupNext, () => {
  it("asks for location when name-only lookup returns too many candidates", () => {
    const lookup = {
      candidates: [
        sampleCandidate("1"),
        sampleCandidate("2"),
        sampleCandidate("3"),
        sampleCandidate("4"),
      ],
      kind: "candidates" as const,
    };
    expect(resolveListingLookupNext(lookup, "name_only")).toStrictEqual({
      step: "location",
    });
  });

  it("offers up to three listings when name-only lookup is ambiguous", () => {
    const lookup = {
      candidates: [sampleCandidate("1"), sampleCandidate("2")],
      kind: "candidates" as const,
    };
    expect(resolveListingLookupNext(lookup, "name_only")).toStrictEqual({
      candidates: lookup.candidates,
      step: "listing",
    });
  });

  it("auto-picks a confident strong match without showing the picker", () => {
    const winner = sampleCandidate("win");
    const lookup = {
      candidates: [winner, sampleCandidate("2"), sampleCandidate("3")],
      kind: "candidates" as const,
      strongMatchId: "win",
    };
    expect(resolveListingLookupNext(lookup, "name_only")).toStrictEqual({
      candidate: winner,
      step: "auto_pick",
    });
  });

  it("asks for a website when location still leaves too many candidates", () => {
    const lookup = {
      candidates: [
        sampleCandidate("1"),
        sampleCandidate("2"),
        sampleCandidate("3"),
        sampleCandidate("4"),
      ],
      kind: "candidates" as const,
    };
    expect(resolveListingLookupNext(lookup, "with_location")).toStrictEqual({
      reason: "too_many",
      step: "website",
    });
  });

  it("asks for location when name-only lookup finds nothing", () => {
    expect(
      resolveListingLookupNext(
        { kind: "skipped", reason: "empty" },
        "name_only"
      )
    ).toStrictEqual({ step: "location" });
  });
});

describe(buildBasicReportStats, () => {
  it("counts null results as skipped, not failed", () => {
    const stats = buildBasicReportStats(
      {
        "facebook-page": { value: false },
        "instagram-profile": { value: null },
        "website-title": { value: true },
      },
      {
        "facebook-page": "Facebook page",
        "instagram-profile": "Instagram profile",
        "website-title": "Website title",
      }
    );

    expect(stats).toMatchObject({
      couldNotRun: [{ title: "Instagram profile" }],
      error: 1,
      fail: 1,
      pass: 1,
      total: 3,
    });
    expect(stats.topIssues).toStrictEqual([
      { status: "fail", title: "Facebook page" },
      { status: "pass", title: "Website title" },
    ]);
  });

  it("includes check weight as a share of total points", () => {
    const stats = buildBasicReportStats(
      {
        "facebook-page": { value: true },
        "website-title": { value: true },
      },
      {
        "facebook-page": "Facebook page",
        "website-title": "Website title",
      },
      {
        "facebook-page": 3,
        "website-title": 7,
      }
    );

    expect(stats.topIssues).toStrictEqual([
      { status: "pass", title: "Website title", weightPercent: 70 },
      { status: "pass", title: "Facebook page", weightPercent: 30 },
    ]);
  });

  it("summarises channel sections as scores out of 100", () => {
    const stats = buildBasicReportStats(
      {
        "facebook-page": { value: true },
        "google-listing": { value: false },
        "website-meta": { value: false },
        "website-title": { value: true },
      },
      {
        "facebook-page": "Facebook page",
        "google-listing": "Google listing",
        "website-meta": "Meta descriptions",
        "website-title": "Website title",
      },
      {
        "facebook-page": 4,
        "google-listing": 10,
        "website-meta": 5,
        "website-title": 5,
      },
      [
        { channelCategory: "Website", id: "website-title" },
        { channelCategory: "Website", id: "website-meta" },
        { channelCategory: "Google Business Profile", id: "google-listing" },
        { channelCategory: "Social Media", id: "facebook-page" },
      ]
    );

    expect(stats.topIssues).toStrictEqual([
      { status: "fail", title: "Website", weightPercent: 50 },
      { status: "fail", title: "Google Business", weightPercent: 0 },
      { status: "pass", title: "Social Media", weightPercent: 100 },
    ]);
  });

  it("omits skipped checks and prefers failing titles in the highlight list", () => {
    const stats = buildBasicReportStats(
      {
        "apple-listing": { value: true },
        "facebook-page": { value: false },
        "google-listing": { value: false },
        hours: { value: false },
        "instagram-profile": { value: null },
        "website-title": { value: true },
      },
      {
        "apple-listing": "Apple Maps listing",
        "facebook-page": "Has a Facebook page",
        "google-listing": "Google Business Profile Listing",
        hours: "Opening hours",
        "instagram-profile": "Has an Instagram profile",
        "website-title": "Website title",
      }
    );

    expect(stats.topIssues).toStrictEqual([
      { status: "fail", title: "Has a Facebook page" },
      { status: "fail", title: "Google Business Profile Listing" },
      { status: "fail", title: "Opening hours" },
      { status: "pass", title: "Website title" },
    ]);
  });
});

describe(visibilityCounts, () => {
  it("counts pass, fail, and error and ignores waiting rows", () => {
    expect(
      visibilityCounts([
        { status: "pass" },
        { status: "fail" },
        { status: "error" },
        { status: "pending" },
        { status: "queued" },
        { status: "idle" },
      ])
    ).toStrictEqual({ error: 1, fail: 1, pass: 1 });
  });
});

describe(scorePercent, () => {
  it("excludes skipped checks from the visibility score", () => {
    expect(scorePercent({ fail: 2, pass: 8 })).toBe(80);
  });

  it("returns zero when no checks ran to a pass or fail outcome", () => {
    expect(scorePercent({ fail: 0, pass: 0 })).toBe(0);
  });
});
