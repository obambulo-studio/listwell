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
  analyticsCheckoutPlanSchema.parse(analyticsBandById(bandId).entitlementKind);

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

/** Included on every account before a paid band is required. */
export const ANALYTICS_FREE_EVENTS_PER_MONTH = 5000;

/** Free allowance, or the active band cap. Paid caps are the account total, not extra on top of the free events. */
export const analyticsMonthlyAllowance = (
  kind: AnalyticsEntitlementKind | null
): number =>
  kind
    ? analyticsBandByEntitlementKind(kind).eventLimitPerMonth
    : ANALYTICS_FREE_EVENTS_PER_MONTH;

export const highestAnalyticsEntitlementKind = (
  kinds: readonly AnalyticsEntitlementKind[]
): AnalyticsEntitlementKind | null => {
  let best: AnalyticsEntitlementKind | null = null;
  for (const kind of kinds) {
    const parsed = analyticsEntitlementKindSchema.parse(kind);
    if (
      !best ||
      analyticsMonthlyAllowance(parsed) > analyticsMonthlyAllowance(best)
    ) {
      best = parsed;
    }
  }
  return best;
};

export const analyticsEventDecision = (input: {
  enabled: boolean;
  eventCount: number;
  kind: AnalyticsEntitlementKind | null;
}): "accept" | "disabled" | "over_quota" => {
  if (!input.enabled) {
    return "disabled";
  }
  const allowance = analyticsMonthlyAllowance(input.kind);
  if (input.eventCount >= allowance) {
    return "over_quota";
  }
  return "accept";
};

const analyticsHomeFromBand = analyticsBandById("10k");
const analyticsHomeToBand = analyticsBandById("1m");

/** Homepage `#pricing` add-on row. List prices stay in {@link ANALYTICS_BANDS}. */
export const ANALYTICS_HOME_ADDON_PRICING = {
  features: [
    "Turn counting on for each site you want included",
    "Events add up across your account",
    `First ${formatEventLimit(ANALYTICS_FREE_EVENTS_PER_MONTH)} events each month are free`,
  ],
  lede: "Pageview tracking for the sites you turn on. You pay only after the free allowance, for the band that covers your account total.",
  name: "Web analytics",
  priceCadence: "events each month, then the band you use",
  priceFrom: `${formatEventLimit(ANALYTICS_FREE_EVENTS_PER_MONTH)} free`,
  priceNote: `Then ${analyticsHomeFromBand.displayPrice}–${analyticsHomeToBand.displayPrice}, GST inclusive`,
} as const;
