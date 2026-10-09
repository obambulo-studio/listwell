import { z } from "zod";

import { categoryIdSchema, categoryLabelInputSchema } from "./category";
import {
  hiddenCompetitorPlaceIdsSchema,
  pinnedCompetitorsSchema,
  searchPhrasesSchema,
} from "./seo-schema";
import { coerceStoredWebsiteUrl } from "./text-normalize";
import { zNullableString } from "./zod-coerce";

export const locationInputSchema = z.object({
  address: z.string().optional(),
  appleMapsId: z.string().optional(),
  googlePlaceId: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  name: z.string().optional(),
  pinId: z.string().optional(),
});

export const createBusinessRequestSchema = z.object({
  category: categoryIdSchema,
  categoryLabel: categoryLabelInputSchema.optional(),
  deliverooUrl: z.string().optional(),
  doorDashUrl: z.string().optional(),
  facebookUsername: z.string().optional(),
  id: z.string().optional(),
  instagramUsername: z.string().optional(),
  linkedinUrl: z.string().optional(),
  locations: z.array(locationInputSchema).optional().default([]),
  menulogUrl: z.string().optional(),
  name: z.string().min(1),
  tiktokUsername: z.string().optional(),
  uberEatsUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  xUsername: z.string().optional(),
  youtubeUrl: z.string().optional(),
});

export const updateBusinessRequestSchema = createBusinessRequestSchema
  .omit({ id: true })
  .partial()
  .extend({
    locations: z.array(locationInputSchema).optional(),
  });

export const locationSchema = z.object({
  address: z.string().nullable(),
  appleMapsId: z.string().nullable(),
  businessId: z.string(),
  createdAt: z.string(),
  googlePlaceId: z.string().nullable(),
  id: z.number(),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  name: z.string().nullable(),
  pinId: z.string().nullable().default(null),
  updatedAt: z.string(),
});

export const businessSchema = z.object({
  category: categoryIdSchema,
  categoryLabel: z.string().nullable().default(null),
  competitors: pinnedCompetitorsSchema.default([]),
  createdAt: z.string(),
  deliverooUrl: z.string().nullable(),
  doorDashUrl: z.string().nullable(),
  facebookUsername: z.string().nullable(),
  hiddenCompetitorPlaceIds: hiddenCompetitorPlaceIdsSchema.default([]),
  id: z.string(),
  instagramUsername: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  locations: z.array(locationSchema),
  menulogUrl: z.string().nullable(),
  name: z.string(),
  searchPhrases: searchPhrasesSchema.default([]),
  tiktokUsername: z.string().nullable(),
  uberEatsUrl: z.string().nullable(),
  updatedAt: z.string(),
  userId: z.string().nullable(),
  websiteUrl: z.preprocess(
    (value) => coerceStoredWebsiteUrl(value as string | null | undefined),
    z.string().nullable()
  ),
  xUsername: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
});

export type Business = z.infer<typeof businessSchema>;
export type BusinessLocation = z.infer<typeof locationSchema>;
export type CreateBusinessRequest = z.infer<typeof createBusinessRequestSchema>;
export type UpdateBusinessRequest = z.infer<typeof updateBusinessRequestSchema>;

