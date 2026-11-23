import { describe, expect, it } from "vitest";

import { accountBackgroundScanDrive } from "./account-background-scan";
import type { AccountBackgroundScanInput } from "./account-background-scan";

const baseInput = (): AccountBackgroundScanInput => ({
  businessId: null,
  candidateCount: 0,
  isTyping: false,
  phase: "business_name",
  reportReady: false,
  showTryAgain: false,
});

describe(accountBackgroundScanDrive, () => {
  it("opens chat instead of dropping the row when a listing choice is required", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        candidateCount: 3,
        phase: "listing",
      })
    ).toBe("handoff-chat");
  });

  it("opens chat instead of dropping the row when suburb or city is required", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        phase: "location",
      })
    ).toBe("handoff-chat");
  });

  it("keeps a finished check on the account", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        businessId: "biz-1",
        phase: "report",
        reportReady: true,
      })
    ).toBe("complete");
  });

  it("still skips the website question when the check can finish on the account page", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        phase: "website",
      })
    ).toBe("skip-website");
  });

  it("opens chat when the category still has to be chosen", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        phase: "category",
      })
    ).toBe("handoff-chat");
  });

  it("waits while the lookup is still typing", () => {
    expect(
      accountBackgroundScanDrive({
        ...baseInput(),
        isTyping: true,
        phase: "location",
      })
    ).toBe("wait");
  });
});
