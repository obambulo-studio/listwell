"use client";

import { Liveline } from "liveline";
import { useEffect, useState } from "react";

import { ResearchMonthCharts } from "@/components/research-charts";
import {
  changeSentence,
  citationCount,
  competitorTrendSeries,
  formatCount,
  formatPeriodMonth,
  gridCellSeries,
  livelineScrubEnabled,
  livelineWindowSeconds,
  mapPackCellTotal,
  newestSummaryValue,
  organicPositionSeries,
  periodTime,
  positionChangeSentence,
  reviewGainSentence,
  singleMetricSeries,
} from "@/lib/research-report";
import type { LivelinePoint, TrendSeries } from "@/lib/research-report";
import type { ResearchPeriod, ResearchView } from "@/lib/research-view";
import type { PeriodSummaryPayload } from "@/lib/seo-schema";

const SERIES_COLORS = [
  "var(--ink)",
  "var(--accent)",
  "var(--green)",
  "var(--orange)",
  "var(--ink-2)",
];

const LOADED_AT_SECONDS = Math.floor(Date.now() / 1000);

const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
};

const useDarkChart = (): boolean => {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributeFilter: ["class"], attributes: true });
    return () => observer.disconnect();
  }, []);
  return dark;
};

const TrendLine = ({
  formatValue,
  height,
  momentum,
  points,
  series,
}: {
  formatValue: (value: number) => string;
  height: number;
  momentum: boolean;
  points: LivelinePoint[];
  series?: TrendSeries[];
}) => {
  const reduced = useReducedMotion();
  const dark = useDarkChart();
  const now = LOADED_AT_SECONDS;
  const drawn = series ?? [{ id: "value", label: "Value", points }];
  const scrub = livelineScrubEnabled(points);
  const last = points.at(-1)?.value ?? drawn[0]?.points.at(-1)?.value ?? 0;
  return (
    <div className="listwell-research-chart" style={{ height }}>
      <Liveline
        badgeVariant="minimal"
        data={points}
        emptyText="No previous month yet"
        formatTime={formatPeriodMonth}
        formatValue={formatValue}
        momentum={momentum && points.length > 1}
        paused={reduced}
        pulse={!reduced}
        scrub={scrub}
        series={
          series
            ? series.map((item, index) => ({
                color:
                  SERIES_COLORS[index % SERIES_COLORS.length] ?? "var(--ink)",
                data: item.points,
                id: item.id,
                label: item.label,
                value: item.points.at(-1)?.value ?? 0,
              }))
            : undefined
        }
        theme={dark ? "dark" : "light"}
        value={last}
        window={livelineWindowSeconds(
          drawn.flatMap((item) => item.points),
          now
        )}
      />
    </div>
  );
};

const HistoryTable = ({
  rows,
}: {
  rows: { change: string; date: string; value: string }[];
}) => {
  if (rows.length === 0) {
    return null;
  }
  return (
    <table className="listwell-panel__table listwell-research-table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Value</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.date}-${row.value}`}>
            <td>{row.date}</td>
            <td>{row.value}</td>
            <td>{row.change}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const datedRows = (
  periods: readonly ResearchPeriod[],
  read: (payload: PeriodSummaryPayload) => number | undefined,
  format: (value: number) => string,
  unit: string
): { change: string; date: string; value: string }[] => {
  const rows: { change: string; date: string; value: string }[] = [];
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index];
    const previous = index > 0 ? periods[index - 1] : undefined;
    if (!period) {
      continue;
    }
    const value = read(period.payload);
    if (value === undefined) {
      continue;
    }
    const prior = previous ? read(previous.payload) : undefined;
    const time = periodTime(period.periodStart);
    rows.push({
      change:
        prior === undefined
          ? "No previous month yet."
          : changeSentence(value - prior, unit),
      date: time === null ? period.periodStart : formatPeriodMonth(time),
      value: format(value),
    });
  }
  return rows;
};

const pinTotal = (
  payload: PeriodSummaryPayload,
  pinId: string | null
): number | undefined => {
  const grid = payload.gridTop3Count;
  if (!grid) {
    return undefined;
  }
  if (pinId && grid[pinId]) {
    return mapPackCellTotal({ current: grid[pinId] });
  }
  if (!pinId && Object.keys(grid).length === 1) {
    return mapPackCellTotal(grid);
  }
  return undefined;
};

