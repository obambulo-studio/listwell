import { describe, expect, it } from "vitest";

import { buildReportPdf, reportPdfFilename } from "./report-pdf";
import type { ReportPdfInput } from "./report-pdf";

const sample = (): ReportPdfInput => ({
  businessName: "Haddon (Institute)",
  checks: [
    {
      category: "Website",
      status: "Needs work",
      title: "Is mobile friendly",
    },
  ],
  needsWork: 1,
  nextActions: ["Fix Is mobile friendly."],
  overview: ["1 check did not pass."],
  passing: 2,
  score: 66,
  skipped: 0,
});

describe("report pdf", () => {
  it("builds a PDF that names the business", () => {
    const text = new TextDecoder().decode(buildReportPdf(sample()));
    expect(text.startsWith("%PDF-1.4\n")).toBeTruthy();
    expect(text).toContain("Haddon \\(Institute\\)");
    expect(text).toContain("66% visibility");
    expect(text).toContain("%%EOF");
  });

  it("points startxref at the xref table", () => {
    const text = new TextDecoder().decode(buildReportPdf(sample()));
    const start = text.match(/startxref\n(?<offset>\d+)/u)?.groups?.offset;
    expect(start).toBeDefined();
    expect(text.slice(Number(start), Number(start) + 4)).toBe("xref");
  });

  it("names the download from the business", () => {
    expect(reportPdfFilename("Haddon Institute")).toBe(
      "haddon-institute-visibility-report.pdf"
    );
    expect(reportPdfFilename("   ")).toBe("report-visibility-report.pdf");
  });
});
