import { describe, expect, it } from "vitest";

import type { PlannedFixGroup } from "./fix-plan";
import { reportPdfPayload } from "./report-pdf-payload";

const fixPlan = [
  {
    bands: [
      {
        actions: [
          {
            action: {
              checkIds: ["website-title"],
              priority: 1,
              text: "Fix the page title.",
            },
            difficulty: "easy",
            minutes: 15,
            points: 6,
            rank: 1,
            severity: "high",
          },
        ],
        severity: "high",
      },
    ],
    difficulty: "easy",
  },
] satisfies PlannedFixGroup[];

describe(reportPdfPayload, () => {
  it("builds a full report with fix steps", () => {
    const payload = reportPdfPayload({
      businessName: "Harbour Cafe",
      checks: [
        {
          category: "Website",
          label: "Fail",
          status: "fail",
          title: "Page title",
        },
        {
          category: "Website",
          label: "Missing H1",
          status: "fail",
          title: "Heading",
        },
      ],
      counts: { error: 0, fail: 2, pass: 0 },
      fixPlan,
      generatedAt: "2026-10-02T00:00:00.000Z",
      overview: [{ text: "Two checks need work." }],
      showFixSteps: true,
      visibilityScore: 0,
    });

    expect({
      detail: payload.checks[1]?.detail,
      edition: payload.edition,
      overview: payload.overview,
      section: payload.nextActionSections?.[0],
      status: payload.checks[0]?.status,
      suppressedDetail: payload.checks[0]?.detail,
    }).toStrictEqual({
      detail: "Missing H1",
      edition: "final",
      overview: ["Two checks need work."],
      section: {
        actions: ["Fix the page title."],
        title: "Easy, high severity",
      },
      status: "Needs work",
      suppressedDetail: undefined,
    });
  });

  it("omits fix steps on a preview", () => {
    const payload = reportPdfPayload({
      businessName: "Harbour Cafe",
      checks: [
        {
          category: "Website",
          label: "Still running",
          status: "queued",
          title: "Page title",
        },
      ],
      counts: { error: 0, fail: 0, pass: 0 },
      fixPlan,
      generatedAt: "2026-10-02T00:00:00.000Z",
      overview: [],
      showFixSteps: false,
      visibilityScore: 0,
    });

    expect({
      detail: payload.checks[0]?.detail,
      edition: payload.edition,
      sections: payload.nextActionSections,
      status: payload.checks[0]?.status,
    }).toStrictEqual({
      detail: undefined,
      edition: "preview",
      sections: [],
      status: "Waiting",
    });
  });
});
