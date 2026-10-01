import { describe, expect, it } from "vitest";

import {
  aiOverviewCopy,
  citationCount,
  livelinePoints,
  metricDelta,
  phraseCellCount,
  pickNextFix,
  positionChangeSentence,
  positionPoints,
} from "./research-report";

const august = "2026-08-01T00:00:00.000Z";
const september = "2026-09-01T00:00:00.000Z";

describe(pickNextFix, () => {
  it("picks one check, preferring one that at least two competitors pass", () => {
    const choice = pickNextFix([
      {
        id: "website",
        peerValues: [true, false, null],
        subjectValue: false,
        title: "Website",
      },
      {
        id: "google-listing-photo-gallery",
        peerValues: [true, true, false],
        subjectValue: false,
        title: "Photo gallery",
      },
      {
        id: "google-listing-opening-times",
        peerValues: [true, true, true],
        subjectValue: false,
        title: "Opening hours",
      },
    ]);

    expect(choice).toStrictEqual({
      checkId: "google-listing-photo-gallery",
      competitorCount: 3,
      competitorPassCount: 2,
      title: "Photo gallery",
    });
  });
});

describe(aiOverviewCopy, () => {
  it("uses different copy when Google showed no overview and when it did not cite you", () => {
    expect(aiOverviewCopy("none")).toBe(
      "Google showed no AI Overview for this search"
    );
    expect(aiOverviewCopy("not_cited")).toBe(
      "The AI Overview did not cite you"
    );
    expect(aiOverviewCopy("none")).not.toBe(aiOverviewCopy("not_cited"));
  });
});

describe("research trends", () => {
  it("plots an improved rank as a rising line", () => {
    const points = positionPoints([
      { periodStart: august, position: 8 },
      { periodStart: september, position: 5 },
    ]);
    expect(points.map((point) => point.value)).toStrictEqual([-8, -5]);
    expect(positionChangeSentence(8, 5)).toBe("3 places higher");
  });

  it("omits a missing metric and does not plot a skipped month as zero", () => {
    const withGap = livelinePoints([
      { periodStart: august, value: 4 },
      { periodStart: september },
      { periodStart: "2026-10-01T00:00:00.000Z", value: 6 },
    ]);
    expect(withGap.map((point) => point.value)).toStrictEqual([4, 6]);
    expect(withGap.some((point) => point.value === 0)).toBeFalsy();
    expect(metricDelta([{ periodStart: august, value: 12 }])).toBeNull();
    expect(phraseCellCount({}, "phrase_cafe")).toBeUndefined();
    expect(citationCount()).toBeUndefined();
  });
});
