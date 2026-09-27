import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildScanEmail,
  newlyBrokenChecks,
  pickScanEmailKind,
  scoreDelta,
} from "./scan-email";

describe("scan email helpers", () => {
  it("detects score drop and newly failing checks", () => {
    const previous = {
      results: {
        "google-hours": { value: true },
        website: { value: true },
      },
      score: 80,
    };
    const current = {
      results: {
        "google-hours": { value: false },
        website: { value: true },
      },
      score: 65,
    };
    expect(scoreDelta(previous, current)).toBe(-15);
    expect(newlyBrokenChecks(previous, current)).toContain("google-hours");
    expect(pickScanEmailKind(previous, current)).toBe("score_alert");
  });

  it("builds monthly summary copy", () => {
    const email = buildScanEmail({
      businessName: "Harbour Cafe",
      current: { results: { website: { value: true } }, score: 72 },
      previous: { results: { website: { value: true } }, score: 70 },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl:
        "https://listwell.dev/api/notifications/unsubscribe?token=abc",
    });
    expect(email.kind).toBe("monthly_summary");
    expect(email.subject).toContain("Harbour Cafe");
    expect(email.text).toContain("up 2 points");
    expect(email.html).toContain("Harbour Cafe");
  });

  it("writes a sample alert email artifact", () => {
    const email = buildScanEmail({
      businessName: "Harbour Cafe",
      current: {
        results: {
          "google-hours": { value: false },
          website: { value: false },
        },
        score: 58,
      },
      previous: {
        results: {
          "google-hours": { value: true },
          website: { value: true },
        },
        score: 72,
      },
      reportUrl: "https://listwell.dev/demo-cafe",
      unsubscribeUrl:
        "https://listwell.dev/api/notifications/unsubscribe?token=sample",
    });
    expect(email.kind).toBe("score_alert");
    const summaryHtml = buildScanEmail({
      businessName: "Harbour Cafe",
      current: { results: { website: { value: true } }, score: 72 },
      previous: { results: { website: { value: true } }, score: 70 },
      reportUrl: "https://listwell.dev/demo-cafe",
    }).html;
    for (const artifactDir of [
      "/opt/cursor/artifacts",
      path.join(process.cwd(), "artifacts"),
    ]) {
      try {
        writeFileSync(
          path.join(artifactDir, "monthly-scan-alert-sample.html"),
          email.html,
          "utf-8"
        );
        writeFileSync(
          path.join(artifactDir, "monthly-scan-summary-sample.html"),
          summaryHtml,
          "utf-8"
        );
        break;
      } catch {
        // Try next directory.
      }
    }
  });
});