const MetricBlock = ({
  format,
  label,
  periods,
  read,
  unit,
}: {
  format: (value: number) => string;
  label: string;
  periods: readonly ResearchPeriod[];
  read: (payload: PeriodSummaryPayload) => number | undefined;
  unit: string;
}) => {
  const dated = periods.map((period) => {
    const value = read(period.payload);
    return value === undefined
      ? { periodStart: period.periodStart }
      : { periodStart: period.periodStart, value };
  });
  const latest = newestSummaryValue(dated);
  const series = singleMetricSeries(periods, read, label, label);
  if (!latest && series.points.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-ink font-medium">{label}</h3>
      {latest ? (
        <>
          <p className="text-ink m-0 text-3xl font-semibold tracking-tight">
            {format(latest.value)}
          </p>
          <p className="listwell-panel__note">
            {changeSentence(latest.delta, unit)}
          </p>
          <TrendLine
            formatValue={format}
            height={72}
            momentum
            points={series.points}
          />
        </>
      ) : (
        <p className="listwell-panel__note">No previous month yet.</p>
      )}
      <TrendLine
        formatValue={format}
        height={220}
        momentum
        points={series.points}
      />
      <HistoryTable rows={datedRows(periods, read, format, unit)} />
    </section>
  );
};

const positionTable = (
  periods: readonly ResearchPeriod[],
  phraseId: string
): { change: string; date: string; value: string }[] => {
  const rows: { change: string; date: string; value: string }[] = [];
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const period = periods[index];
    const previous = index > 0 ? periods[index - 1] : undefined;
    if (!period) {
      continue;
    }
    const value = period.payload.organicPosition?.[phraseId];
    if (value === undefined) {
      continue;
    }
    const prior = previous?.payload.organicPosition?.[phraseId];
    const time = periodTime(period.periodStart);
    rows.push({
      change:
        prior === undefined
          ? "No previous month yet."
          : positionChangeSentence(prior, value),
      date: time === null ? period.periodStart : formatPeriodMonth(time),
      value: String(value),
    });
  }
  return rows;
};

const CompareChart = ({
  format,
  label,
  series,
}: {
  format: (value: number) => string;
  label: string;
  series: TrendSeries[];
}) => {
  if (!series.some((item) => item.points.length > 0)) {
    return null;
  }
  return (
    <section>
      <h3 className="text-ink font-medium">{label}</h3>
      <TrendLine
        formatValue={format}
        height={220}
        momentum
        points={series[0]?.points ?? []}
        series={series}
      />
    </section>
  );
};

const definedNumber = (value: number | null | undefined): number | undefined =>
  value === null ? undefined : value;

const radarSeriesFor = (
  businessName: string,
  view: ResearchView,
  newest: ResearchPeriod | undefined
): {
  id: string;
  latestReviewAt?: string;
  name: string;
  rating?: number;
  replyRate?: number;
  reviewCount?: number;
}[] => {
  const self = view.reviewGap?.rows.find((row) => row.isSelf);
  const rows = [
    {
      id: "you",
      latestReviewAt: self?.latestReviewAt ?? undefined,
      name: businessName,
      rating: definedNumber(newest?.payload.rating),
      replyRate: definedNumber(
        self?.ownerReplyRate ?? newest?.payload.ownerReplyRate
      ),
      reviewCount: definedNumber(newest?.payload.reviewCount),
    },
    ...view.currentCompetitorIds.slice(0, 2).map((placeId) => {
      const row = view.reviewGap?.rows.find((item) => item.placeId === placeId);
      const competitor = newest?.payload.competitors?.[placeId];
      return {
        id: placeId,
        latestReviewAt: row?.latestReviewAt ?? undefined,
        name: view.competitorNames[placeId] ?? "Competitor",
        rating: definedNumber(competitor?.rating ?? row?.rating),
        replyRate: definedNumber(row?.ownerReplyRate),
        reviewCount: definedNumber(competitor?.reviewCount ?? row?.reviewCount),
      };
    }),
  ];
  return rows.flatMap((series) => {
    const next: {
      id: string;
      latestReviewAt?: string;
      name: string;
      rating?: number;
      replyRate?: number;
      reviewCount?: number;
    } = { id: series.id, name: series.name };
    if (series.latestReviewAt) {
      next.latestReviewAt = series.latestReviewAt;
    }
    if (series.rating !== undefined) {
      next.rating = series.rating;
    }
    if (series.replyRate !== undefined) {
      next.replyRate = series.replyRate;
    }
    if (series.reviewCount !== undefined) {
      next.reviewCount = series.reviewCount;
    }
    return [next];
  });
};

