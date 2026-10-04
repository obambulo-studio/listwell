import { v } from "convex/values";

import {
  SEO_OBSERVATION_KINDS,
  SEO_OBSERVATION_STATUSES,
  SEO_SKIP_REASONS,
} from "./seo";

export const locationValidator = v.object({
  address: v.optional(v.string()),
  appleMapsId: v.optional(v.string()),
  googlePlaceId: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  name: v.optional(v.string()),
  pinId: v.optional(v.string()),
});

export const searchPhraseValidator = v.object({
  id: v.string(),
  suggested: v.boolean(),
  text: v.string(),
});

export const pinnedCompetitorValidator = v.object({
  placeId: v.string(),
  source: v.literal("pinned"),
});

export const entitlementKindValidator = v.union(
  v.literal("report_once"),
  v.literal("report_monthly"),
  v.literal("analytics_10k"),
  v.literal("analytics_100k"),
  v.literal("analytics_1m")
);

export const entitlementStatusValidator = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const scanTriggerValidator = v.union(
  v.literal("baseline"),
  v.literal("schedule"),
  v.literal("rescan")
);

export const scanStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("error")
);

export const seoObservationKindValidator = v.union(
  ...SEO_OBSERVATION_KINDS.map((kind) => v.literal(kind))
);

export const seoObservationStatusValidator = v.union(
  ...SEO_OBSERVATION_STATUSES.map((status) => v.literal(status))
);

export const seoSkipReasonValidator = v.union(
  ...SEO_SKIP_REASONS.map((reason) => v.literal(reason))
);

export const seoCacheStatusValidator = v.union(
  v.literal("running"),
  v.literal("complete"),
  v.literal("error")
);
