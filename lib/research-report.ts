import type {
  AiOverviewStatus,
  PeriodSummaryPayload,
  SeoSkipReason,
} from "./seo-schema";

export const CONTINUED_REPORT_COPY =
  "Continued reports include the phrase grid, research, and monthly change.";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_SECONDS = (30 * DAY_MS) / 1000;

export interface NextFixCheck {
  id: string;
  peerValues: readonly (boolean | null)[];
  subjectValue: boolean | null;
  title: string;
}

export interface NextFixChoice {
  checkId: string;
  competitorCount: number;
  competitorPassCount: number;
  title: string;
}

/** One action. Prefers a check this business fails while two competitors pass. */
export const pickNextFix = (
  checks: readonly NextFixCheck[]
): NextFixChoice | null => {
  let preferred: NextFixChoice | null = null;
  let fallback: NextFixChoice | null = null;
  for (const check of checks) {
    if (check.subjectValue !== false) {
      continue;
    }
    let passes = 0;
    for (const value of check.peerValues) {
      if (value === true) {
        passes += 1;
      }
    }
    const choice: NextFixChoice = {
      checkId: check.id,
      competitorCount: check.peerValues.length,
      competitorPassCount: passes,
      title: check.title,
    };
    if (passes >= 2 && preferred === null) {
      preferred = choice;
    }
    if (fallback === null) {
      fallback = choice;
    }
  }
  return preferred ?? fallback;
};

/** `none` and `not_cited` are different outcomes. */
export const aiOverviewCopy = (status: AiOverviewStatus): string => {
  if (status === "none") {
    return "Google showed no AI Overview for this search";
  }
  if (status === "not_cited") {
    return "The AI Overview did not cite you";
  }
  return "The AI Overview cited you";
};

export const skipReasonCopy = (reason: SeoSkipReason): string => {
  switch (reason) {
    case "allowance": {
      return "The research allowance for this scan is used. This step runs again on the next scan.";
    }
    case "basics_failed": {
      return "Listing basics come first. Posts and Q&A run after the listing, category, hours, photos, rating, and review count checks pass.";
    }
    case "ceiling": {
      return "Research is paused because the monthly ceiling has been reached.";
    }
    case "no_api_key": {
      return "Research is not configured on this environment.";
    }
    case "no_phrases": {
      return "This step needs saved search phrases.";
    }
    case "no_pin": {
      return "This step needs a map pin.";
    }
    case "no_website": {
      return "This step needs a website on the listing.";
    }
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
};

export const NOT_RUN_COPY = "This step has not run for this scan yet.";

export interface DatedValue {
  periodStart: string;
  value?: number;
}

export interface LivelinePoint {
  time: number;
  value: number;
}

export const periodTime = (periodStart: string): number | null => {
  const parsed = Date.parse(periodStart);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
};

/** Missing values are left out. A skipped step is never plotted as zero. */
export const livelinePoints = (
  periods: readonly DatedValue[]
): LivelinePoint[] => {
  const points: LivelinePoint[] = [];
  for (const period of periods) {
    if (period.value === undefined) {
      continue;
    }
    const time = periodTime(period.periodStart);
    if (time === null) {
      continue;
    }
    points.push({ time, value: period.value });
  }
  return points;
};

/** Lower rank is better, so the line plots the negative and rises when rank improves. */
export const positionPlotValue = (position: number): number => -position;

export const positionPoints = (
  periods: readonly { periodStart: string; position?: number }[]
): LivelinePoint[] =>
  livelinePoints(
    periods.map((period) =>
      period.position === undefined
        ? { periodStart: period.periodStart }
        : {
            periodStart: period.periodStart,
            value: positionPlotValue(period.position),
          }
    )
  );

export const positionChangeSentence = (
  earlier: number,
  later: number
): string => {
  const places = earlier - later;
  if (places === 0) {
    return "No change";
  }
  const count = Math.abs(places);
  const noun = count === 1 ? "place" : "places";
  return places > 0 ? `${count} ${noun} higher` : `${count} ${noun} lower`;
};

/** Null until two stored values exist. The first period has no delta. */
export const metricDelta = (periods: readonly DatedValue[]): number | null => {
  const present: number[] = [];
  for (const period of periods) {
    if (period.value !== undefined) {
      present.push(period.value);
    }
  }
  const previous = present.at(-2);
  const current = present.at(-1);
  if (previous === undefined || current === undefined || present.length < 2) {
    return null;
  }
  return current - previous;
};

/**
 * Liveline hover interpolates between times. A gap larger than a second would
 * show a value that was never stored, so scrub stays off for monthly points.
 */
export const livelineScrubEnabled = (
  points: readonly { time: number }[]
): boolean => {
  if (points.length < 2) {
    return false;
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }
    if (current.time - previous.time > 1) {
      return false;
    }
  }
  return true;
};

