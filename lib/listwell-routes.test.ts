import { describe, expect, it } from "vitest";

import {
  isAccountPath,
  isBusinessReportPath,
  listwellWordmarkHref,
} from "./listwell-routes";

describe("listwell routes", () => {
  it("detects account paths", () => {
    expect(isAccountPath("/account")).toBe(true);
    expect(isAccountPath("/account/profile")).toBe(true);
    expect(isAccountPath("/chat")).toBe(false);
  });

  it("detects business report paths", () => {
    expect(isBusinessReportPath("/550e8400-e29b-41d4-a716-446655440000")).toBe(
      true
    );
    expect(isBusinessReportPath("/chat")).toBe(false);
    expect(isBusinessReportPath("/account")).toBe(false);
    expect(isBusinessReportPath("/discover")).toBe(false);
  });

  it("routes signed-in users to account from the wordmark", () => {
    expect(listwellWordmarkHref(false)).toBe("/");
    expect(listwellWordmarkHref(true)).toBe("/account");
  });
});
