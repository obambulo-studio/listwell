import { v } from "convex/values";

export const locationValidator = v.object({
  address: v.optional(v.string()),
  appleMapsId: v.optional(v.string()),
  googlePlaceId: v.optional(v.string()),
  name: v.optional(v.string()),
});

export const entitlementKindValidator = v.union(
  v.literal("report_once"),
  v.literal("report_monthly")
);

export const entitlementStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const scanTriggerValidator = v.union(
  v.literal("baseline"),
  v.literal("schedule")
);

export const scanStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("error")
);
