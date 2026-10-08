import { describe, expect, it } from "vitest";

import {
  isAccountPath,
  isBusinessReportPath,
  listwellWordmarkHref,
} from "./listwell-routes";

describe("listwell routes", () => {
  it("detects account paths", () => {
    expect(isAccountPath("/account")).toBeTruthy();
    expect(isAccountPath("/account/profile")).toBeTruthy();
    expect(isAccountPath("/account/mcp")).toBeTruthy();
    expect(isAccountPath("/chat")).toBeFalsy();
  });

  it("detects business report paths", () => {
    expect(
      isBusinessReportPath("/550e8400-e29b-41d4-a716-446655440000")
    ).toBeTruthy();
    expect(isBusinessReportPath("/chat")).toBeFalsy();
    expect(isBusinessReportPath("/account")).toBeFalsy();
    expect(isBusinessReportPath("/discover")).toBeFalsy();
  });

  it("routes signed-in users to account from the wordmark", () => {
    expect(listwellWordmarkHref(false)).toBe("/");
    expect(listwellWordmarkHref(true)).toBe("/account");
  });
});
