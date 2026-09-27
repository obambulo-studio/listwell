import { z } from "zod";

import type { ListingReviewInput, ListingReviewSourceId } from "./listing-review-context";
import { listingReviewSourceIdSchema } from "./listing-review-context";
import {
  extractModelText,
  parseJsonObject,
  resolveWorkersAiBinding,
  WORKERS_AI_MODEL,
  type WorkersAiBinding,
} from "./summaries";

export { resolveWorkersAiBinding };

export const listingReviewDegradedReasonSchema = z.enum([
  "ai_binding_missing",
  "insufficient_sources",
  "model_output_invalid",
  "model_request_failed",
]);

export const listingReviewContentSchema = z.object({
  businessDescription: z
    .object({
      basedOnSourceIds: z.array(listingReviewSourceIdSchema).min(1),
      suggestedText: z.string().min(1),
    })
    .optional(),
  categories: z
    .object({
      basedOnSourceIds: z.array(listingReviewSourceIdSchema).min(1),
      primary: z.string().min(1),
      secondary: z.array(z.string().min(1)),
    })
    .optional(),
  napMismatches: z.array(
    z.object({
      field: z.enum(["name", "address", "phone", "website"]),
      suggestedFix: z.string().min(1),
      values: z
        .array(
          z.object({
            sourceId: listingReviewSourceIdSchema,
            value: z.string().min(1),
          })
        )
        .min(2),
    })
  ),
  photoChecklistGaps: z.array(
    z.object({
      item: z.string().min(1),
      reason: z.string().min(1),
    })
  ),
  reviewReplyTemplates: z.array(
    z.object({
      reviewSnippet: z.string().min(1),
      suggestedReply: z.string().min(1),
    })
  ),
});

export const listingReviewResultSchema = z.object({
  available: z.boolean(),
  cached: z.boolean(),
  content: listingReviewContentSchema,
  degradedReason: listingReviewDegradedReasonSchema.nullable(),
  disclaimer: z.string(),
  fingerprint: z.string().min(1),
  source: z.enum(["workers-ai", "fallback"]),
});

export type ListingReviewResult = z.infer<typeof listingReviewResultSchema>;
export type ListingReviewContent = z.infer<typeof listingReviewContentSchema>;
export type ListingReviewDegradedReason = z.infer<
  typeof listingReviewDegradedReasonSchema
>;

const LISTING_REVIEW_DISCLAIMER =
  "AI suggestions below are based only on data Listwell fetched for this audit. Verify every change before publishing.";

const normalizeField = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");

const fieldValue = (
  source: { id: ListingReviewSourceId },
  field: "name" | "address" | "phone" | "website",
  input: ListingReviewInput
): string | undefined => {
  const row = input.sources.find((item) => item.id === source.id);
  if (!row) {
    return undefined;
  }
  switch (field) {
    case "name": {
      return row.name;
    }
    case "address": {
      return row.address;
    }
    case "phone": {
      return row.phone;
    }
    case "website": {
      return row.website;
    }
    default: {
      return undefined;
    }
  }
};