export const ResearchHistory = ({
  businessName,
  view,
}: {
  businessName: string;
  view: ResearchView;
}) => {
  const reduced = useReducedMotion();
  const { periods } = view;
  const newest = periods.at(-1);
  const previous = periods.at(-2);
  const gain = reviewGainSentence({
    competitors: view.currentCompetitorIds.map((placeId) => ({
      current: newest?.payload.competitors?.[placeId]?.reviewCount,
      name: view.competitorNames[placeId] ?? "A competitor",
      previous: previous?.payload.competitors?.[placeId]?.reviewCount,
    })),
    selfCurrent: newest?.payload.reviewCount,
    selfPrevious: previous?.payload.reviewCount,
  });
  const organic = organicPositionSeries(periods, view.phrases);
  const grid = gridCellSeries(periods, view.pinId);
  const reviewSeries = competitorTrendSeries(periods, {
    currentPlaceIds: view.currentCompetitorIds,
    metric: "reviewCount",
    names: view.competitorNames,
    selfLabel: businessName,
    selfValue: (payload) => payload.reviewCount,
  });
  const gridSeries = competitorTrendSeries(periods, {
    currentPlaceIds: view.currentCompetitorIds,
    metric: "grid",
    names: view.competitorNames,
    selfLabel: businessName,
    selfValue: (payload) => pinTotal(payload, view.pinId),
  });
  const scoreSeries = competitorTrendSeries(periods, {
    currentPlaceIds: view.currentCompetitorIds,
    metric: "listingScore",
    names: view.competitorNames,
    selfLabel: businessName,
    selfValue: (payload) => payload.listingScore,
  });
  const radarSeries = radarSeriesFor(businessName, view, newest);
  const radarNames: Record<string, string> = { you: businessName };
  for (const series of radarSeries) {
    radarNames[series.id] = series.name;
  }

  return (
    <section
      className="listwell-panel"
      aria-labelledby="research-history-heading"
    >
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="research-history-heading">
          Change over time
        </h2>
      </div>
      <div className="listwell-panel__body flex flex-col gap-8">
        {periods.length < 2 ? (
          <p className="listwell-panel__note">No previous month yet.</p>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3">
          <MetricBlock
            format={(value) => `${value}%`}
            label="Listing score"
            periods={periods}
            read={(payload) => payload.listingScore}
            unit="points"
          />
          <MetricBlock
            format={formatCount}
            label="Reviews"
            periods={periods}
            read={(payload) => payload.reviewCount}
            unit="reviews"
          />
          <MetricBlock
            format={formatCount}
            label="Estimated traffic"
            periods={periods}
            read={(payload) => payload.estimatedTraffic}
            unit="visits"
          />
          <MetricBlock
            format={formatCount}
            label="Referring domains"
            periods={periods}
            read={(payload) => payload.referringDomains}
            unit="domains"
          />
          <MetricBlock
            format={formatCount}
            label="Map-pack cells"
            periods={periods}
            read={(payload) => pinTotal(payload, view.pinId)}
            unit="cells"
          />
          <MetricBlock
            format={formatCount}
            label="AI Overview citations"
            periods={periods}
            read={(payload) => citationCount(payload.aiOverview)}
            unit="citations"
          />
        </div>
        {grid.some((series) => series.points.length > 0) ? (
          <section>
            <h3 className="text-ink font-medium">Map-pack cells</h3>
            <TrendLine
              formatValue={formatCount}
              height={220}
              momentum
              points={grid[0]?.points ?? []}
              series={grid}
            />
          </section>
        ) : null}
        {organic.length > 0 ? (
          <section>
            <h3 className="text-ink font-medium">Organic position</h3>
            <p className="listwell-panel__note">
              A lower position is better. The line rises when the rank improves.
            </p>
            <TrendLine
              formatValue={(value) => String(Math.abs(value))}
              height={220}
              momentum
              points={organic[0]?.points ?? []}
              series={organic}
            />
            {organic.map((series) => (
              <HistoryTable
                key={series.id}
                rows={positionTable(periods, series.id)}
              />
            ))}
          </section>
        ) : null}
        {gain ? <p className="text-ink text-lg font-medium">{gain}</p> : null}
        <div className="grid gap-6 2xl:grid-cols-3">
          <CompareChart
            format={formatCount}
            label="Reviews against competitors"
            series={reviewSeries}
          />
          <CompareChart
            format={formatCount}
            label="Map-pack cells against competitors"
            series={gridSeries}
          />
          <CompareChart
            format={(value) => `${value}%`}
            label="Listing score against competitors"
            series={scoreSeries}
          />
        </div>
        <ResearchMonthCharts
          names={radarNames}
          nowMs={LOADED_AT_SECONDS * 1000}
          radarSeries={radarSeries}
          reducedMotion={reduced}
          view={view}
        />
      </div>
    </section>
  );
};
