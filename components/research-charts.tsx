"use client";

import {
  Bar,
  BarChart,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer } from "@/components/reui/chart";
import {
  aiOverviewBars,
  phraseMetricBars,
  radarRows,
} from "@/lib/research-report";
import type { RadarSeriesInput } from "@/lib/research-report";
import type { ResearchView } from "@/lib/research-view";

const INK = "var(--ink)";
const ACCENT = "var(--accent)";
const INK_3 = "var(--ink-3)";
const RADAR_COLORS = [INK, ACCENT, INK_3, "var(--green)", "var(--orange)"];

const chartRows = (
  rows: ReturnType<typeof radarRows>
): Record<string, string | number>[] =>
  rows.map((row) => ({ axis: row.axis, ...row.values }));

export const ResearchMonthCharts = ({
  names,
  nowMs,
  radarSeries,
  reducedMotion,
  view,
}: {
  names: Record<string, string>;
  nowMs: number;
  radarSeries: RadarSeriesInput[];
  reducedMotion: boolean;
  view: ResearchView;
}) => {
  const newest = view.periods.at(-1);
  const bars = phraseMetricBars(view.keywords?.keywords ?? []);
  const overview = aiOverviewBars(
    newest?.payload.aiOverview,
    view.phraseLabels
  );
  const radar = radarRows(radarSeries, nowMs);
  const radarData = chartRows(radar);
  const radarIds = radarSeries.map((series) => series.id);

  return (
    <div className="flex flex-col gap-6">
      {bars.length > 0 ? (
        <div>
          <h3 className="text-ink font-medium">Volume and difficulty</h3>
          <p className="listwell-panel__note">
            Search volume is national, for Australia, not your suburb.
            Difficulty describes the market and has no good or bad direction.
          </p>
          <div className="listwell-research-chart">
            <ChartContainer label="National search volume and difficulty">
              <BarChart data={bars}>
                <XAxis dataKey="phrase" tick={{ fill: INK_3, fontSize: 12 }} />
                <YAxis tick={{ fill: INK_3, fontSize: 12 }} yAxisId="volume" />
                <YAxis
                  domain={[0, 100]}
                  orientation="right"
                  tick={{ fill: INK_3, fontSize: 12 }}
                  yAxisId="difficulty"
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="volume"
                  fill={INK}
                  isAnimationActive={!reducedMotion}
                  name="National volume"
                  yAxisId="volume"
                />
                <Bar
                  dataKey="difficulty"
                  fill={ACCENT}
                  isAnimationActive={!reducedMotion}
                  name="Difficulty"
                  yAxisId="difficulty"
                />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      ) : null}
      {radarData.length > 0 ? (
        <div>
          <h3 className="text-ink font-medium">You and two competitors</h3>
          <p className="listwell-panel__note">
            Review count, rating, how recent the latest sampled review is, and
            how often the owner replies. A missing sample is left off the chart.
          </p>
          <div className="listwell-research-chart">
            <ChartContainer label="Review comparison">
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--line-strong)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: INK_3, fontSize: 12 }}
                />
                <PolarRadiusAxis stroke={INK_3} />
                <Legend />
                {radarIds.map((id, index) => (
                  <Radar
                    dataKey={id}
                    fill={RADAR_COLORS[index % RADAR_COLORS.length]}
                    fillOpacity={0.15}
                    isAnimationActive={!reducedMotion}
                    key={id}
                    name={names[id] ?? id}
                    stroke={RADAR_COLORS[index % RADAR_COLORS.length]}
                  />
                ))}
              </RadarChart>
            </ChartContainer>
          </div>
        </div>
      ) : null}
      {overview.length > 0 ? (
        <div>
          <h3 className="text-ink font-medium">AI Overview</h3>
          <p className="listwell-panel__note">
            Cited, not cited, or no AI Overview. One bar per saved phrase.
          </p>
          <div className="listwell-research-chart">
            <ChartContainer label="AI Overview outcomes">
              <BarChart data={overview}>
                <XAxis dataKey="phrase" tick={{ fill: INK_3, fontSize: 12 }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: INK_3, fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="cited"
                  fill={INK}
                  isAnimationActive={!reducedMotion}
                  name="Cited"
                />
                <Bar
                  dataKey="notCited"
                  fill={ACCENT}
                  isAnimationActive={!reducedMotion}
                  name="Not cited"
                />
                <Bar
                  dataKey="none"
                  fill={INK_3}
                  isAnimationActive={!reducedMotion}
                  name="No overview"
                />
              </BarChart>
            </ChartContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
};
