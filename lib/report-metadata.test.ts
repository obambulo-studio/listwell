import { describe, expect, it, vi } from "vitest";

import type { LoadBusinessName } from "./report-metadata";
import { reportRouteMetadata } from "./report-metadata";

const titles = {
  found: (name: string) => `${name} report`,
  missing: "Report",
};

describe(reportRouteMetadata, () => {
  it("returns fallback metadata for a probe id without loading or throwing", async () => {
    const loadBusiness = vi.fn<LoadBusinessName>(() => Promise.resolve(null));
    await expect(
      reportRouteMetadata("xmlrpc.php", loadBusiness, titles)
    ).resolves.toStrictEqual({
      robots: { follow: false, index: false },
      title: "Report not found",
    });
    expect(loadBusiness).not.toHaveBeenCalled();
  });

  it("uses the business name for a valid id", async () => {
    const loadBusiness = vi.fn<LoadBusinessName>(() =>
      Promise.resolve({ name: "Bean There" })
    );
    await expect(
      reportRouteMetadata(
        "3f2b8c1e-7a4d-4e6b-9c0a-1d2e3f4a5b6c",
        loadBusiness,
        titles
      )
    ).resolves.toStrictEqual({ title: "Bean There report" });
    expect(loadBusiness).toHaveBeenCalledWith(
      "3f2b8c1e-7a4d-4e6b-9c0a-1d2e3f4a5b6c"
    );
  });

  it("uses the missing title when a valid id has no business", async () => {
    await expect(
      reportRouteMetadata("unknown-id", () => Promise.resolve(null), titles)
    ).resolves.toStrictEqual({ title: "Report" });
  });
});
