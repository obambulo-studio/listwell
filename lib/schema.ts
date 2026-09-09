import { z } from "zod";

import { categoryIdSchema } from "./category";

export const locationInputSchema = z.object({
  address: z.string().optional(),
  appleMapsId: z.string().optional(),
  googlePlaceId: z.string().optional(),
  name: z.string().optional(),
});

export const createBusinessRequestSchema = z.object({
  category: categoryIdSchema,
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
  name: z.string().nullable(),
  updatedAt: z.string(),
});

export const businessSchema = z.object({
  category: categoryIdSchema,
  createdAt: z.string(),
  deliverooUrl: z.string().nullable(),
  doorDashUrl: z.string().nullable(),
  facebookUsername: z.string().nullable(),
  id: z.string(),
  instagramUsername: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  locations: z.array(locationSchema),
  menulogUrl: z.string().nullable(),
  name: z.string(),
  tiktokUsername: z.string().nullable(),
  uberEatsUrl: z.string().nullable(),
  updatedAt: z.string(),
  userId: z.string().nullable(),
  websiteUrl: z.string().nullable(),
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

export const entitlementKindSchema = z.enum(["report_once", "report_monthly"]);
export type EntitlementKind = z.infer<typeof entitlementKindSchema>;

export const entitlementStatusSchema = z.enum(["active", "revoked"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementRowSchema = z.object({
  businessId: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: entitlementKindSchema,
  nextScanAt: z.string().nullable(),
  polarOrderId: z.string().nullable(),
  polarSubscriptionId: z.string().nullable(),
  status: entitlementStatusSchema,
  updatedAt: z.string(),
  userId: z.string().nullable(),
});
export type EntitlementRow = z.infer<typeof entitlementRowSchema>;

export const SCAN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export const nextScanAtFrom = (date: Date): string =>
  new Date(date.getTime() + SCAN_INTERVAL_MS).toISOString();

export const scanStatusSchema = z.enum([
  "queued",
  "running",
  "complete",
  "error",
]);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const scanTriggerSchema = z.enum(["baseline", "schedule"]);
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

export const entitlementStateSchema = z.object({
  authEnabled: z.boolean().default(false),
  kind: entitlementKindSchema.nullable().default(null),
  maskedEmail: z.string().nullable().default(null),
  monthlyAvailable: z.boolean().default(false),
  paymentsEnabled: z.boolean(),
  sessionRequired: z.boolean().default(false),
  unlocked: z.boolean(),
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

export const accountReportSchema = z.object({
  id: z.string(),
  lastScan: z
    .object({
      finishedAt: z.string().nullable(),
      score: z.number().nullable(),
    })
    .nullable(),
  name: z.string(),
  nextScanAt: z.string().nullable(),
  plan: accountPlanSchema,
  unlocked: z.boolean(),
});
export type AccountReport = z.infer<typeof accountReportSchema>;

export const accountReportsSchema = z.object({
  reports: z.array(accountReportSchema),
});
export type AccountReports = z.infer<typeof accountReportsSchema>;

export const checkoutPlanSchema = z.enum(["once", "monthly"]);
export type CheckoutPlan = z.infer<typeof checkoutPlanSchema>;

export const checkoutRequestSchema = z.object({
  businessId: z.string().min(1),
  plan: checkoutPlanSchema.default("once"),
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

export const apiErrorSchema = z.object({
  error: z.string(),
});
