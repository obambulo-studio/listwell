import { describe, expect, it } from "vitest";

import {
  accountReportMeta,
  accountScoreDelta,
  accountScoreDeltaAriaLabel,
  formatAccountScanDate,
  formatAccountScoreDelta,
} from "./account-report";

describe("account report helpers", () => {
  it("formats last scanned meta from finishedAt", () => {
    expect(
      accountReportMeta({
        lastScan: { finishedAt: "2026-10-01T00:00:00.000Z" },
      })
    ).toBe("Last scanned 1 Oct 2026");
    expect(accountReportMeta({ lastScan: null })).toBeNull();
    expect(
      accountReportMeta({ lastScan: { finishedAt: "not-a-date" } })
    ).toBeNull();
  });

  it("formats en-AU scan dates", () => {
    expect(formatAccountScanDate("2026-10-01T00:00:00.000Z")).toBe(
      "1 Oct 2026"
    );
  });

  it("derives score delta vs previous scan", () => {
    expect(accountScoreDelta(67, 63)).toStrictEqual({
      direction: "up",
      points: 4,
    });
    expect(accountScoreDelta(58, 63)).toStrictEqual({
      direction: "down",
      points: 5,
    });
    expect(accountScoreDelta(70, 70)).toStrictEqual({
      direction: "same",
      points: 0,
    });
    expect(accountScoreDelta(70, null)).toBeNull();
  });

  it("renders compact delta glyphs and aria labels", () => {
    const up = accountScoreDelta(72, 69);
    if (!up) {
      throw new Error("expected up delta");
    }
    expect(formatAccountScoreDelta(up)).toBe("\u21913");
    expect(accountScoreDeltaAriaLabel(up)).toBe(
      "Up 3 points from previous scan."
    );
    const same = accountScoreDelta(70, 70);
    if (!same) {
      throw new Error("expected same delta");
    }
    expect(formatAccountScoreDelta(same)).toBe("\u2192");
  });
});
