import { writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildScanEmail,
  newlyBrokenChecks,
  pickScanEmailKind,
  scoreDelta,
} from "./scan-email";
import { hintFromCheckBody } from "./scan-email-hints";

const UNSUB = "https://listwell.dev/api/notifications/unsubscribe?token=sample";

describe("scan email helpers", () => {
  it("extracts plain-English hints from check copy", () => {
    const definition = hintFromCheckBody(
      "## What we're checking\n\nWe look for complete opening and closing times for each day of the week in your Google Business Profile.\n\n## How can I fix it?"
    );
    expect(definition).toContain("opening and closing times");
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

  it("builds monthly summary with preferences link and top fixes", () => {
    const email = buildScanEmail({
      businessCategory: "food",
      businessName: "Harbour Cafe",
      current: {
        results: {
          "google-listing-opening-times": { value: false },
          website: { value: true },
        },
        score: 72,
      },
      previous: {
        results: {
          "google-listing-opening-times": { value: false },
          website: { value: true },
        },
        score: 70,
      },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl: UNSUB,
    });
    expect({
      htmlExcludesRawId: !email.html.includes("google-listing-opening-times"),
      htmlIncludes: [
        "Google Business Profile - Opening Hours",
        UNSUB,
        "Email preferences",
      ].every((needle) => email.html.includes(needle)),
      kind: email.kind,
      listUnsubscribeUrl: email.listUnsubscribeUrl,
      subjectHasCafe: email.subject.includes("Harbour Cafe"),
      textHasPrefs: email.text.includes("Email preferences"),
    }).toStrictEqual({
      htmlExcludesRawId: true,
      htmlIncludes: true,
      kind: "monthly_summary",
      listUnsubscribeUrl: UNSUB,
      subjectHasCafe: true,
      textHasPrefs: true,
    });
  });

  it("builds alert with human titles and hints", () => {
    const email = buildScanEmail({
      businessCategory: "food",
      businessName: "Harbour Cafe",
      current: {
        results: {
          "google-listing-opening-times": { value: false },
          website: { value: false },
        },
        score: 58,
      },
      previous: {
        results: {
          "google-listing-opening-times": { value: true },
          website: { value: true },
        },
        score: 72,
      },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl: UNSUB,
    });
    expect(email.kind).toBe("score_alert");
    expect(email.html).toContain("Google Business Profile - Opening Hours");
    expect(email.text).toContain("Email preferences");
  });

  it("writes sample HTML artifacts", () => {
    const alert = buildScanEmail({
      businessCategory: "food",
      businessName: "Harbour Cafe",
      current: {
        results: {
          "google-listing-opening-times": { value: false },
          website: { value: false },
        },
        score: 58,
      },
      previous: {
        results: {
          "google-listing-opening-times": { value: true },
          website: { value: true },
        },
        score: 72,
      },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl: UNSUB,
    });
    const summary = buildScanEmail({
      businessCategory: "food",
      businessName: "Harbour Cafe",
      current: {
        results: { website: { value: true } },
        score: 72,
      },
      previous: {
        results: { website: { value: true } },
        score: 70,
      },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl: UNSUB,
    });
    let wrote = false;
    for (const artifactDir of [
      "/opt/cursor/artifacts",
      path.join(process.cwd(), "artifacts"),
    ]) {
      try {
        writeFileSync(
          path.join(artifactDir, "monthly-scan-alert-sample.html"),
          alert.html,
          "utf-8"
        );
        writeFileSync(
          path.join(artifactDir, "monthly-scan-summary-sample.html"),
          summary.html,
          "utf-8"
        );
        wrote = true;
        break;
      } catch {
        // Try next directory.
      }
    }
    expect(alert.html).toContain("Listwell");
    expect(summary.html).toContain("Email preferences");
    expect(wrote).toBeTruthy();
  });
});
