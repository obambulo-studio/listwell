import { renderScanReadyEmail } from "../emails/scan-ready";
import {
  citationCount,
  formatCount,
  mapPackCellTotal,
  phraseCellCount,
  positionChangeSentence,
  reviewGainSentence,
} from "./research-report";
import {
  ORGANIC_RANK_DROP_ALERT_PLACES,
  SCORE_DROP_ALERT_POINTS,
} from "./scan-config";
import type { PeriodSummaryPayload } from "./seo-schema";

export interface ScanCheckResult {
  label?: string;
  value: boolean | null;
}

export interface ScanSnapshot {
  results: Record<string, ScanCheckResult> | null;
  score: number | null;
}

export type ScanEmailKind = "monthly_summary" | "score_alert";

export interface ScanEmailBusiness {
  businessId: string;
  businessName: string;
  finishedAt: string | null;
  /** Complete scan immediately before this one, if any. */
  previousScore: number | null;
  score: number | null;
}

const scanMonthFormat = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  timeZone: "Australia/Sydney",
});

export const formatScanMonth = (iso: string | null): string | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return scanMonthFormat.format(date);
};

const scanMonthFromBusinesses = (
  businesses: readonly ScanEmailBusiness[]
): string | null => {
  for (const business of businesses) {
    const month = formatScanMonth(business.finishedAt);
    if (month) {
      return month;
    }
  }
  return null;
};

export const scanScoreSummary = (score: number | null): string =>
  score === null
    ? "Visibility score not available yet."
    : `Visibility score: ${score}%`;

export type VisibilityScoreTrendDirection = "down" | "same" | "up";

export interface VisibilityScoreTrend {
  arrow: string;
  direction: VisibilityScoreTrendDirection;
  label: string;
}

const visibilityTrendUpArrow = "\u2191";
const visibilityTrendDownArrow = "\u2193";
const visibilityTrendFlatArrow = "\u2192";

export const formatVisibilityScoreTrendPlain = (
  trend: VisibilityScoreTrend
): string =>
  trend.arrow.length > 0 ? `${trend.arrow} ${trend.label}` : trend.label;

export const visibilityScoreTrend = (
  score: number | null,
  previousScore: number | null
): VisibilityScoreTrend | null => {
  if (score === null) {
    return null;
  }
  if (previousScore === null) {
    return null;
  }
  const delta = score - previousScore;
  if (delta === 0) {
    return {
      arrow: visibilityTrendFlatArrow,
      direction: "same",
      label: "Same as last month.",
    };
  }
  const points = Math.abs(delta);
  const unit = points === 1 ? "point" : "points";
  if (delta > 0) {
    return {
      arrow: visibilityTrendUpArrow,
      direction: "up",
      label: `Up ${points} ${unit} from last month.`,
    };
  }
  return {
    arrow: visibilityTrendDownArrow,
    direction: "down",
    label: `Down ${points} ${unit} from last month.`,
  };
};

export const visibilityScoreTrendLine = (
  score: number | null,
  previousScore: number | null
): string | null => {
  const trend = visibilityScoreTrend(score, previousScore);
  return trend ? formatVisibilityScoreTrendPlain(trend) : null;
};

export interface ScanEmailContent {
  html: string;
  listUnsubscribeUrl: string;
  subject: string;
  text: string;
}

export const newlyBrokenChecks = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot
): string[] => {
  if (!previous?.results || !current.results) {
    return [];
  }
  const broken: string[] = [];
  for (const [id, result] of Object.entries(current.results)) {
    if (result.value !== false) {
      continue;
    }
    const prior = previous.results[id];
    if (!prior || prior.value !== false) {
      broken.push(id);
    }
  }
  return broken;
};

export const scoreDelta = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot
): number | null => {
  if (previous?.score === null || previous?.score === undefined) {
    return null;
  }
  if (current.score === null || current.score === undefined) {
    return null;
  }
  return current.score - previous.score;
};

