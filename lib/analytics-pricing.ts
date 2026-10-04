import { z } from "zod";

export const analyticsBandIdSchema = z.enum(["10k", "100k", "1m"]);
export type AnalyticsBandId = z.infer<typeof analyticsBandIdSchema>;

export const analyticsEntitlementKindSchema = z.enum([
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);
export type AnalyticsEntitlementKind = z.infer<
  typeof analyticsEntitlementKindSchema
>;

export interface AnalyticsBandConfig {
  bandId: AnalyticsBandId;
  displayPrice: string;
  entitlementKind: AnalyticsEntitlementKind;
  eventLimitPerMonth: number;
  polarEnvKey: string;
}

/** GST-inclusive AUD list prices. Change amounts here, not in UI copy. */
export const ANALYTICS_BANDS: readonly AnalyticsBandConfig[] = [
  {
    bandId: "10k",
    displayPrice: "A$9/mo",
    entitlementKind: "analytics_10k",
    eventLimitPerMonth: 10_000,
    polarEnvKey: "POLAR_PRODUCT_ANALYTICS_10K",
  },
  {
    bandId: "100k",
    displayPrice: "A$19/mo",
    entitlementKind: "analytics_100k",
    eventLimitPerMonth: 100_000,
    polarEnvKey: "POLAR_PRODUCT_ANALYTICS_100K",
  },
  {
    bandId: "1m",
    displayPrice: "A$49/mo",
    entitlementKind: "analytics_1m",
    eventLimitPerMonth: 1_000_000,
    polarEnvKey: "POLAR_PRODUCT_ANALYTICS_1M",
  },
] as const;

export const analyticsBandById = (
  bandId: AnalyticsBandId
): AnalyticsBandConfig => {
  const band = ANALYTICS_BANDS.find((row) => row.bandId === bandId);
  if (!band) {
    throw new Error(`Unknown analytics band: ${bandId}`);
  }
  return band;
};

export const analyticsBandByEntitlementKind = (
  kind: AnalyticsEntitlementKind
): AnalyticsBandConfig => {
  const band = ANALYTICS_BANDS.find((row) => row.entitlementKind === kind);
  if (!band) {
    throw new Error(`Unknown analytics entitlement kind: ${kind}`);
  }
  return band;
};

export const analyticsCheckoutPlanSchema = z.enum([
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);
export type AnalyticsCheckoutPlan = z.infer<typeof analyticsCheckoutPlanSchema>;

export const analyticsCheckoutPlanFromBand = (
  bandId: AnalyticsBandId
): AnalyticsCheckoutPlan =>
  analyticsCheckoutPlanSchema.parse(
    analyticsBandById(bandId).entitlementKind
  );

export const isAnalyticsEntitlementKind = (
  kind: string
): kind is AnalyticsEntitlementKind =>
  analyticsEntitlementKindSchema.safeParse(kind).success;

export const isAnalyticsCheckoutPlan = (
  plan: string
): plan is AnalyticsCheckoutPlan =>
  analyticsCheckoutPlanSchema.safeParse(plan).success;

export const formatEventLimit = (limit: number): string =>
  new Intl.NumberFormat("en-AU").format(limit);
