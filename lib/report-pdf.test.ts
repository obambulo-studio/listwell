import { describe, expect, it } from "vitest";

import { buildReportPdf, reportPdfFilename } from "./report-pdf";
import type { ReportPdfInput } from "./report-pdf";

const generatedAt = "2026-10-01T00:00:00.000Z";

const sample = (): ReportPdfInput => ({
  businessName: "Haddon (Institute)",
  checks: [
    {
      category: "Website",
      detail: "Text is smaller than 16px",
      status: "Needs work",
      title: "Is mobile friendly",
    },
    {
      category: "Website",
      status: "Pass",
      title: "Has a title",
    },
  ],
  edition: "preview",
  generatedAt,
  needsWork: 1,
  nextActions: ["Fix Is mobile friendly."],
  overview: ["1 check did not pass."],
  passing: 2,
  score: 66,
  skipped: 0,
});

const decode = (input: ReportPdfInput): string =>
  new TextDecoder().decode(buildReportPdf(input));

describe("report pdf", () => {
  it("builds a preview that names the business and the score", () => {
    const text = decode(sample());
    expect(text.startsWith("%PDF-1.4\n")).toBeTruthy();
    expect(text).toContain("Haddon \\(Institute\\)");
    expect(text).toContain("(66%) Tj");
    expect(text).toContain("( visibility) Tj");
    expect(text).toContain("%%EOF");
  });

  it("labels a preview and keeps fix steps out", () => {
    const text = decode(sample());
    expect(text).toContain("(Preview) Tj");
    expect(text).toContain("passing \\267 1 need work");
    expect(text).toContain("This preview lists check outcomes");
    expect(text).not.toContain("Fix Is mobile friendly.");
    expect(text).toContain("Text is smaller than 16px");
  });

  it("records the report date and Listwell as the author", () => {
    const text = decode(sample());
    expect(text).toContain("1 October 2026");
    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Author (Listwell)");
  });

  it("builds a full report with the next actions", () => {
    const text = decode({
      ...sample(),
      edition: "final",
      nextActionSections: [
        {
          actions: ["Fix Is mobile friendly."],
          title: "Easy, high severity",
        },
      ],
    });
    expect(text).toContain("(Full report) Tj");
    expect(text).toContain("What to do next");
    expect(text).toContain("Easy, high severity");
    expect(text).toContain("Fix Is mobile friendly.");
    expect(text).not.toContain("This preview lists check outcomes");
  });

  it("lists needs-work checks before passing checks", () => {
    const text = decode(sample());
    const needsWork = text.indexOf("Is mobile friendly");
    const passing = text.indexOf("Has a title");
    expect(needsWork).toBeGreaterThan(-1);
    expect(passing).toBeGreaterThan(needsWork);
  });

  it("paginates a long check list and numbers the pages", () => {
    const checks = Array.from({ length: 48 }, (_, index) => ({
      category: index < 24 ? "Website" : "Google",
      status: "Needs work",
      title: `Check ${index} has a reasonably long title about the listing`,
    }));
    const text = decode({
      ...sample(),
      checks,
      needsWork: checks.length,
      passing: 0,
    });
    expect(text).toMatch(/\/Count [2-9]/u);
    expect(text).toContain("(2 / ");
    expect(text).toContain("(Listwell) Tj");
  });

  it("points startxref at the xref table", () => {
    const text = decode(sample());
    const start = text.match(/startxref\n(?<offset>\d+)/u)?.groups?.offset;
    expect(start).toBeDefined();
    expect(text.slice(Number(start), Number(start) + 4)).toBe("xref");
  });

  it("names the download from the business and edition", () => {
    expect(reportPdfFilename("Haddon Institute")).toBe(
      "haddon-institute-visibility-report.pdf"
    );
    expect(reportPdfFilename("Haddon Institute", "preview")).toBe(
      "haddon-institute-visibility-preview.pdf"
    );
    expect(reportPdfFilename("   ")).toBe("report-visibility-report.pdf");
  });

  it("rejects an invalid generated date", () => {
    expect(() => decode({ ...sample(), generatedAt: "not-a-date" })).toThrow(
      "Invalid report date"
    );
  });
});
