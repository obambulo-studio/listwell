export const SEO_OBSERVATION_KINDS = [
  "rank_grid",
  "organic_serp",
  "keyword_metrics",
  "review_sample",
  "gbp_posts_qa",
  "domain_overview",
  "backlinks",
  "link_gap",
  "review_gap",
  "link_prospects",
  "ai_mention",
  "competitor_snapshot",
  "next_fix",
  "period_summary",
] as const;
export type SeoObservationKind = (typeof SEO_OBSERVATION_KINDS)[number];

export const SEO_OBSERVATION_STATUSES = [
  "queued",
  "complete",
  "skipped",
  "error",
] as const;
export type SeoObservationStatus = (typeof SEO_OBSERVATION_STATUSES)[number];

export const SEO_SKIP_REASONS = [
  "allowance",
  "ceiling",
  "no_website",
  "basics_failed",
  "no_phrases",
  "no_pin",
  "no_api_key",
] as const;
export type SeoSkipReason = (typeof SEO_SKIP_REASONS)[number];

export const SEO_COMPETITOR_SOURCES = ["pinned", "map_pack", "nearby"] as const;
export type SeoCompetitorSource = (typeof SEO_COMPETITOR_SOURCES)[number];

export const MAX_SEARCH_PHRASES = 3;
export const MAX_COMPETITORS = 4;
export const MAX_HIDDEN_COMPETITORS = 50;

/** Starting allowance per business per scan period. DataForSEO bills USD. */
export const SEO_ALLOWANCE_CAP_USD_MICROS = 750_000;

/** Convex documents are capped at 1 MiB; leave room for the other fields. */
export const SEO_PAYLOAD_MAX_BYTES = 900_000;

const USD_MICROS = 1_000_000;

export const usdToMicros = (usd: number): number =>
  Math.max(0, Math.round(usd * USD_MICROS));

export const microsToUsd = (micros: number): number => micros / USD_MICROS;

/** Calendar month (UTC) that holds the global ceiling, as `YYYY-MM`. */
export const spendMonth = (date: Date): string =>
  date.toISOString().slice(0, 7);

export const payloadByteLength = (payloadJson: string): number =>
  new TextEncoder().encode(payloadJson).length;

export type SpendDecision =
  | { ok: true }
  | { ok: false; reason: "allowance" | "ceiling" };

/** The global ceiling wins over the business cap so the Worker can log it. */
export const decideSpend = (input: {
  capUsdMicros: number;
  ceilingUsdMicros: number;
  estimateUsdMicros: number;
  monthSpentUsdMicros: number;
  spentUsdMicros: number;
}): SpendDecision => {
  if (
    input.monthSpentUsdMicros + input.estimateUsdMicros >
    input.ceilingUsdMicros
  ) {
    return { ok: false, reason: "ceiling" };
  }
  if (input.spentUsdMicros + input.estimateUsdMicros > input.capUsdMicros) {
    return { ok: false, reason: "allowance" };
  }
  return { ok: true };
};

/** Monthly and yearly checkouts both grant `report_monthly`. */
export const entitlementAllowsResearch = (
  rows: readonly { kind: string; status: string }[]
): boolean =>
  rows.some((row) => row.status === "active" && row.kind === "report_monthly");
