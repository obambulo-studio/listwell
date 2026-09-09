import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  entitlementKindValidator,
  entitlementStatusValidator,
  locationValidator,
  scanStatusValidator,
  scanTriggerValidator,
} from "./lib/validators";

export default defineSchema({
  businesses: defineTable({
    category: v.string(),
    createdAt: v.string(),
    deliverooUrl: v.optional(v.string()),
    doorDashUrl: v.optional(v.string()),
    externalId: v.string(),
    facebookUsername: v.optional(v.string()),
    instagramUsername: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    locations: v.array(locationValidator),
    menulogUrl: v.optional(v.string()),
    name: v.string(),
    tiktokUsername: v.optional(v.string()),
    uberEatsUrl: v.optional(v.string()),
    updatedAt: v.string(),
    userId: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    xUsername: v.optional(v.string()),
    youtubeUrl: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_userId", ["userId"]),

  entitlements: defineTable({
    businessExternalId: v.string(),
    createdAt: v.string(),
    kind: entitlementKindValidator,
    nextScanAt: v.optional(v.string()),
    polarOrderId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    status: entitlementStatusValidator,
    updatedAt: v.string(),
    userId: v.optional(v.string()),
  })
    .index("by_businessExternalId", ["businessExternalId"])
    .index("by_userId", ["userId"])
    .index("by_polarOrderId", ["polarOrderId"])
    .index("by_polarSubscriptionId", ["polarSubscriptionId"])
    .index("by_status_and_nextScanAt", ["status", "nextScanAt"]),

  scans: defineTable({
    businessExternalId: v.string(),
    createdAt: v.string(),
    error: v.optional(v.string()),
    errorCount: v.number(),
    failCount: v.number(),
    finishedAt: v.optional(v.string()),
    passCount: v.number(),
    resultsJson: v.optional(v.string()),
    score: v.optional(v.number()),
    startedAt: v.string(),
    status: scanStatusValidator,
    trigger: scanTriggerValidator,
  }).index("by_businessExternalId", ["businessExternalId"]),
});
