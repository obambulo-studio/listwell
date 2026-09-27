import { describe, expect, it } from "vitest";

import {
  createSiteGateCookieValue,
  isSiteGateExemptPath,
  verifySiteGateCookieValue,
} from "./site-gate";

describe("site gate paths", () => {
  it("exempts health, robots, sitemap, and gate page", () => {
    expect(isSiteGateExemptPath("/api/health")).toBeTruthy();
    expect(isSiteGateExemptPath("/robots.txt")).toBeTruthy();
    expect(isSiteGateExemptPath("/sitemap.xml")).toBeTruthy();
    expect(isSiteGateExemptPath("/gate")).toBeTruthy();
  });

  it("exempts auth, webhooks, and gate APIs", () => {
    expect(isSiteGateExemptPath("/api/auth/sign-in")).toBeTruthy();
    expect(isSiteGateExemptPath("/api/webhook/polar")).toBeTruthy();
    expect(isSiteGateExemptPath("/api/site-gate/unlock")).toBeTruthy();
    expect(isSiteGateExemptPath("/.well-known/ai-catalog.json")).toBeTruthy();
  });

  it("does not exempt product pages or discover API", () => {
    expect(isSiteGateExemptPath("/")).toBeFalsy();
    expect(isSiteGateExemptPath("/discover")).toBeFalsy();
    expect(isSiteGateExemptPath("/api/discover")).toBeFalsy();
  });

  it("exempts shared report pages", () => {
    expect(
      isSiteGateExemptPath("/share/abc123def456ghi789jkl012mno345pqr678")
    ).toBeTruthy();
  });
});

describe("site gate cookie", () => {
  it("creates and verifies a signed cookie value", async () => {
    const password = "test-site-password";
    const value = await createSiteGateCookieValue(password);
    expect(value).toMatch(/^[0-9a-f]{64}$/u);
    await expect(
      verifySiteGateCookieValue(value, password)
    ).resolves.toBeTruthy();
    await expect(
      verifySiteGateCookieValue(`${value.slice(0, -1)}0`, password)
    ).resolves.toBeFalsy();
  });
});
