import { describe, expect, it } from "vitest";

import {
  RUNNING_CLAIM_WINDOW_MS,
  SCAN_REUSE_WINDOW_MS,
  scanFingerprint,
  selectReusableSnapshot,
} from "./scan-freshness";
import type { SnapshotClock } from "./scan-freshness";

const at = (offsetMs: number): string => new Date(offsetMs).toISOString();

const row = (
  status: SnapshotClock["status"],
  startedOffset: number,
  finishedOffset: number | null
): SnapshotClock => ({
  finishedAt: finishedOffset === null ? null : at(finishedOffset),
  startedAt: at(startedOffset),
  status,
});

describe(scanFingerprint, () => {
  it("uses the first Google place id and ignores the website", () => {
    expect(
      scanFingerprint({
        locations: [
          { googlePlaceId: "  " },
          { googlePlaceId: "places/ChIJExample" },
        ],
        websiteUrl: "https://www.example.com.au/",
      })
    ).toBe("place:ChIJExample");
  });

  it("normalises a website when there is no place id", () => {
    const fromUrl = scanFingerprint({
      locations: [],
      websiteUrl: "HTTPS://WWW.Example.com.au/menu/?ref=ad",
    });
    const fromHost = scanFingerprint({
      locations: [{ googlePlaceId: null }],
      websiteUrl: "example.com.au/menu/",
    });

    expect(fromUrl).toBe("site:example.com.au/menu");
    expect(fromHost).toBe(fromUrl);
  });

  it("does not share an audit with no place and no website", () => {
    expect(
      scanFingerprint({
        locations: [{ googlePlaceId: "" }],
        websiteUrl: "not a url",
      })
    ).toBeNull();
  });
});

describe(selectReusableSnapshot, () => {
  const now = SCAN_REUSE_WINDOW_MS * 2;

  it("reuses a complete snapshot finished less than an hour ago", () => {
    const fresh = row("complete", now - 30 * 60 * 1000, now - 20 * 60 * 1000);
    expect(
      selectReusableSnapshot({
        forceFresh: false,
        now,
        rows: [fresh],
      })
    ).toBe(fresh);
  });

  it("does not reuse a snapshot finished an hour ago or more", () => {
    const stale = row(
      "complete",
      now - SCAN_REUSE_WINDOW_MS - 60_000,
      now - SCAN_REUSE_WINDOW_MS
    );
    expect(
      selectReusableSnapshot({
        forceFresh: false,
        now,
        rows: [stale],
      })
    ).toBeNull();
  });

  it("ignores a fresh snapshot when forceFresh is set", () => {
    const fresh = row("complete", now - 10_000, now - 1000);
    expect(
      selectReusableSnapshot({
        forceFresh: true,
        now,
        rows: [fresh],
      })
    ).toBeNull();
  });

  it("does not reuse an error, and reuses a run that is still in progress", () => {
    const failed = row("error", now - 1000, now - 500);
    const running = row("running", now - 30_000, null);
    expect(
      selectReusableSnapshot({
        forceFresh: false,
        now,
        rows: [failed, running],
      })
    ).toBe(running);
  });

  it("replaces a running claim that has been stuck for a few minutes", () => {
    const stuck = row("running", now - RUNNING_CLAIM_WINDOW_MS, null);
    expect(
      selectReusableSnapshot({
        forceFresh: false,
        now,
        rows: [stuck],
      })
    ).toBeNull();
  });

  it("keeps a finished snapshot when a newer run has not completed", () => {
    const finished = row("complete", now - 50_000, now - 40_000);
    const running = row("running", now - 5000, null);
    expect(
      selectReusableSnapshot({
        forceFresh: false,
        now,
        rows: [running, finished],
      })
    ).toBe(finished);
  });
});