export const checkResultSchema = z.object({
  jobId: z.string().optional(),
  label: z.string().optional(),
  queued: z.boolean().optional(),
  type: z.literal("check"),
  value: z.boolean().nullable(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const checkBatchResponseSchema = z.object({
  jobId: z.string().optional(),
  pending: z.array(z.string()),
  results: z.record(z.string(), checkResultSchema),
});
export type CheckBatchResponse = z.infer<typeof checkBatchResponseSchema>;

export const auditJobPollSchema = z.object({
  results: z.record(z.string(), checkResultSchema),
  status: z.enum(["queued", "running", "complete", "error"]),
});
export type AuditJobPoll = z.infer<typeof auditJobPollSchema>;

export const entitlementKindSchema = z.enum([
  "report_once",
  "report_monthly",
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);
export type EntitlementKind = z.infer<typeof entitlementKindSchema>;

export const entitlementStatusSchema = z.enum([
  "active",
  "cancelled",
  "revoked",
]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementRowSchema = z.object({
  businessId: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: entitlementKindSchema,
  nextScanAt: zNullableString,
  polarCustomerId: zNullableString,
  polarOrderId: zNullableString,
  polarSubscriptionId: zNullableString,
  status: entitlementStatusSchema,
  updatedAt: z.string(),
  userId: zNullableString,
});
export type EntitlementRow = z.infer<typeof entitlementRowSchema>;

export {
  ONCE_RESCAN_FREE_LIMIT,
  ONCE_RESCAN_WINDOW_DAYS,
  SCAN_INTERVAL_MS,
} from "./scan-config";
export { nextScanAtFrom } from "./scan-interval";

export const scanTriggerSchema = z.enum(["baseline", "schedule", "rescan"]);

export const scanStatusSchema = z.enum([
  "queued",
  "running",
  "complete",
  "error",
]);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export type ScanTrigger = z.infer<typeof scanTriggerSchema>;

export const scanRowSchema = z.object({
  businessId: z.string(),
  createdAt: z.string(),
  error: z.string().nullable(),
  errorCount: z.number().int(),
  failCount: z.number().int(),
  finishedAt: z.string().nullable(),
  id: z.string(),
  passCount: z.number().int(),
  results: z.record(z.string(), checkResultSchema).nullable(),
  score: z.number().nullable(),
  startedAt: z.string(),
  status: scanStatusSchema,
  trigger: scanTriggerSchema,
});
export type ScanRow = z.infer<typeof scanRowSchema>;

export const scanSummarySchema = z.object({
  errorCount: z.number().int(),
  failCount: z.number().int(),
  finishedAt: z.string().nullable(),
  id: z.string(),
  passCount: z.number().int(),
  score: z.number().nullable(),
  startedAt: z.string(),
  status: scanStatusSchema,
  trigger: scanTriggerSchema,
});
export type ScanSummary = z.infer<typeof scanSummarySchema>;

export const userRowSchema = z.object({
  createdAt: z.string(),
  email: z.string(),
  id: z.string(),
  name: z.string().optional(),
});
export type UserRow = z.infer<typeof userRowSchema>;

export const loginCodeRowSchema = z.object({
  attempts: z.number().int(),
  codeHash: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  id: z.string(),
  userId: z.string(),
});
export type LoginCodeRow = z.infer<typeof loginCodeRowSchema>;

export const sessionRowSchema = z.object({
  expiresAt: z.string(),
  id: z.string(),
  tokenHash: z.string(),
  userId: z.string(),
});
export type SessionRow = z.infer<typeof sessionRowSchema>;

export const onceRescanStateSchema = z.object({
  available: z.boolean(),
  remaining: z.number().int().nonnegative(),
  windowEndsAt: z.string().nullable(),
});

export const entitlementStateSchema = z.object({
  authEnabled: z.boolean().default(false),
  backendAvailable: z.boolean().default(true),
  fixStepsWithoutPayment: z.boolean().default(false),
  kind: entitlementKindSchema.nullable().default(null),
  maskedEmail: z.string().nullable().default(null),
  monthlyAvailable: z.boolean().default(false),
  monthlyCancelled: z.boolean().default(false),
  onceRescan: onceRescanStateSchema.optional(),
  paymentsEnabled: z.boolean(),
  sessionRequired: z.boolean().default(false),
  unlocked: z.boolean(),
  yearlyAvailable: z.boolean().default(false),
});
export type EntitlementState = z.infer<typeof entitlementStateSchema>;

export const authEmailSchema = z.object({
  email: z.string().min(1),
});
export type AuthEmailRequest = z.infer<typeof authEmailSchema>;

export const authVerifyRequestSchema = z.object({
  code: z.string().min(1),
  email: z.string().min(1),
});
export type AuthVerifyRequest = z.infer<typeof authVerifyRequestSchema>;

export const authAcceptedSchema = z.object({
  ok: z.literal(true),
});
export type AuthAccepted = z.infer<typeof authAcceptedSchema>;

export const authMeSchema = z.object({
  email: z.string(),
});
export type AuthMe = z.infer<typeof authMeSchema>;

export const accountPlanSchema = z.enum(["preview", "once", "monthly"]);
export type AccountPlan = z.infer<typeof accountPlanSchema>;

const accountReportLastScanSchema = z
  .object({
    finishedAt: z.string().nullable().optional(),
    previousScore: z.number().nullable().optional(),
    score: z.number().nullable().optional(),
  })
  .transform((row) => ({
    finishedAt: row.finishedAt ?? null,
    previousScore: row.previousScore ?? null,
    score: row.score ?? null,
  }));

export const accountReportSchema = z.object({
  analyticsKind: z
    .enum(["analytics_10k", "analytics_100k", "analytics_1m"])
    .nullable()
    .default(null),
  id: z.string(),
  lastScan: accountReportLastScanSchema.nullable(),
  name: z.string(),
  nextScanAt: z.string().nullable(),
  owned: z.boolean(),
  plan: accountPlanSchema,
  unlocked: z.boolean(),
});
export type AccountReport = z.infer<typeof accountReportSchema>;

export const accountReportsSchema = z.object({
  reports: z.array(accountReportSchema),
});
export type AccountReports = z.infer<typeof accountReportsSchema>;

export const accountPageSchema = z.object({
  reports: z.array(accountReportSchema),
  sharedReports: z.array(accountReportSchema),
});
export type AccountPage = z.infer<typeof accountPageSchema>;

export const checkoutPlanSchema = z.enum([
  "once",
  "monthly",
  "yearly",
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);
export type CheckoutPlan = z.infer<typeof checkoutPlanSchema>;

export const checkoutReturnToSchema = z.literal("account");
export type CheckoutReturnTo = z.infer<typeof checkoutReturnToSchema>;

export const checkoutRequestSchema = z.object({
  businessId: z.string().min(1),
  plan: checkoutPlanSchema.default("once"),
  returnTo: checkoutReturnToSchema.optional(),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z.object({
  url: z.string().min(1),
});
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const claimBusinessesRequestSchema = z.object({
  ids: z.array(z.string().min(1)),
});
export type ClaimBusinessesRequest = z.infer<
  typeof claimBusinessesRequestSchema
>;

export const reportShareRouteParamsSchema = z.object({
  token: z.string().min(16),
});
export type ReportShareRouteParams = z.infer<
  typeof reportShareRouteParamsSchema
>;

export const reportShareRecordSchema = z.object({
  businessId: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  token: z.string().min(16),
});
export type ReportShareRecord = z.infer<typeof reportShareRecordSchema>;

export const createReportShareRequestSchema = z.object({
  expiresInDays: z
    .union([z.literal(7), z.literal(30)])
    .nullable()
    .optional(),
});
export type CreateReportShareRequest = z.infer<
  typeof createReportShareRequestSchema
>;

export const reportShareStateSchema = z.object({
  active: z.boolean(),
  createdAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  token: z.string().nullable(),
  url: z.string().nullable(),
});
export type ReportShareState = z.infer<typeof reportShareStateSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
});

export const businessGuestStatusSchema = z.enum([
  "pending",
  "active",
  "revoked",
]);
export type BusinessGuestStatus = z.infer<typeof businessGuestStatusSchema>;

export const businessGuestRowSchema = z.object({
  acceptedAt: z.string().nullable(),
  email: z.string(),
  id: z.string(),
  invitedAt: z.string(),
  status: businessGuestStatusSchema,
});
export type BusinessGuestRow = z.infer<typeof businessGuestRowSchema>;

export const businessGuestListSchema = z.object({
  guests: z.array(businessGuestRowSchema),
});
export type BusinessGuestList = z.infer<typeof businessGuestListSchema>;

export const businessGuestInviteRequestSchema = z.object({
  email: z.string().min(1),
});
export type BusinessGuestInviteRequest = z.infer<
  typeof businessGuestInviteRequestSchema
>;

export const businessGuestInvitePreviewSchema = z.object({
  businessExternalId: z.string(),
  businessName: z.string(),
  inviteeEmail: z.string(),
  status: businessGuestStatusSchema,
});
export type BusinessGuestInvitePreview = z.infer<
  typeof businessGuestInvitePreviewSchema
>;
