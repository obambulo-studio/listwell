import { describe, expect, it } from "vitest";

import {
  generateReportShareToken,
  resolveShareExpiresAt,
} from "./report-share";
import { reportShareRecordSchema } from "./schema";

describe(generateReportShareToken, () => {
  it("returns URL-safe tokens with enough entropy", () => {
    const token = generateReportShareToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[\w-]+$/u);
    expect(generateReportShareToken()).not.toBe(token);
  });
});

describe(resolveShareExpiresAt, () => {
  it("returns null when no expiry is requested", () => {
    expect(resolveShareExpiresAt({})).toBeNull();
    expect(resolveShareExpiresAt({ expiresInDays: null })).toBeNull();
  });

  it("returns an ISO timestamp for day-based expiry", () => {
    const before = Date.now();
    const expiresAt = resolveShareExpiresAt({ expiresInDays: 7 });
    const after = Date.now();
    expect(expiresAt).not.toBeNull();
    const parsed = Date.parse(expiresAt ?? "");
    expect(parsed).toBeGreaterThanOrEqual(
      before + 7 * 24 * 60 * 60 * 1000 - 1000
    );
    expect(parsed).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1000 + 1000);
  });
});

describe("report share record shape", () => {
  it("accepts revoked and expired share records", () => {
    const revoked = reportShareRecordSchema.parse({
      businessId: "biz_1",
      createdAt: new Date().toISOString(),
      expiresAt: null,
      revokedAt: new Date().toISOString(),
      token: "tok_revoked_1234567890abcdef",
    });
    expect(revoked.revokedAt).not.toBeNull();

    const expired = reportShareRecordSchema.parse({
      businessId: "biz_1",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      revokedAt: null,
      token: "tok_expired_1234567890abcdef",
    });
    expect(Date.parse(expired.expiresAt ?? "")).toBeLessThan(Date.now());
  });
});
