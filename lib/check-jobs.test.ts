import { describe, expect, it } from "vitest";

import { jobForCheck, knownCheckJobIds } from "@/lib/check-jobs";
import { CHECK_CATALOG_INDEX } from "@/lib/checks/catalog-index";

describe("check jobs", () => {
  it("has plain steps for every catalog check", () => {
    const known = new Set(knownCheckJobIds());
    const missing = CHECK_CATALOG_INDEX.filter((entry) => !known.has(entry.id));
    expect(missing.map((entry) => entry.id)).toStrictEqual([]);
  });

  it("uses the written job instead of the technical title", () => {
    const job = jobForCheck(
      "website-gbp-name-address-phone",
      "Website Consistency - NAP Matching"
    );
    expect(job.plainTitle).toBe(
      "Put the same name, address, and phone on your website"
    );
    expect(job.steps.length).toBeGreaterThan(1);
  });
});
