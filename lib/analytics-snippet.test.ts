import { describe, expect, it } from "vitest";

import { analyticsInstallSnippet } from "./analytics-snippet";

describe(analyticsInstallSnippet, () => {
  it("builds a script tag with site and key", () => {
    const snippet = analyticsInstallSnippet({
      businessId: "biz_1",
      ingestKey: "abc123def456ghi789jkl012",
      siteOrigin: "https://listwell.dev",
    });
    expect(snippet).toContain('src="https://listwell.dev/lw-analytics.js"');
    expect(snippet).toContain('data-site="biz_1"');
    expect(snippet).toContain('data-key="abc123def456ghi789jkl012"');
  });
});
