import { describe, expect, it } from "vitest";

import {
  formatMsForDisplay,
  lcpBucket,
  lcpToDisplayScore,
  parsePerformanceCheckLabel,
} from "./performance-insight";

describe(parsePerformanceCheckLabel, () => {
  it("parses CrUX p75 LCP", () => {
    expect(
      parsePerformanceCheckLabel("LCP p75: 3200ms (needs improvement)")
    ).toStrictEqual({ lcpMs: 3200, timingKind: "lcp" });
  });

  it("parses PageSpeed LCP", () => {
    expect(parsePerformanceCheckLabel("LCP: 2100ms (good)")).toStrictEqual({
      lcpMs: 2100,
      timingKind: "lcp",
    });
  });

  it("parses synthetic LCP", () => {
    expect(
      parsePerformanceCheckLabel(
        "Synthetic browser load LCP: 4800ms (needs improvement). This is Listwell loading the page, not Chrome UX Report."
      )
    ).toStrictEqual({ lcpMs: 4800, timingKind: "lcp" });
  });

  it("returns none when no timing in label", () => {
    expect(
      parsePerformanceCheckLabel("No Google API key configured for CrUX API")
    ).toStrictEqual({ timingKind: "none" });
  });
});

describe("lcpBucket and score helpers", () => {
  it("classifies LCP thresholds", () => {
    expect(lcpBucket(2000)).toBe("good");
    expect(lcpBucket(3200)).toBe("needs-improvement");
    expect(lcpBucket(5000)).toBe("poor");
  });

  it("formats seconds for display", () => {
    expect(formatMsForDisplay(4200)).toBe("4.2 s");
    expect(formatMsForDisplay(800)).toBe("800 ms");
  });

  it("maps LCP to a display score band", () => {
    expect(lcpToDisplayScore(2000)).toBeGreaterThanOrEqual(90);
    expect(lcpToDisplayScore(5000)).toBeLessThan(50);
  });
});
