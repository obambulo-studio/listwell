import { describe, expect, it } from "vitest";

import { checkDefinitionSchema } from "./checks/types";
import { planNextActions } from "./fix-plan";
import {
  buildReportAiInstructionsMarkdown,
  reportAiInstructionsFilename,
  reportAiInstructionsHasContent,
} from "./report-ai-instructions";
import type { NextAction } from "./summaries";

const definition = (id: string, body: string, points: number) =>
  checkDefinitionSchema.parse({
    body,
    businessCategories: null,
    channelCategory: "Website",
    id,
    points: { food: points, other: points, retail: points, services: points },
    title: `Title for ${id}`,
  });

const estimate = (minutes: number, difficulty: string): string =>
  `## How can I fix it?\n\nDo the work.\n\n*About ${minutes} minutes. Difficulty: ${difficulty}.*\n`;

const action = (id: string, priority: number): NextAction => ({
  checkIds: [id],
  priority,
  text: `Fix ${id}.`,
});

describe(buildReportAiInstructionsMarkdown, () => {
  it("includes ranked fix steps and listing review sections", () => {
    const definitions = [definition("listing", estimate(30, "easy"), 10)];
    const fixPlan = planNextActions({
      actions: [action("listing", 1)],
      category: "services",
      definitions,
    });
    const markdown = buildReportAiInstructionsMarkdown({
      businessName: "Seoul Bistro",
      definitions,
      fixPlan,
      includeFixSteps: true,
      listingReview: {
        businessDescription: {
          basedOnSourceIds: ["google_places"],
          suggestedText: "Neighbourhood bistro.",
        },
        categories: undefined,
        napMismatches: [],
        photoChecklistGaps: [],
        reviewReplyTemplates: [],
      },
      overview: [{ text: "1 check did not pass." }],
      visibilityScore: 72,
    });

    expect(markdown).toContain("## Audit fix steps");
    expect(markdown).toContain("#### 1. Fix listing.");
    expect(markdown).toContain("## AI listing review");
    expect(markdown).toContain("Neighbourhood bistro.");
    expect(markdown).toContain("Constraints:");
  });

  it("omits fix steps when the report is still locked", () => {
    const markdown = buildReportAiInstructionsMarkdown({
      businessName: "Sample Cafe",
      definitions: [],
      fixPlan: [],
      includeFixSteps: false,
      listingReview: {
        businessDescription: undefined,
        categories: undefined,
        napMismatches: [],
        photoChecklistGaps: [{ item: "Storefront", reason: "Missing photo." }],
        reviewReplyTemplates: [],
      },
    });

    expect(markdown).not.toContain("## Audit fix steps");
    expect(markdown).toContain("Storefront");
  });
});

describe(reportAiInstructionsHasContent, () => {
  it("is true when fix steps or listing suggestions exist", () => {
    expect(
      reportAiInstructionsHasContent({
        fixPlan: [],
        includeFixSteps: false,
        listingReview: {
          businessDescription: undefined,
          categories: undefined,
          napMismatches: [],
          photoChecklistGaps: [{ item: "Interior", reason: "Add photos." }],
          reviewReplyTemplates: [],
        },
      })
    ).toBeTruthy();
  });
});

describe(reportAiInstructionsFilename, () => {
  it("slugifies the business name", () => {
    expect(reportAiInstructionsFilename("Haddon (Institute)")).toBe(
      "haddon-institute-ai-instructions.md"
    );
  });
});