const detectNapMismatches = (
  input: ListingReviewInput
): ListingReviewContent["napMismatches"] => {
  const fields = ["name", "address", "phone", "website"] as const;
  const mismatches: ListingReviewContent["napMismatches"] = [];

  for (const field of fields) {
    const valuesBySource: {
      sourceId: ListingReviewSourceId;
      value: string;
    }[] = [];
    for (const source of input.sources) {
      const raw = fieldValue(source, field, input);
      if (!raw?.trim()) {
        continue;
      }
      valuesBySource.push({ sourceId: source.id, value: raw.trim() });
    }
    const groups = new Map<string, typeof valuesBySource>();
    for (const entry of valuesBySource) {
      const key = normalizeField(entry.value);
      const existing = groups.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    if (groups.size < 2) {
      continue;
    }
    const canonical =
      input.sources.find((item) => item.id === "audit_record")?.[
        field === "website" ? "website" : field
      ] ?? valuesBySource[0]?.value;
    mismatches.push({
      field,
      suggestedFix: canonical
        ? `Use "${canonical}" everywhere ${field} appears on listings.`
        : `Pick one ${field} and align every listing to match.`,
      values: valuesBySource,
    });
  }

  return mismatches;
};

const photoGapsFromSources = (
  input: ListingReviewInput
): ListingReviewContent["photoChecklistGaps"] => {
  const counts = input.sources.flatMap((source) =>
    source.photoCount === undefined ? [] : [source.photoCount]
  );
  const minPhotos = counts.length > 0 ? Math.min(...counts) : undefined;
  const gaps: ListingReviewContent["photoChecklistGaps"] = [];
  if (minPhotos !== undefined && minPhotos < 3) {
    gaps.push({
      item: "Add at least three listing photos",
      reason: `Fetched sources show ${minPhotos} photo${minPhotos === 1 ? "" : "s"}; listings with more photos tend to get more clicks.`,
    });
  }
  gaps.push(
    {
      item: "Storefront exterior",
      reason: "Helps customers recognise your business on arrival.",
    },
    {
      item: "Interior or service area",
      reason: "Shows the experience before they visit.",
    },
    {
      item: "Team or owner portrait",
      reason: "Builds trust for local service businesses.",
    }
  );
  return gaps;
};

export const buildFallbackListingReview = (
  input: ListingReviewInput,
  reason: ListingReviewDegradedReason
): ListingReviewResult => ({
  available: false,
  cached: false,
  content: listingReviewContentSchema.parse({
    napMismatches: detectNapMismatches(input),
    photoChecklistGaps: photoGapsFromSources(input),
    reviewReplyTemplates: [],
  }),
  degradedReason: reason,
  disclaimer: LISTING_REVIEW_DISCLAIMER,
  fingerprint: input.fingerprint,
  source: "fallback",
});

const validSourceIds = (input: ListingReviewInput): Set<ListingReviewSourceId> =>
  new Set(input.sources.map((source) => source.id));

const filterSourceIds = (
  ids: ListingReviewSourceId[],
  allowed: Set<ListingReviewSourceId>
): ListingReviewSourceId[] =>
  ids.filter((id) => allowed.has(id));

const reviewSnippetsInInput = (input: ListingReviewInput): string[] =>
  input.sources.flatMap((source) =>
    (source.recentReviews ?? []).map((review) => review.text)
  );

export const sanitizeListingReviewContent = (
  raw: z.infer<typeof listingReviewContentSchema>,
  input: ListingReviewInput
): ListingReviewContent | null => {
  const allowed = validSourceIds(input);
  const snippets = reviewSnippetsInInput(input);

  const businessDescription =
    raw.businessDescription &&
    filterSourceIds(raw.businessDescription.basedOnSourceIds, allowed).length > 0
      ? {
          ...raw.businessDescription,
          basedOnSourceIds: filterSourceIds(
            raw.businessDescription.basedOnSourceIds,
            allowed
          ),
        }
      : undefined;

  const categories =
    raw.categories &&
    filterSourceIds(raw.categories.basedOnSourceIds, allowed).length > 0
      ? {
          ...raw.categories,
          basedOnSourceIds: filterSourceIds(
            raw.categories.basedOnSourceIds,
            allowed
          ),
        }
      : undefined;

  const napMismatches = raw.napMismatches.flatMap((row) => {
    const values = row.values.filter(
      (entry) =>
        allowed.has(entry.sourceId) &&
        fieldValue({ id: entry.sourceId }, row.field, input)?.trim() ===
          entry.value.trim()
    );
    if (values.length < 2) {
      return [];
    }
    const normalized = new Set(values.map((entry) => normalizeField(entry.value)));
    if (normalized.size < 2) {
      return [];
    }
    return [{ ...row, values }];
  });

  const reviewReplyTemplates =
    snippets.length === 0
      ? []
      : raw.reviewReplyTemplates.filter((template) =>
          snippets.some((snippet) =>
            snippet.toLowerCase().includes(template.reviewSnippet.toLowerCase())
          )
        );

  const photoChecklistGaps =
    raw.photoChecklistGaps.length > 0
      ? raw.photoChecklistGaps
      : photoGapsFromSources(input);

  const content = listingReviewContentSchema.parse({
    businessDescription,
    categories,
    napMismatches:
      napMismatches.length > 0 ? napMismatches : detectNapMismatches(input),
    photoChecklistGaps,
    reviewReplyTemplates,
  });

  const hasUsefulContent =
    Boolean(content.businessDescription) ||
    Boolean(content.categories) ||
    content.reviewReplyTemplates.length > 0 ||
    content.napMismatches.length > 0 ||
    content.photoChecklistGaps.length > 0;

  if (!hasUsefulContent) {
    return null;
  }

  return content;
};

export const buildListingReviewPrompt = (
  input: ListingReviewInput
): string =>
  [
    "You help Australian small businesses improve local listings for Listwell.",
    "",
    "Rules:",
    "- Use ONLY facts in the JSON input (sources array).",
    "- Do not invent addresses, phone numbers, review text, ratings, or categories not implied by the input.",
    "- businessDescription.suggestedText and categories must cite basedOnSourceIds from the input source ids.",
    "- napMismatches.values must copy exact strings from the input sources for that field.",
    "- photoChecklistGaps: suggest practical photo types; mention low photoCount when present.",
    "- reviewReplyTemplates: include ONLY when recentReviews exist in input; reviewSnippet MUST be an exact substring of a provided review text.",
    "- Australian English, plain language, copy-paste ready.",
    "- Return JSON only, no markdown.",
    "",
    "JSON shape:",
    `{ "businessDescription": { "suggestedText": string, "basedOnSourceIds": string[] } | omit,`,
    `  "categories": { "primary": string, "secondary": string[], "basedOnSourceIds": string[] } | omit,`,
    `  "photoChecklistGaps": [{ "item": string, "reason": string }],`,
    `  "reviewReplyTemplates": [{ "reviewSnippet": string, "suggestedReply": string }],`,
    `  "napMismatches": [{ "field": "name"|"address"|"phone"|"website", "values": [{ "sourceId": string, "value": string }], "suggestedFix": string }] }`,
    "",
    "Input:",
    JSON.stringify({
      auditBusinessName: input.auditBusinessName,
      category: input.category,
      sources: input.sources,
    }),
  ].join("\n");

export const generateListingReview = async (input: {
  ai: WorkersAiBinding | null;
  reviewInput: ListingReviewInput;
}): Promise<ListingReviewResult> => {
  const { reviewInput } = input;
  if (reviewInput.sources.length < 1) {
    return buildFallbackListingReview(
      reviewInput,
      "insufficient_sources"
    );
  }

  if (!input.ai) {
    return buildFallbackListingReview(
      reviewInput,
      "ai_binding_missing"
    );
  }

  try {
    const raw = await input.ai.run(WORKERS_AI_MODEL, {
      messages: [
        {
          content:
            "You return valid JSON only. You never invent listing facts. You write for Listwell in Australian English.",
          role: "system",
        },
        {
          content: buildListingReviewPrompt(reviewInput),
          role: "user",
        },
      ],
    });
    const parsed = listingReviewContentSchema.parse(
      parseJsonObject(extractModelText(raw))
    );
    const sanitized = sanitizeListingReviewContent(parsed, reviewInput);
    if (!sanitized) {
      return buildFallbackListingReview(
        reviewInput,
        "model_output_invalid"
      );
    }

    return listingReviewResultSchema.parse({
      available: true,
      cached: false,
      content: sanitized,
      degradedReason: null,
      disclaimer: LISTING_REVIEW_DISCLAIMER,
      fingerprint: reviewInput.fingerprint,
      source: "workers-ai",
    });
  } catch {
    return buildFallbackListingReview(
      reviewInput,
      "model_request_failed"
    );
  }
};

const LISTING_REVIEW_KV_PREFIX = "listing-review:";
const LISTING_REVIEW_TTL_SECONDS = 7 * 24 * 60 * 60;

export const listingReviewCacheKey = (
  businessId: string,
  businessUpdatedAt: string,
  fingerprint: string
): string =>
  `${LISTING_REVIEW_KV_PREFIX}${businessId}:${businessUpdatedAt}:${fingerprint}`;

declare global {
  var listwellListingReviewCache: Map<string, ListingReviewResult> | undefined;
}

const memoryCache: Map<string, ListingReviewResult> =
  globalThis.listwellListingReviewCache ??
  new Map<string, ListingReviewResult>();
globalThis.listwellListingReviewCache = memoryCache;

export const readListingReviewCache = async (
  key: string,
  kv: KVNamespace | undefined
): Promise<ListingReviewResult | null> => {
  if (kv) {
    const raw = await kv.get(key, "json");
    if (raw) {
      const parsed = listingReviewResultSchema.safeParse(raw);
      if (parsed.success) {
        return { ...parsed.data, cached: true };
      }
    }
  }
  const fromMemory = memoryCache.get(key);
  return fromMemory ? { ...fromMemory, cached: true } : null;
};

export const writeListingReviewCache = async (
  key: string,
  value: ListingReviewResult,
  kv: KVNamespace | undefined
): Promise<void> => {
  const stored = listingReviewResultSchema.parse(value);
  memoryCache.set(key, stored);
  if (kv) {
    await kv.put(key, JSON.stringify(stored), {
      expirationTtl: LISTING_REVIEW_TTL_SECONDS,
    });
  }
};
