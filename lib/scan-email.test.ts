import { describe, expect, it } from "vitest";

import { emailAccent, emailOnAccent } from "../emails/shell";
import {
  buildScanEmail,
  formatVisibilityScoreTrendPlain,
  newlyBrokenChecks,
  pickScanEmailKind,
  scoreDelta,
  visibilityScoreTrend,
  visibilityScoreTrendLine,
} from "./scan-email";
import { hintFromCheckBody } from "./scan-email-hints";
import { mergePendingScanEmails } from "./scheduled-scan-notify";

const UNSUB = "https://listwell.dev/api/notifications/unsubscribe?token=sample";
const SITE = "https://listwell.dev";

describe("scan email helpers", () => {
  it("extracts plain-English hints from check copy", () => {
    const definition = hintFromCheckBody(
      "## What we're checking\n\nWe look for complete opening and closing times for each day of the week in your Google Business Profile.\n\n## How can I fix it?"
    );
    expect(definition).toContain("opening and closing times");
  });

  it("formats visibility score trend vs the prior scan", () => {
    const down = visibilityScoreTrend(58, 63);
    if (!down) {
      throw new Error("expected down trend");
    }
    expect({
      downPlain: formatVisibilityScoreTrendPlain(down),
      noScore: visibilityScoreTrendLine(null, 60),
      sameNoPrior: visibilityScoreTrendLine(72, null),
      sameScore: visibilityScoreTrendLine(70, 70),
      up: visibilityScoreTrend(72, 69),
      upPlain: visibilityScoreTrendLine(72, 69),
    }).toStrictEqual({
      downPlain: "\u2193 Down 5 points from last month.",
      noScore: null,
      sameNoPrior: null,
      sameScore: "\u2192 Same as last month.",
      up: {
        arrow: "\u2191",
        direction: "up",
        label: "Up 3 points from last month.",
      },
      upPlain: "\u2191 Up 3 points from last month.",
    });
  });

  it("detects score drop and newly failing checks", () => {
    const previous = {
      results: {
        "google-listing-opening-times": { value: true },
        website: { value: true },
      },
      score: 80,
    };
    const current = {
      results: {
        "google-listing-opening-times": { value: false },
        website: { value: true },
      },
      score: 65,
    };
    expect(scoreDelta(previous, current)).toBe(-15);
    expect(newlyBrokenChecks(previous, current)).toContain(
      "google-listing-opening-times"
    );
    expect(pickScanEmailKind(previous, current)).toBe("score_alert");
  });

  it("builds a scan-ready email with stacked rows and basic scan info", () => {
    const email = buildScanEmail({
      businesses: [
        {
          businessId: "harbour-cafe",
          businessName: "Harbour Cafe",
          finishedAt: "2026-10-01T00:00:00.000Z",
          previousScore: 69,
          score: 72,
        },
      ],
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    });
    expect({
      buttonUsesAccentInkText: email.html.includes(`color:${emailOnAccent}`),
      buttonUsesBabyBlueBackground: email.html.includes(
        `background-color:${emailAccent}`
      ),
      hasButton: email.html.includes("View Harbour Cafe"),
      hasHeadlineMonth: email.html.includes("October scan ready"),
      hasProfileUrl: email.html.includes(`${SITE}/harbour-cafe`),
      hasScannedDate: email.text.includes("Scanned"),
      hasScore: email.html.includes("Visibility score: 72%"),
      hasTrendArrow: email.html.includes("\u2191"),
      hasTrendLabel: email.html.includes("Up 3 points from last month."),
      subject: email.subject,
      textHasPrefs: email.text.includes("Email preferences"),
      textHasTrendArrow: email.text.includes(
        "\u2191 Up 3 points from last month."
      ),
    }).toStrictEqual({
      buttonUsesAccentInkText: true,
      buttonUsesBabyBlueBackground: true,
      hasButton: true,
      hasHeadlineMonth: true,
      hasProfileUrl: true,
      hasScannedDate: false,
      hasScore: true,
      hasTrendArrow: true,
      hasTrendLabel: true,
      subject: "Listwell · October scan for Harbour Cafe",
      textHasPrefs: true,
      textHasTrendArrow: true,
    });
  });

  it("combines multiple businesses for the same recipient", () => {
    const merged = mergePendingScanEmails([
      {
        businesses: [
          {
            businessId: "harbour-cafe",
            businessName: "Harbour Cafe",
            finishedAt: "2026-10-01T00:00:00.000Z",
            previousScore: null,
            score: 72,
          },
        ],
        listUnsubscribeUrl: UNSUB,
        siteUrl: SITE,
        to: "owner@example.com",
        unsubscribeUrl: UNSUB,
      },
      {
        businesses: [
          {
            businessId: "bean-bar",
            businessName: "Bean Bar",
            finishedAt: "2026-10-01T00:00:00.000Z",
            previousScore: null,
            score: 58,
          },
        ],
        listUnsubscribeUrl: UNSUB,
        siteUrl: SITE,
        to: "owner@example.com",
        unsubscribeUrl: UNSUB,
      },
    ]);
    expect(merged).toHaveLength(1);
    const email = buildScanEmail({
      businesses: merged[0]?.businesses ?? [],
      siteUrl: SITE,
      unsubscribeUrl: UNSUB,
    });
    expect(email.subject).toBe("Listwell · October scans, 2 businesses");
    expect(email.html).toContain("View Harbour Cafe");
    expect(email.html).toContain("View Bean Bar");
    expect(email.html).toContain("Visibility score: 58%");
  });

  it("keeps the latest scan when merging duplicate businesses", () => {
    const merged = mergePendingScanEmails([
      {
        businesses: [
          {
            businessId: "harbour-cafe",
            businessName: "Harbour Cafe",
            finishedAt: "2026-09-01T00:00:00.000Z",
            previousScore: null,
            score: 60,
          },
        ],
        listUnsubscribeUrl: UNSUB,
        siteUrl: SITE,
        to: "owner@example.com",
        unsubscribeUrl: UNSUB,
      },
      {
        businesses: [
          {
            businessId: "harbour-cafe",
            businessName: "Harbour Cafe",
            finishedAt: "2026-10-01T00:00:00.000Z",
            previousScore: 60,
            score: 72,
          },
        ],
        listUnsubscribeUrl: UNSUB,
        siteUrl: SITE,
        to: "owner@example.com",
        unsubscribeUrl: UNSUB,
      },
    ]);
    expect(merged[0]?.businesses[0]?.score).toBe(72);
  });

  it("uses the stronger alert when research visibility drops without a score drop", () => {
    const research = {
      competitorNames: { bean: "Bean Bar" },
      current: {
        competitors: {
          bean: { gridTop3Count: { cafe: 6 }, reviewCount: 40 },
        },
        gridTop3Count: { pin_1: { cafe: 0 } },
        organicPosition: { cafe: 8 },
        reviewCount: 12,
      },
      phraseLabels: { cafe: "cafe Newtown" },
      previous: {
        competitors: {
          bean: { gridTop3Count: { cafe: 2 }, reviewCount: 26 },
        },
        gridTop3Count: { pin_1: { cafe: 4 } },
        organicPosition: { cafe: 3 },
        reviewCount: 9,
      },
    };
    expect(
      pickScanEmailKind(
        { results: { website: { value: true } }, score: 70 },
        { results: { website: { value: true } }, score: 72 },
        research
      )
    ).toBe("score_alert");
  });
});