export const livelineWindowSeconds = (
  points: readonly { time: number }[],
  nowSeconds: number
): number => {
  let earliest = nowSeconds;
  for (const point of points) {
    if (point.time < earliest) {
      earliest = point.time;
    }
  }
  return Math.max(nowSeconds - earliest + DAY_MS / 1000, MONTH_SECONDS);
};

const periodMonthFormat = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  timeZone: "Australia/Sydney",
  year: "numeric",
});

const checkedDateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "long",
  timeZone: "Australia/Sydney",
  year: "numeric",
});

const countFormat = new Intl.NumberFormat("en-AU");

export const formatPeriodMonth = (unixSeconds: number): string =>
  periodMonthFormat.format(new Date(unixSeconds * 1000));

export const formatCheckedDate = (iso: string): string =>
  checkedDateFormat.format(new Date(iso));

export const formatCount = (value: number): string => countFormat.format(value);

export const changeSentence = (delta: number | null, unit: string): string => {
  if (delta === null) {
    return "No previous month yet.";
  }
  if (delta === 0) {
    return "No change since last month.";
  }
  const direction = delta > 0 ? "Up" : "Down";
  return `${direction} ${formatCount(Math.abs(delta))} ${unit} since last month.`;
};

export const mapPackCellTotal = (
  grid: PeriodSummaryPayload["gridTop3Count"]
): number | undefined => {
  if (!grid) {
    return undefined;
  }
  let total = 0;
  let found = false;
  for (const phrases of Object.values(grid)) {
    for (const count of Object.values(phrases)) {
      total += count;
      found = true;
    }
  }
  return found ? total : undefined;
};

export const phraseCellCount = (
  grid: PeriodSummaryPayload["gridTop3Count"],
  phraseId: string
): number | undefined => {
  if (!grid) {
    return undefined;
  }
  let total = 0;
  let found = false;
  for (const phrases of Object.values(grid)) {
    const count = phrases[phraseId];
    if (count === undefined) {
      continue;
    }
    total += count;
    found = true;
  }
  return found ? total : undefined;
};

export const citationCount = (
  overview?: PeriodSummaryPayload["aiOverview"]
): number | undefined => {
  if (!overview) {
    return undefined;
  }
  let cited = 0;
  for (const status of Object.values(overview)) {
    if (status === "cited") {
      cited += 1;
    }
  }
  return cited;
};

const gainWords = (gain: number, name: string): string => {
  if (gain > 0) {
    return `${name} gained ${formatCount(gain)} reviews this month.`;
  }
  if (gain < 0) {
    return `${name} lost ${formatCount(Math.abs(gain))} reviews this month.`;
  }
  return `${name} had no change in reviews this month.`;
};

export const reviewGainSentence = (input: {
  competitors: readonly {
    current?: number;
    name: string;
    previous?: number;
  }[];
  selfCurrent?: number;
  selfPrevious?: number;
}): string | null => {
  if (input.selfCurrent === undefined || input.selfPrevious === undefined) {
    return null;
  }
  let best: { gain: number; name: string } | null = null;
  for (const competitor of input.competitors) {
    if (competitor.current === undefined || competitor.previous === undefined) {
      continue;
    }
    const gain = competitor.current - competitor.previous;
    if (best === null || gain > best.gain) {
      best = { gain, name: competitor.name };
    }
  }
  if (best === null) {
    return null;
  }
  const selfGain = input.selfCurrent - input.selfPrevious;
  return `${gainWords(best.gain, best.name)} ${gainWords(selfGain, "You")}`;
};

export const hostFromUrl = (
  value: string | null | undefined
): string | null => {
  if (!value) {
    return null;
  }
  const withScheme = value.includes("://") ? value : `https://${value}`;
  try {
    return new URL(withScheme).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return null;
  }
};

export const positionForHost = (
  results: readonly {
    domain: string | null;
    position: number;
    url: string | null;
  }[],
  website: string | null
): number | undefined => {
  const host = hostFromUrl(website);
  if (!host) {
    return undefined;
  }
  for (const result of results) {
    const resultHost = hostFromUrl(result.url) ?? hostFromUrl(result.domain);
    if (resultHost === host) {
      return result.position;
    }
  }
  return undefined;
};

