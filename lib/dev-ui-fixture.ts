import { checksForCategory } from "@/lib/checks/registry";
import { pointsFor } from "@/lib/checks/types";
import type { ListingReviewResult } from "@/lib/listing-review";
import {
  businessSchema,
  checkResultSchema,
  entitlementStateSchema,
  scanSummarySchema,
} from "@/lib/schema";
import type {
  Business,
  CheckResult,
  EntitlementState,
  ScanSummary,
} from "@/lib/schema";
import type { AuditSummaryResult, CompletedCheck } from "@/lib/summaries";
import { buildFallbackSummary, completedCheckSchema } from "@/lib/summaries";

/** Dev-only fixture id for UI screenshots (never resolved in production). */
export const UI_FIXTURE_BUSINESS_ID = "00000000-0000-4000-a800-000000000001";

export const devUiFixtureEnabled = (): boolean =>
  process.env.NODE_ENV === "development";

const nowIso = (): string => new Date().toISOString();

export const uiFixtureBusiness = (): Business =>
  businessSchema.parse({
    category: "food",
    createdAt: nowIso(),
    deliverooUrl: null,
    doorDashUrl: null,
    facebookUsername: "samplecafe",
    id: UI_FIXTURE_BUSINESS_ID,
    instagramUsername: "samplecafe",
    linkedinUrl: null,
    locations: [
      {
        address: "1 George St, Sydney NSW 2000",
        appleMapsId: null,
        businessId: UI_FIXTURE_BUSINESS_ID,
        createdAt: nowIso(),
        googlePlaceId: "ChIJSamplePlaceId",
        id: 1,
        name: "Sample Cafe",
        updatedAt: nowIso(),
      },
    ],
    menulogUrl: null,
    name: "Sample Cafe",
    tiktokUsername: null,
    uberEatsUrl: null,
    updatedAt: nowIso(),
    userId: null,
    websiteUrl: "https://example.com.au",
    xUsername: null,
    youtubeUrl: null,
  });

export const uiFixtureCheckResults = (): Record<string, CheckResult> => {
  const checks = checksForCategory("food");
  const results: Record<string, CheckResult> = {};
  for (const [index, definition] of checks.entries()) {
    const mod = index % 3;
    let value: boolean | null = null;
    if (mod === 0) {
      value = true;
    } else if (mod === 1) {
      value = false;
    }
    results[definition.id] = checkResultSchema.parse({
      label: value === null ? "Could not verify" : undefined,
      type: "check",
      value,
    });
  }
  return results;
};

export const uiFixtureCompletedChecks = (): CompletedCheck[] => {
  const checks = checksForCategory("food");
  const results = uiFixtureCheckResults();
  return checks.flatMap((definition) => {
    const result = results[definition.id];
    if (!result) {
      return [];
    }
    let status: "pass" | "fail" | "error" = "error";
    if (result.value === true) {
      status = "pass";
    } else if (result.value === false) {
      status = "fail";
    }
    return [
      completedCheckSchema.parse({
        channelCategory: definition.channelCategory,
        id: definition.id,
        label: result.label,
        points: pointsFor(definition, "food"),
        status,
        title: definition.title,
      }),
    ];
  });
};

export const uiFixtureSummary = (): AuditSummaryResult =>
  buildFallbackSummary(uiFixtureCompletedChecks(), "ai_binding_missing");

export const uiFixtureScanHistory = (): ScanSummary[] => [
  scanSummarySchema.parse({
    errorCount: 1,
    failCount: 4,
    finishedAt: nowIso(),
    id: "scan-fixture-1",
    passCount: 12,
    score: 68,
    startedAt: nowIso(),
    status: "complete",
    trigger: "rescan",
  }),
  scanSummarySchema.parse({
    errorCount: 2,
    failCount: 5,
    finishedAt: "2026-08-30T00:00:00.000Z",
    id: "scan-fixture-2",
    passCount: 11,
    score: 61,
    startedAt: "2026-08-30T00:00:00.000Z",
    status: "complete",
    trigger: "schedule",
  }),
];

export const uiFixtureOwnerAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    fixStepsWithoutPayment: false,
    kind: null,
    maskedEmail: null,
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: false,
    unlocked: false,
    yearlyAvailable: true,
  });

export const uiFixtureUnlockedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    kind: "report_once",
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: false,
    unlocked: true,
    yearlyAvailable: true,
  });

export const uiFixtureCheckoutReturnedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    kind: "report_once",
    maskedEmail: "a***@example.com",
    monthlyAvailable: true,
    paymentsEnabled: true,
    sessionRequired: true,
    unlocked: true,
    yearlyAvailable: true,
  });

export const uiFixtureSharedAccess = (): EntitlementState =>
  entitlementStateSchema.parse({
    backendAvailable: true,
    paymentsEnabled: true,
    unlocked: false,
  });

export const uiFixtureListingReview = (): ListingReviewResult => ({
  available: true,
  cached: false,
  content: {
    businessDescription: {
      basedOnSourceIds: ["google_places"],
      suggestedText:
        "Sample Cafe is a neighbourhood coffee shop in Sydney CBD, serving specialty espresso and fresh pastries seven days a week.",
    },
    categories: {
      basedOnSourceIds: ["google_places"],
      primary: "Cafe",
      secondary: ["Coffee shop", "Breakfast restaurant"],
    },
    napMismatches: [
      {
        field: "phone",
        suggestedFix: "Use the same format on Google and your website.",
        values: [
          { sourceId: "google_places", value: "02 9000 0000" },
          { sourceId: "website", value: "(02) 9000-0000" },
        ],
      },
    ],
    photoChecklistGaps: [
      {
        item: "Interior seating",
        reason: "Helps customers understand the dine-in experience.",
      },
    ],
    reviewReplyTemplates: [
      {
        reviewSnippet: "Great coffee, friendly staff.",
        suggestedReply:
          "Thanks for visiting Sample Cafe. We are glad you enjoyed the coffee and we hope to see you again soon.",
      },
    ],
  },
  degradedReason: null,
  disclaimer:
    "Suggestions are generated from listing data and may need your review before publishing.",
  fingerprint: "ui-fixture-listing-review",
  source: "fallback",
});