export interface ScanEmailResearch {
  competitorNames: Record<string, string>;
  current: PeriodSummaryPayload | null;
  phraseLabels: Record<string, string>;
  previous: PeriodSummaryPayload | null;
}

const phraseLabel = (research: ScanEmailResearch, phraseId: string): string =>
  research.phraseLabels[phraseId] ?? "a saved phrase";

const phraseIds = (
  previous: PeriodSummaryPayload | null,
  current: PeriodSummaryPayload | null
): string[] => {
  const ids: string[] = [];
  const seenIds = new Set<string>();
  for (const summary of [previous, current]) {
    for (const phraseId of Object.keys(summary?.organicPosition ?? {})) {
      if (!seenIds.has(phraseId)) {
        seenIds.add(phraseId);
        ids.push(phraseId);
      }
    }
    for (const phrases of Object.values(summary?.gridTop3Count ?? {})) {
      for (const phraseId of Object.keys(phrases)) {
        if (!seenIds.has(phraseId)) {
          seenIds.add(phraseId);
          ids.push(phraseId);
        }
      }
    }
  }
  return ids;
};

const competitorIds = (
  previous: PeriodSummaryPayload | null,
  current: PeriodSummaryPayload | null
): string[] => {
  const ids: string[] = [];
  const seenIds = new Set<string>();
  for (const summary of [previous, current]) {
    for (const placeId of Object.keys(summary?.competitors ?? {})) {
      if (!seenIds.has(placeId)) {
        seenIds.add(placeId);
        ids.push(placeId);
      }
    }
  }
  return ids;
};

const rankAndPackAlerts = (research: ScanEmailResearch): string[] => {
  const lines: string[] = [];
  for (const phraseId of phraseIds(research.previous, research.current)) {
    const before = phraseCellCount(research.previous?.gridTop3Count, phraseId);
    const after = phraseCellCount(research.current?.gridTop3Count, phraseId);
    if (before !== undefined && before > 0 && after === 0) {
      lines.push(
        `'${phraseLabel(research, phraseId)}' lost all of its map-pack cells.`
      );
    }
    const earlier = research.previous?.organicPosition?.[phraseId];
    const later = research.current?.organicPosition?.[phraseId];
    const dropped =
      earlier !== undefined &&
      later !== undefined &&
      later - earlier >= ORGANIC_RANK_DROP_ALERT_PLACES;
    if (dropped) {
      lines.push(
        `'${phraseLabel(research, phraseId)}' fell from position ${earlier} to position ${later}.`
      );
    }
  }
  return lines;
};

const competitorPassed = (
  beforeSelf: number | undefined,
  afterSelf: number | undefined,
  beforeComp: number | undefined,
  afterComp: number | undefined
): boolean =>
  beforeSelf !== undefined &&
  afterSelf !== undefined &&
  beforeComp !== undefined &&
  afterComp !== undefined &&
  beforeComp <= beforeSelf &&
  afterComp > afterSelf;

const competitorPassAlerts = (research: ScanEmailResearch): string[] => {
  const lines: string[] = [];
  for (const placeId of competitorIds(research.previous, research.current)) {
    const name = research.competitorNames[placeId] ?? "A competitor";
    for (const phraseId of phraseIds(research.previous, research.current)) {
      if (
        competitorPassed(
          phraseCellCount(research.previous?.gridTop3Count, phraseId),
          phraseCellCount(research.current?.gridTop3Count, phraseId),
          research.previous?.competitors?.[placeId]?.gridTop3Count?.[phraseId],
          research.current?.competitors?.[placeId]?.gridTop3Count?.[phraseId]
        )
      ) {
        lines.push(
          `${name} now holds more map-pack cells than you for '${phraseLabel(research, phraseId)}'.`
        );
      }
    }
  }
  return lines;
};