const placeKey = (id: string): string => id.trim().replace(/^places\//u, "");

export const cellsHeldInGrid = (
  cells: readonly { top: readonly { placeId: string | null }[] }[],
  placeId: string
): number => {
  const key = placeKey(placeId);
  let count = 0;
  for (const cell of cells) {
    const held = cell.top.some(
      (place) => place.placeId !== null && placeKey(place.placeId) === key
    );
    if (held) {
      count += 1;
    }
  }
  return count;
};

export interface TrendSeries {
  id: string;
  label: string;
  points: LivelinePoint[];
}

export const singleMetricSeries = (
  periods: readonly { payload: PeriodSummaryPayload; periodStart: string }[],
  read: (payload: PeriodSummaryPayload) => number | undefined,
  id: string,
  label: string
): TrendSeries => ({
  id,
  label,
  points: livelinePoints(
    periods.map((period) => {
      const value = read(period.payload);
      return value === undefined
        ? { periodStart: period.periodStart }
        : { periodStart: period.periodStart, value };
    })
  ),
});

export const gridCellSeries = (
  periods: readonly { payload: PeriodSummaryPayload; periodStart: string }[],
  currentPinId: string | null
): TrendSeries[] => {
  const pinIds: string[] = [];
  const seenPinIds = new Set<string>();
  for (const period of periods) {
    for (const pinId of Object.keys(period.payload.gridTop3Count ?? {})) {
      if (!seenPinIds.has(pinId)) {
        seenPinIds.add(pinId);
        pinIds.push(pinId);
      }
    }
  }
  return pinIds.map((pinId) => ({
    id: pinId,
    label:
      currentPinId === pinId || (currentPinId === null && pinIds.length === 1)
        ? "Map-pack cells"
        : "No longer tracked",
    points: livelinePoints(
      periods.map((period) => {
        const phrases = period.payload.gridTop3Count?.[pinId];
        if (!phrases) {
          return { periodStart: period.periodStart };
        }
        let total = 0;
        let found = false;
        for (const count of Object.values(phrases)) {
          total += count;
          found = true;
        }
        return found
          ? { periodStart: period.periodStart, value: total }
          : { periodStart: period.periodStart };
      })
    ),
  }));
};

export const organicPositionSeries = (
  periods: readonly { payload: PeriodSummaryPayload; periodStart: string }[],
  phrases: readonly { id: string; text: string }[]
): TrendSeries[] => {
  const ids: string[] = phrases.map((phrase) => phrase.id);
  const labels = new Map(phrases.map((phrase) => [phrase.id, phrase.text]));
  const seenIds = new Set(ids);
  for (const period of periods) {
    for (const phraseId of Object.keys(period.payload.organicPosition ?? {})) {
      if (!seenIds.has(phraseId)) {
        seenIds.add(phraseId);
        ids.push(phraseId);
      }
    }
  }
  const current = new Set(phrases.map((phrase) => phrase.id));
  const series: TrendSeries[] = [];
  for (const phraseId of ids) {
    const points = positionPoints(
      periods.map((period) => {
        const position = period.payload.organicPosition?.[phraseId];
        return position === undefined
          ? { periodStart: period.periodStart }
          : { periodStart: period.periodStart, position };
      })
    );
    if (points.length === 0) {
      continue;
    }
    const name = labels.get(phraseId);
    let label = "No longer tracked";
    if (current.has(phraseId)) {
      label = name ?? phraseId;
    } else if (name) {
      label = `${name}, no longer tracked`;
    }
    series.push({ id: phraseId, label, points });
  }
  return series;
};

const competitorMetric = (
  competitor: NonNullable<PeriodSummaryPayload["competitors"]>[string],
  metric: "grid" | "listingScore" | "reviewCount"
): number | undefined => {
  if (metric === "reviewCount") {
    return competitor.reviewCount;
  }
  if (metric === "listingScore") {
    return competitor.listingScore;
  }
  return mapPackCellTotal(
    competitor.gridTop3Count ? { pack: competitor.gridTop3Count } : undefined
  );
};

export const competitorTrendSeries = (
  periods: readonly { payload: PeriodSummaryPayload; periodStart: string }[],
  input: {
    currentPlaceIds: readonly string[];
    metric: "grid" | "listingScore" | "reviewCount";
    names: Readonly<Record<string, string>>;
    selfLabel: string;
    selfValue: (payload: PeriodSummaryPayload) => number | undefined;
  }
): TrendSeries[] => {
  const placeIds = [...input.currentPlaceIds];
  const seenPlaceIds = new Set(placeIds);
  for (const period of periods) {
    for (const placeId of Object.keys(period.payload.competitors ?? {})) {
      if (!seenPlaceIds.has(placeId)) {
        seenPlaceIds.add(placeId);
        placeIds.push(placeId);
      }
    }
  }
  const current = new Set(input.currentPlaceIds);
  const series: TrendSeries[] = [
    singleMetricSeries(periods, input.selfValue, "self", input.selfLabel),
  ];
  for (const placeId of placeIds) {
    const name = input.names[placeId] ?? "Competitor";
    const points = livelinePoints(
      periods.map((period) => {
        const competitor = period.payload.competitors?.[placeId];
        if (!competitor) {
          return { periodStart: period.periodStart };
        }
        const value = competitorMetric(competitor, input.metric);
        return value === undefined
          ? { periodStart: period.periodStart }
          : { periodStart: period.periodStart, value };
      })
    );
    if (points.length === 0) {
      continue;
    }
    series.push({
      id: placeId,
      label: current.has(placeId) ? name : `${name}, no longer compared`,
      points,
    });
  }
  return series.filter((item) => item.points.length > 0);
};

export interface RadarSeriesInput {
  id: string;
  latestReviewAt?: string;
  name: string;
  rating?: number;
  replyRate?: number;
  reviewCount?: number;
}

export interface RadarRow {
  axis: string;
  values: Record<string, number>;
}

const recencyScore = (iso: string, nowMs: number): number | undefined => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return undefined;
  }
  const days = Math.max(0, Math.floor((nowMs - at) / DAY_MS));
  return Math.max(0, 100 - days);
};

