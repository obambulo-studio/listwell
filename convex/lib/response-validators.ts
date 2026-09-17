import { v } from "convex/values";

import {
  entitlementKindValidator,
  entitlementStatusValidator,
  scanStatusValidator,
  scanTriggerValidator,
} from "./validators";

export const locationResponseValidator = v.object({
  address: v.union(v.string(), v.null()),
  appleMapsId: v.union(v.string(), v.null()),
  businessId: v.string(),
  createdAt: v.string(),
  googlePlaceId: v.union(v.string(), v.null()),
  id: v.number(),
  name: v.union(v.string(), v.null()),
  updatedAt: v.string(),
});

export const businessResponseValidator = v.object({
  category: v.string(),
  createdAt: v.string(),
  deliverooUrl: v.union(v.string(), v.null()),
  doorDashUrl: v.union(v.string(), v.null()),
  facebookUsername: v.union(v.string(), v.null()),
  id: v.string(),
  instagramUsername: v.union(v.string(), v.null()),
  linkedinUrl: v.union(v.string(), v.null()),
  locations: v.array(locationResponseValidator),
  menulogUrl: v.union(v.string(), v.null()),
  name: v.string(),
  tiktokUsername: v.union(v.string(), v.null()),
  uberEatsUrl: v.union(v.string(), v.null()),
  updatedAt: v.string(),
  userId: v.union(v.string(), v.null()),
  websiteUrl: v.union(v.string(), v.null()),
  xUsername: v.union(v.string(), v.null()),
  youtubeUrl: v.union(v.string(), v.null()),
});

export const entitlementResponseValidator = v.object({
  businessId: v.string(),
  createdAt: v.string(),
  id: v.string(),
  kind: entitlementKindValidator,
  nextScanAt: v.union(v.string(), v.null()),
  polarOrderId: v.union(v.string(), v.null()),
  polarSubscriptionId: v.union(v.string(), v.null()),
  status: entitlementStatusValidator,
  updatedAt: v.string(),
  userId: v.union(v.string(), v.null()),
});

export const checkResultResponseValidator = v.object({
  jobId: v.optional(v.string()),
  label: v.optional(v.string()),
  queued: v.optional(v.boolean()),
  type: v.literal("check"),
  value: v.union(v.boolean(), v.null()),
});

export const scanResponseValidator = v.object({
  businessId: v.string(),
  createdAt: v.string(),
  error: v.union(v.string(), v.null()),
  errorCount: v.number(),
  failCount: v.number(),
  finishedAt: v.union(v.string(), v.null()),
  id: v.string(),
  passCount: v.number(),
  results: v.union(
    v.record(v.string(), checkResultResponseValidator),
    v.null()
  ),
  score: v.union(v.number(), v.null()),
  startedAt: v.string(),
  status: scanStatusValidator,
  trigger: scanTriggerValidator,
});

export const scanSummaryValidator = v.object({
  errorCount: v.number(),
  failCount: v.number(),
  finishedAt: v.union(v.string(), v.null()),
  id: v.string(),
  passCount: v.number(),
  score: v.union(v.number(), v.null()),
  startedAt: v.string(),
  status: scanStatusValidator,
  trigger: scanTriggerValidator,
});

export const latestCompleteScanValidator = v.union(
  v.object({
    finishedAt: v.union(v.string(), v.null()),
    score: v.union(v.number(), v.null()),
  }),
  v.null()
);

export const dueEntitlementRowValidator = v.object({
  businessExternalId: v.string(),
  id: v.id("entitlements"),
  nextScanAt: v.union(v.string(), v.null()),
});

export const userSummaryValidator = v.object({
  createdAt: v.string(),
  email: v.string(),
  id: v.string(),
});

export const accountReportPlanValidator = v.union(
  v.literal("preview"),
  v.literal("once"),
  v.literal("monthly")
);

export const accountReportValidator = v.object({
  id: v.string(),
  lastScan: v.union(
    v.object({
      finishedAt: v.union(v.string(), v.null()),
      score: v.union(v.number(), v.null()),
    }),
    v.null()
  ),
  name: v.string(),
  nextScanAt: v.union(v.string(), v.null()),
  plan: accountReportPlanValidator,
  unlocked: v.boolean(),
});
