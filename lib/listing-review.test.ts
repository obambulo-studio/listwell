import { describe, expect, it, vi } from "vitest";

import {
  buildFallbackListingReview,
  buildListingReviewFixPrompt,
  buildListingReviewPrompt,
  generateListingReview,
  LISTING_REVIEW_MAX_TOKENS,
  LISTING_REVIEW_MODEL,
  listingReviewCacheKey,
  listingReviewHasFixPrompt,
  sanitizeListingReviewContent,
} from "./listing-review";
import { listingReviewInputSchema } from "./listing-review-context";
import type { WorkersAiBinding } from "./summaries";

const baseInput = listingReviewInputSchema.parse({
  auditBusinessName: "Seoul Bistro",
  category: "food",
  fingerprint: "abc123",
  sources: [
    {
      address: "1 Main St, Brisbane QLD",
      id: "audit_record",
      label: "Your Listwell audit",
      name: "Seoul Bistro",
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
      address: "1 Main Street, Brisbane",
      category: "restaurant",
      id: "openstreetmap",
      label: "OpenStreetMap",
      name: "Seoul Bistro",
    },
  ],
});

describe(sanitizeListingReviewContent, () => {
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
    ).toBeFalsy();
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

  it("keeps only the low photo-count line when the model returns no photo gaps", () => {
    const sanitized = sanitizeListingReviewContent(
      {
        napMismatches: [],
        photoChecklistGaps: [],
        reviewReplyTemplates: [],
      },
      baseInput
    );

    expect(sanitized?.photoChecklistGaps).toStrictEqual([
      {
        item: "Add at least three listing photos",
        reason:
          "Fetched sources show 1 photo; listings with more photos tend to get more clicks.",
      },
    ]);
  });

  it("does not replace an empty photo list with generic items when photo counts are not low", () => {
    const input = listingReviewInputSchema.parse({
      ...baseInput,
      sources: baseInput.sources.map((source) =>
        source.id === "website" ? { ...source, photoCount: 8 } : source
      ),
    });
    const sanitized = sanitizeListingReviewContent(
      {
        napMismatches: [],
        photoChecklistGaps: [],
        reviewReplyTemplates: [],
      },
      input
    );

    expect(sanitized?.photoChecklistGaps).toStrictEqual([]);
    expect(
      sanitized?.napMismatches.some((row) => row.field === "phone")
    ).toBeTruthy();
  });
});

describe(buildListingReviewFixPrompt, () => {
  it("formats Goal, Issue, and Fix blocks for coding agents", () => {
    const result = buildFallbackListingReview(baseInput, "ai_binding_missing");
    expect(listingReviewHasFixPrompt(result.content)).toBeTruthy();
    const prompt = buildListingReviewFixPrompt({
      businessName: "Seoul Bistro",
      content: result.content,
    });
    expect(prompt).toContain("# Listing improvements for Seoul Bistro");
    expect(prompt).toContain("Goal:");
    expect(prompt).toContain("Issue:");
    expect(prompt).toContain("Fix:");
  });

  it("names the NAP section and the sources that disagree", () => {
    const result = buildFallbackListingReview(baseInput, "ai_binding_missing");
    const prompt = buildListingReviewFixPrompt({
      businessName: "Seoul Bistro",
      content: result.content,
    });
    expect(prompt).toContain("NAP consistency");
    expect(prompt).toContain("Website:");
    expect(prompt).toContain("Listwell audit:");
  });

  it("includes AI suggestion sections when present", () => {
    const prompt = buildListingReviewFixPrompt({
      businessName: "Sample Cafe",
      content: {
        businessDescription: {
          basedOnSourceIds: ["google_places"],
          suggestedText: "Neighbourhood espresso bar.",
        },
        categories: {
          basedOnSourceIds: ["google_places"],
          primary: "Cafe",
          secondary: ["Coffee shop"],
        },
        napMismatches: [],
        photoChecklistGaps: [],
        reviewReplyTemplates: [],
      },
    });
    expect(prompt).toContain("Neighbourhood espresso bar.");
    expect(prompt).toContain('primary category to "Cafe"');
  });
});

describe(buildFallbackListingReview, () => {
  it("detects phone mismatches without AI", () => {
    const result = buildFallbackListingReview(baseInput, "ai_binding_missing");
    expect(result.source).toBe("fallback");
    expect(
      result.content.napMismatches.some((row) => row.field === "phone")
    ).toBeTruthy();
    expect(result.content.photoChecklistGaps).toStrictEqual([
      {
        item: "Add at least three listing photos",
        reason:
          "Fetched sources show 1 photo; listings with more photos tend to get more clicks.",
      },
    ]);
  });
});

describe(buildListingReviewPrompt, () => {
  it("asks for a short grounded description and omits generic sections", () => {
    const prompt = buildListingReviewPrompt(baseInput);
    expect(prompt).toContain("at most two sentences");
    expect(prompt).toContain("prefer a category string already on a source");
    expect(prompt).toContain("two to four sentences");
    expect(prompt).toContain(
      "Omit a section instead of filling it with generic advice."
    );
  });
});

describe(listingReviewCacheKey, () => {
  it("includes the model id so an older model response is not reused", () => {
    expect(listingReviewCacheKey("biz", "2026-01-01T00:00:00.000Z", "fp")).toBe(
      `listing-review:${LISTING_REVIEW_MODEL}:biz:2026-01-01T00:00:00.000Z:fp`
    );
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
    expect(ai.run).toHaveBeenCalledWith(LISTING_REVIEW_MODEL, {
      max_tokens: LISTING_REVIEW_MAX_TOKENS,
      messages: [
        {
          content:
            "You return valid JSON only. You never invent listing facts. You write for Listwell in Australian English.",
          role: "system",
        },
        {
          content: buildListingReviewPrompt(baseInput),
          role: "user",
        },
      ],
      response_format: { type: "json_object" },
    });
    expect(result.available).toBeTruthy();
    expect(result.source).toBe("workers-ai");
    expect(result.content.businessDescription?.suggestedText).toContain(
      "Korean"
    );
  });

  it("falls back when the model returns invalid JSON", async () => {
    const ai: WorkersAiBinding = {
      run: vi.fn<WorkersAiBinding["run"]>().mockResolvedValue({
        response: "not json",
      }),
    };

    const result = await generateListingReview({ ai, reviewInput: baseInput });
    expect(result.available).toBeFalsy();
    expect(result.degradedReason).toBe("model_request_failed");
  });
});