/** Axes with no stored value are omitted. A missing reply rate is not zero. */
export const radarRows = (
  series: readonly RadarSeriesInput[],
  nowMs: number
): RadarRow[] => {
  const rows: RadarRow[] = [];
  const reviewValues: Record<string, number> = {};
  let reviewMax = 0;
  for (const item of series) {
    if (item.reviewCount === undefined) {
      continue;
    }
    reviewValues[item.id] = item.reviewCount;
    if (item.reviewCount > reviewMax) {
      reviewMax = item.reviewCount;
    }
  }
  if (Object.keys(reviewValues).length > 0 && reviewMax > 0) {
    const values: Record<string, number> = {};
    for (const [id, count] of Object.entries(reviewValues)) {
      values[id] = Math.round((count / reviewMax) * 100);
    }
    rows.push({ axis: "Reviews", values });
  }
  const rating: Record<string, number> = {};
  for (const item of series) {
    if (item.rating !== undefined) {
      rating[item.id] = Math.round((item.rating / 5) * 100);
    }
  }
  if (Object.keys(rating).length > 0) {
    rows.push({ axis: "Rating", values: rating });
  }
  const recency: Record<string, number> = {};
  for (const item of series) {
    if (!item.latestReviewAt) {
      continue;
    }
    const score = recencyScore(item.latestReviewAt, nowMs);
    if (score !== undefined) {
      recency[item.id] = score;
    }
  }
  if (Object.keys(recency).length > 0) {
    rows.push({ axis: "Recency", values: recency });
  }
  const replies: Record<string, number> = {};
  for (const item of series) {
    if (item.replyRate !== undefined) {
      replies[item.id] = Math.round(item.replyRate * 100);
    }
  }
  if (Object.keys(replies).length > 0) {
    rows.push({ axis: "Owner replies", values: replies });
  }
  return rows;
};

export interface PhraseBar {
  difficulty?: number;
  phrase: string;
  volume?: number;
}

export const phraseMetricBars = (
  keywords: readonly {
    keyword: string;
    keywordDifficulty: number | null;
    phraseId: string;
    searchVolume: number | null;
  }[]
): PhraseBar[] => {
  const bars: PhraseBar[] = [];
  for (const keyword of keywords) {
    const bar: PhraseBar = { phrase: keyword.keyword };
    if (keyword.searchVolume !== null) {
      bar.volume = keyword.searchVolume;
    }
    if (keyword.keywordDifficulty !== null) {
      bar.difficulty = keyword.keywordDifficulty;
    }
    if (bar.volume !== undefined || bar.difficulty !== undefined) {
      bars.push(bar);
    }
  }
  return bars;
};

export interface AiOverviewBar {
  cited: number;
  none: number;
  notCited: number;
  phrase: string;
}

export const aiOverviewBars = (
  overview: PeriodSummaryPayload["aiOverview"],
  labels: Readonly<Record<string, string>>
): AiOverviewBar[] => {
  if (!overview) {
    return [];
  }
  const bars: AiOverviewBar[] = [];
  for (const [phraseId, status] of Object.entries(overview)) {
    bars.push({
      cited: status === "cited" ? 1 : 0,
      none: status === "none" ? 1 : 0,
      notCited: status === "not_cited" ? 1 : 0,
      phrase: labels[phraseId] ?? phraseId,
    });
  }
  return bars;
};

export const newestSummaryValue = (
  periods: readonly DatedValue[]
): { delta: number | null; value: number } | null => {
  const newest = periods.at(-1);
  if (!newest || newest.value === undefined) {
    return null;
  }
  return { delta: metricDelta(periods), value: newest.value };
};