export const researchAlertLines = (research: ScanEmailResearch): string[] => [
  ...rankAndPackAlerts(research),
  ...competitorPassAlerts(research),
];

const countChange = (
  label: string,
  previous: number | undefined,
  current: number | undefined
): string | null => {
  if (current === undefined) {
    return null;
  }
  if (previous === undefined) {
    return `${label}: ${formatCount(current)}. No previous month yet.`;
  }
  const delta = current - previous;
  if (delta === 0) {
    return `${label}: ${formatCount(current)}. No change since last month.`;
  }
  const direction = delta > 0 ? "up" : "down";
  return `${label}: ${formatCount(current)}, ${direction} ${formatCount(Math.abs(delta))} since last month.`;
};

const pushLine = (lines: string[], line: string | null): void => {
  if (line) {
    lines.push(line);
  }
};

const organicChangeLines = (research: ScanEmailResearch): string[] => {
  const lines: string[] = [];
  for (const phraseId of phraseIds(research.previous, research.current)) {
    const earlier = research.previous?.organicPosition?.[phraseId];
    const later = research.current?.organicPosition?.[phraseId];
    if (later === undefined) {
      continue;
    }
    const label = phraseLabel(research, phraseId);
    if (earlier === undefined) {
      lines.push(
        `'${label}' organic position: ${later}. No previous month yet.`
      );
      continue;
    }
    lines.push(
      `'${label}' organic position: ${later}, ${positionChangeSentence(earlier, later)}.`
    );
  }
  return lines;
};

const cellsTakenLines = (research: ScanEmailResearch): string[] => {
  const lines: string[] = [];
  for (const placeId of competitorIds(research.previous, research.current)) {
    const name = research.competitorNames[placeId] ?? "A competitor";
    for (const phraseId of phraseIds(research.previous, research.current)) {
      const beforeSelf = phraseCellCount(
        research.previous?.gridTop3Count,
        phraseId
      );
      const afterSelf = phraseCellCount(
        research.current?.gridTop3Count,
        phraseId
      );
      const beforeComp =
        research.previous?.competitors?.[placeId]?.gridTop3Count?.[phraseId];
      const afterComp =
        research.current?.competitors?.[placeId]?.gridTop3Count?.[phraseId];
      const tookCells =
        beforeSelf !== undefined &&
        afterSelf !== undefined &&
        beforeComp !== undefined &&
        afterComp !== undefined &&
        afterComp > beforeComp &&
        afterSelf < beforeSelf;
      if (tookCells) {
        lines.push(
          `${name} took map-pack cells from you for '${phraseLabel(research, phraseId)}'.`
        );
      }
    }
  }
  return lines;
};

export const researchChangeLines = (research: ScanEmailResearch): string[] => {
  const lines: string[] = [];
  pushLine(
    lines,
    countChange(
      "Reviews",
      research.previous?.reviewCount,
      research.current?.reviewCount
    )
  );
  pushLine(
    lines,
    countChange(
      "Map-pack cells",
      mapPackCellTotal(research.previous?.gridTop3Count),
      mapPackCellTotal(research.current?.gridTop3Count)
    )
  );
  lines.push(...organicChangeLines(research));
  pushLine(
    lines,
    countChange(
      "AI Overview citations",
      citationCount(research.previous?.aiOverview),
      citationCount(research.current?.aiOverview)
    )
  );
  pushLine(
    lines,
    reviewGainSentence({
      competitors: competitorIds(research.previous, research.current).map(
        (placeId) => ({
          current: research.current?.competitors?.[placeId]?.reviewCount,
          name: research.competitorNames[placeId] ?? "A competitor",
          previous: research.previous?.competitors?.[placeId]?.reviewCount,
        })
      ),
      selfCurrent: research.current?.reviewCount,
      selfPrevious: research.previous?.reviewCount,
    })
  );
  lines.push(...cellsTakenLines(research));
  return lines;
};

