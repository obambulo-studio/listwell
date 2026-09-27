import { describe, expect, it, vi } from "vitest";

import { listingReviewInputSchema } from "./listing-review-context";
import {
  buildFallbackListingReview,
  generateListingReview,
  sanitizeListingReviewContent,
} from "./listing-review";
import type { WorkersAiBinding } from "./summaries";

const baseInput = listingReviewInputSchema.parse({
  auditBusinessName: "Seoul Bistro",
  category: "food",
  fingerprint: "abc123",
  sources: [
    {
      id: "audit_record",
      label: "Your Listwell audit",
      name: "Seoul Bistro",
      address: "1 Main St, Brisbane QLD",
      phone: "07 3000 0000",
      website: "https://seoulbistro.example",
    },
    {
      id: "website",
      label: "Business website",
      name: "Seoul Bistro Brisbane",
      phone: "07 3000 1111",
      photoCount: 1,
    },
    {
      id: "openstreetmap",
      label: "OpenStreetMap",
      name: "Seoul Bistro",
      address: "1 Main Street, Brisbane",
      category: "restaurant",
    },
  ],
});

describe("sanitizeListingReviewContent", () => {
  it("drops NAP rows that are not grounded in input sources", () => {
    const sanitized = sanitizeListingReviewContent(
      {
        businessDescription: {
          basedOnSourceIds: ["website"],
          suggestedText: "Family-run Korean dining in Brisbane.",
        },
        categories: {
          basedOnSourceIds: ["openstreetmap"],
          primary: "Korean restaurant",
          secondary: ["Restaurant"],
        },
        napMismatches: [
          {
            field: "phone",
            suggestedFix: "Pick one number.",
            values: [
              { sourceId: "website", value: "07 3000 1111" },
              { sourceId: "audit_record", value: "07 3000 0000" },
              { sourceId: "google_places", value: "07 3999 9999" },
            ],
          },
        ],
        photoChecklistGaps: [],
        reviewReplyTemplates: [],
      },
      baseInput
    );

    expect(sanitized?.napMismatches).toHaveLength(1);
    expect(sanitized?.napMismatches[0]?.values).toHaveLength(2);
    expect(
      sanitized?.napMismatches[0]?.values.some(
        (row) => row.sourceId === "google_places"
      )
    ).toBe(false);
  });

  it("strips review templates when no review text was fetched", () => {
    const sanitized = sanitizeListingReviewContent(
      {
        napMismatches: [],
        photoChecklistGaps: [{ item: "Storefront", reason: "Recognition." }],
        reviewReplyTemplates: [
          {
            reviewSnippet: "Great food",
            suggestedReply: "Thanks for visiting!",
          },
        ],
      },
      baseInput
    );

    expect(sanitized?.reviewReplyTemplates).toHaveLength(0);
  });
});

describe(buildFallbackListingReview, () => {
  it("detects phone mismatches without AI", () => {
    const result = buildFallbackListingReview(baseInput, "ai_binding_missing");
    expect(result.source).toBe("fallback");
    expect(result.content.napMismatches.some((row) => row.field === "phone")).toBe(
      true
    );
    expect(result.content.photoChecklistGaps.length).toBeGreaterThan(0);
  });
});

describe(generateListingReview, () => {
  it("uses mocked Workers AI JSON when valid", async () => {
    const ai: WorkersAiBinding = {
      run: vi.fn<WorkersAiBinding["run"]>().mockResolvedValue({
        response: JSON.stringify({
          businessDescription: {
            basedOnSourceIds: ["website", "openstreetmap"],
            suggestedText:
              "Korean restaurant in Brisbane with dine-in and takeaway.",
          },
          categories: {
            basedOnSourceIds: ["openstreetmap"],
            primary: "Korean restaurant",
            secondary: ["Asian restaurant"],
          },
          napMismatches: [],
          photoChecklistGaps: [
            {
              item: "Menu highlights",
              reason: "Only one photo was found on the website.",
            },
          ],
          reviewReplyTemplates: [],
        }),
      }),
    };

    const result = await generateListingReview({ ai, reviewInput: baseInput });
    expect(result.available).toBe(true);
    expect(result.source).toBe("workers-ai");
    expect(result.content.businessDescription?.suggestedText).toContain("Korean");
  });

  it("falls back when the model returns invalid JSON", async () => {
    const ai: WorkersAiBinding = {
      run: vi.fn<WorkersAiBinding["run"]>().mockResolvedValue({
        response: "not json",
      }),
    };

    const result = await generateListingReview({ ai, reviewInput: baseInput });
    expect(result.available).toBe(false);
    expect(result.degradedReason).toBe("model_request_failed");
  });
});
