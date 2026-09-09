import { describe, expect, it } from "vitest";

import {
  buildBasicReportStats,
  scorePercent,
  visibilityCounts,
} from "./chat-onboarding";

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