export const pickScanEmailKind = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot,
  research?: ScanEmailResearch | null
): ScanEmailKind => {
  const delta = scoreDelta(previous, current);
  const broken = newlyBrokenChecks(previous, current);
  const visibility = research ? researchAlertLines(research) : [];
  if (
    broken.length > 0 ||
    (delta !== null && delta <= -SCORE_DROP_ALERT_POINTS) ||
    visibility.length > 0
  ) {
    return "score_alert";
  }
  return "monthly_summary";
};

const scanEmailSubject = (businesses: readonly ScanEmailBusiness[]): string => {
  const month = scanMonthFromBusinesses(businesses);
  if (businesses.length === 1) {
    const name = businesses[0]?.businessName ?? "your business";
    if (month) {
      return `Listwell · ${month} scan — ${name}`;
    }
    return `Listwell · Scan ready — ${name}`;
  }
  if (month) {
    return `Listwell · ${month} scans — ${businesses.length} businesses`;
  }
  return `Listwell · Scans ready — ${businesses.length} businesses`;
};

const scanEmailPreheader = (
  businesses: readonly ScanEmailBusiness[]
): string => {
  if (businesses.length === 1) {
    const [business] = businesses;
    const name = business?.businessName ?? "your business";
    if (business?.score !== null && business?.score !== undefined) {
      return `${name} scored ${business.score}% on the latest Listwell scan.`;
    }
    return `Your Listwell scan is ready for ${name}.`;
  }
  return `Your Listwell scans are ready for ${businesses.length} businesses.`;
};

const scanEmailText = (input: {
  businesses: readonly ScanEmailBusiness[];
  profileUrl: (businessId: string) => string;
  unsubscribeUrl: string;
}): string => {
  const intro =
    input.businesses.length === 1
      ? "Your monthly Listwell scan is ready."
      : "Your monthly Listwell scans are ready.";
  const profileLines = input.businesses
    .map((business) => {
      const trend = visibilityScoreTrend(
        business.score,
        business.previousScore
      );
      const trendPlain = trend ? formatVisibilityScoreTrendPlain(trend) : null;
      const lines = [
        business.businessName,
        scanScoreSummary(business.score),
        trendPlain,
        input.profileUrl(business.businessId),
      ].filter((line) => line !== null);
      return lines.join("\n");
    })
    .join("\n\n");
  return `${intro}\n\n${profileLines}\n\nEmail preferences: ${input.unsubscribeUrl}`;
};

export const buildScanEmail = (input: {
  businesses: readonly ScanEmailBusiness[];
  listUnsubscribeUrl?: string;
  siteUrl: string;
  unsubscribeUrl: string;
}): ScanEmailContent => {
  if (!input.unsubscribeUrl.trim()) {
    throw new Error("unsubscribeUrl is required for scan emails");
  }
  if (input.businesses.length === 0) {
    throw new Error("At least one business is required for scan emails");
  }
  const listUnsubscribeUrl =
    input.listUnsubscribeUrl?.trim() || input.unsubscribeUrl;
  const siteBase = input.siteUrl.replace(/\/$/u, "");
  const profileUrl = (businessId: string) => `${siteBase}/${businessId}`;
  const scanMonthLabel = scanMonthFromBusinesses(input.businesses);
  const businesses = input.businesses.map((business) => ({
    businessId: business.businessId,
    businessName: business.businessName,
    profileUrl: profileUrl(business.businessId),
    scoreSummary: scanScoreSummary(business.score),
    scoreTrend: visibilityScoreTrend(business.score, business.previousScore),
  }));
  const preheader = scanEmailPreheader(input.businesses);
  return {
    html: renderScanReadyEmail({
      businesses,
      preheader,
      scanMonthLabel,
      siteUrl: siteBase,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    listUnsubscribeUrl,
    subject: scanEmailSubject(input.businesses),
    text: scanEmailText({
      businesses: input.businesses,
      profileUrl,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
};
