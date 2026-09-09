"use client";

import { Liveline } from "liveline";
import type { LivelinePoint, LivelineSeries } from "liveline";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, PointerEvent, ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
 * INSIGHT CARDS
 * Embedded mini-visualizations in an "Insights N ‹ ›"
 * carousel. Autoplay yields as soon as a person uses it.
 * ───────────────────────────────────────────────────────── */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const formatPercent = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const formatMoney = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
/* anchor the snapshot to *call* time (inside each card's mount-time memo) —
 * a module-load constant goes stale, and once the points age past the chart
 * window the canvas renders empty */
const makePoints = (values: number[], gap = 6): LivelinePoint[] => {
  const end = Math.floor(Date.now() / 1000);
  return values.map((value, index) => ({
    time: end - (values.length - 1 - index) * gap,
    value,
  }));
};

/* Catmull-Rom resample — turn a sparse series into a dense, smoothly curved
 * one so both the line and the hover cursor glide instead of stepping between
 * a handful of points. */
const smooth = (values: number[], perSegment = 9): number[] => {
  if (values.length < 3) {
    return [...values];
  }
  const out: number[] = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = values[Math.max(0, i - 1)] ?? 0;
    const p1 = values[i] ?? 0;
    const p2 = values[i + 1] ?? 0;
    const p3 = values[Math.min(n - 1, i + 2)] ?? 0;
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 *
          (2 * p1 +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
      );
    }
  }
  out.push(values[n - 1] ?? 0);
  return out;
};

/* dense, smoothed points spanning exactly `spanSecs` — keeps the chart window
 * unchanged while multiplying the resolution. */
const smoothPoints = (values: number[], spanSecs: number): LivelinePoint[] => {
  const dense = smooth(values);
  return makePoints(dense, spanSecs / (dense.length - 1));
};

const useDarkMode = () => {
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

/* inline @entity mention */
const Entity = ({ name, tone }: { name: string; tone: string }) => (
  <span className="text-ink inline-flex items-center gap-1 align-baseline font-medium">
    <span className={`inline-block size-2.5 rounded-full ${tone}`} />@{name}
  </span>
);

const Mono = ({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "red" | "green";
}) => (
  <code
    className={`font-mono text-[11.5px] ${tone === "red" ? "text-red" : "text-green"}`}
  >
    {children}
  </code>
);

const chartIndexFromPointer = (
  event: PointerEvent<HTMLDivElement>,
  pointCount: number
) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const progress = Math.max(
    0,
    Math.min(1, (event.clientX - rect.left) / rect.width)
  );
  return Math.round(progress * (pointCount - 1));
};

const ChartTooltip = ({
  rows,
}: {
  rows: { label: string; value: string; color: string }[];
}) => (
  <div className="insight-chart-tooltip">
    {rows.map((row) => (
      <span key={row.label} className="insight-chart-tooltip-item">
        <span
          className="insight-chart-tooltip-dot"
          style={{ background: row.color }}
        />
        {row.value}
      </span>
    ))}
  </div>
);

/* content shape for the return-comparison card's two plotted series */
export interface CompareSeries {
  name: string;
  values: number[];
  sub: string;
  tone: "red" | "green";
  dot: string;
  color: string;
  tooltipColor: string;
}

const COMPARE_SERIES: CompareSeries[] = [
  {
    color: "#f68f3c",
    dot: "bg-orange",
    name: "Mint Chip",
    sub: "-$2,377.66",
    tone: "red",
    tooltipColor: "var(--orange)",
    values: [-2.9, -3.4, -3.05, -3.86, -3.52, -4.1, -3.82, -4.41],
  },
  {
    color: "#3d9aff",
    dot: "bg-accent",
    name: "Pistachio",
    sub: "+$617.22",
    tone: "green",
    tooltipColor: "var(--accent)",
    values: [0.22, 0.58, 0.42, 0.91, 0.76, 1.08, 0.96, 1.15],
  },
];

/* 1 — return comparison: 2 series, legend + big deltas + line chart */
const CompareCard = ({
  series = COMPARE_SERIES,
}: {
  series?: CompareSeries[];
}) => {
  const dark = useDarkMode();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const points = useMemo(
    () => series.map((s) => smoothPoints(s.values, 42)),
    [series]
  );
  const pointCount = points[0]?.length ?? 0;

  const chartSeries: LivelineSeries[] = useMemo(
    () =>
      series.map((s, i) => ({
        color: s.color,
        data: points[i] ?? [],
        id: s.name,
        label: "",
        value: points[i]?.at(-1)?.value ?? s.values.at(-1) ?? 0,
      })),
    [series, points]
  );

  return (
    <div className="rounded-card bg-surface shadow-hairline min-h-[278px] p-3">
      <div className="flex items-center gap-4">
        {series.map((s, i) => (
          <div key={s.name} className="flex-1">
            <span className="text-ink-2 flex items-center gap-1.5 text-[11.5px]">
              <span className={`size-2 rounded-full ${s.dot}`} />
              {s.name}
            </span>
            <span
              className={`block text-[17px] font-semibold tracking-[-0.01em] tabular-nums ${s.tone === "red" ? "text-red" : "text-green"}`}
            >
              {formatPercent(points[i]?.at(-1)?.value ?? s.values.at(-1) ?? 0)}
            </span>
            <Mono tone={s.tone}>{s.sub}</Mono>
          </div>
        ))}
      </div>
      <div className="rounded-control bg-inset shadow-hairline mt-2 overflow-hidden">
        <div className="border-line flex items-center justify-between border-b px-2.5 py-1.5">
          <span className="text-ink-3 text-[11px] tabular-nums">
            Trend snapshot
          </span>
          <span className="bg-field text-ink-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium">
            Snapshot
          </span>
        </div>
        <div
          className="insight-chart-stage relative h-[166px]"
          onPointerDown={(event) =>
            setHoverIndex(chartIndexFromPointer(event, pointCount))
          }
          onPointerMove={(event) =>
            setHoverIndex(chartIndexFromPointer(event, pointCount))
          }
          onPointerLeave={() => setHoverIndex(null)}
          onPointerCancel={() => setHoverIndex(null)}
          onPointerUp={() => setHoverIndex(null)}
        >
          <Liveline
            data={[]}
            value={0}
            series={chartSeries}
            theme={dark ? "dark" : "light"}
            grid={false}
            pulse={false}
            window={42}
            paused
            scrub={false}
            cursor="default"
            lineWidth={2.25}
            padding={{ bottom: 22, left: 0, right: 0, top: 40 }}
            formatValue={formatPercent}
          />
          {hoverIndex !== null && (
            <>
              <span
                className="insight-chart-cursor"
                style={{ left: `${(hoverIndex / (pointCount - 1)) * 100}%` }}
              />
              <span
                className="insight-chart-tooltip-anchor"
                style={{
                  left: `${Math.min(Math.max((hoverIndex / (pointCount - 1)) * 100, 28), 72)}%`,
                }}
              >
                <ChartTooltip
                  rows={series.map((s, i) => ({
                    color: s.tooltipColor,
                    label: s.name,
                    value: formatPercent(points[i]?.[hoverIndex]?.value ?? 0),
                  }))}
                />
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* content shape for the anomaly card's two toggled metric series */
export interface AnomalyData {
  spend: number[];
  usage: number[];
}

const ANOMALY_DATA: AnomalyData = {
  spend: [274, 289, 264, 307, 331, 1210, 1718, 2112],
  usage: [18, 19, 17, 21, 22, 58, 81, 96],
};

const formatAnomalyHoverLabel = (
  hoverIndex: number | null,
  threshold: string,
  metric: "spend" | "usage",
  data: LivelinePoint[]
): string => {
  if (hoverIndex === null) {
    return `${threshold} threshold`;
  }
  if (metric === "spend") {
    return formatMoney(data[hoverIndex]?.value ?? 0);
  }
  return `${Math.round(data[hoverIndex]?.value ?? 0)} kWh`;
};

/* 2 — anomaly: bars with threshold + big spent value */
const AnomalyCard = ({
  data: anomaly = ANOMALY_DATA,
}: {
  data?: AnomalyData;
}) => {
  const dark = useDarkMode();
  const [metric, setMetric] = useState<"spend" | "usage">("spend");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const spend = useMemo(() => makePoints(anomaly.spend, 7), [anomaly]);
  const usage = useMemo(() => makePoints(anomaly.usage, 7), [anomaly]);

  const data = metric === "spend" ? spend : usage;
  const value = data.at(-1)?.value ?? (metric === "spend" ? 2112 : 96);
  const threshold = metric === "spend" ? "$2,112" : "82 kWh";
  const moneyLabel = formatMoney(spend.at(-1)?.value ?? 2112);
  const hoverLabel = formatAnomalyHoverLabel(
    hoverIndex,
    threshold,
    metric,
    data
  );

  return (
    <div className="rounded-card bg-surface shadow-hairline min-h-[278px] p-3">
      <div className="flex items-center justify-between">
        <span className="text-ink flex items-center gap-1.5 text-[12px] font-medium">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--red)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          High freezer spend
        </span>
        <span className="bg-field text-ink-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium">
          Snapshot
        </span>
      </div>
      <div className="rounded-control bg-inset shadow-hairline mt-2 overflow-hidden">
        <div className="border-line flex items-center justify-between border-b px-2.5 py-1.5">
          <span className="text-ink-3 text-[11px] tabular-nums">
            {hoverLabel}
          </span>
          <span className="bg-field flex rounded-full p-0.5">
            {(["spend", "usage"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={metric === item}
                onClick={() => setMetric(item)}
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96] ${
                  metric === item
                    ? "bg-surface text-ink shadow-btn"
                    : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {item === "spend" ? "Spend" : "Usage"}
              </button>
            ))}
          </span>
        </div>
        <div
          className="insight-chart-stage relative h-[166px]"
          onPointerDown={(event) =>
            setHoverIndex(chartIndexFromPointer(event, data.length))
          }
          onPointerMove={(event) =>
            setHoverIndex(chartIndexFromPointer(event, data.length))
          }
          onPointerLeave={() => setHoverIndex(null)}
          onPointerCancel={() => setHoverIndex(null)}
          onPointerUp={() => setHoverIndex(null)}
        >
          <Liveline
            data={data}
            value={value}
            theme={dark ? "dark" : "light"}
            color="#ee5c61"
            grid
            scrub={false}
            fill={false}
            pulse={false}
            momentum={false}
            paused
            window={49}
            lineWidth={2.25}
            cursor="crosshair"
            padding={{ bottom: 22, left: 0, right: 0, top: 34 }}
            formatValue={(v) =>
              metric === "spend" ? formatMoney(v) : `${Math.round(v)} kWh`
            }
          />
          {hoverIndex !== null && (
            <>
              <span
                className="insight-chart-cursor"
                style={{ left: `${(hoverIndex / (data.length - 1)) * 100}%` }}
              />
              <span
                className="insight-chart-tooltip-anchor"
                style={{
                  left: `${Math.min(Math.max((hoverIndex / (data.length - 1)) * 100, 28), 72)}%`,
                }}
              >
                <ChartTooltip
                  rows={[
                    {
                      color: "var(--red)",
                      label: metric === "spend" ? "Spend" : "Usage",
                      value:
                        metric === "spend"
                          ? formatMoney(data[hoverIndex]?.value ?? 0)
                          : `${Math.round(data[hoverIndex]?.value ?? 0)} kWh`,
                    },
                  ]}
                />
              </span>
            </>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-ink text-[17px] font-semibold tracking-[-0.01em] tabular-nums">
          {moneyLabel} spent
        </span>
        <Mono tone="red">+$1,834.66</Mono>
        <span className="text-ink-3 text-[11px]">vs 3 months</span>
      </div>
    </div>
  );
};

/* content shape for one allocation segment */
export interface AllocationSegment {
  name: string;
  label: string;
  pct: number;
  amount: string;
  cls: string;
  tone: string;
}

const ALLOCATION_SEGMENTS: AllocationSegment[] = [
  {
    amount: "$51,785",
    cls: "bg-orange",
    label: "Vanilla",
    name: "VAN",
    pct: 72.5,
    tone: "text-orange",
  },
  {
    amount: "$16,278",
    cls: "bg-line-strong",
    label: "Chocolate",
    name: "CHOC",
    pct: 22.8,
    tone: "text-ink-2",
  },
  {
    amount: "$3,357",
    cls: "bg-line",
    label: "Mint",
    name: "MINT",
    pct: 4.7,
    tone: "text-ink-3",
  },
];

/* 3 — allocation: hero number + segmented bar + legend */
const AllocationCard = ({
  segments = ALLOCATION_SEGMENTS,
}: {
  segments?: AllocationSegment[];
}) => {
  const [firstSegment] = segments;
  const [selected, setSelected] = useState(firstSegment?.name ?? "");
  const active =
    segments.find((segment) => segment.name === selected) ?? firstSegment;
  if (!active) {
    return null;
  }

  return (
    <div className="rounded-card bg-surface shadow-hairline min-h-[278px] p-3">
      <span className="text-ink flex items-center gap-1.5 text-[12px] font-medium">
        <span className="bg-orange flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white">
          V
        </span>
        Vanilla allocation
      </span>
      <span className="text-ink mt-1 block text-[20px] font-semibold tracking-[-0.01em] tabular-nums">
        {active.amount}
      </span>
      <fieldset
        className="bg-field m-0 mt-3 flex h-9 min-w-0 gap-0.5 overflow-hidden rounded-full border-0 p-0.5"
        aria-label="Allocation segments"
      >
        {segments.map((s) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={selected === s.name}
            aria-label={`${s.label}: ${s.pct}%`}
            onClick={() => setSelected(s.name)}
            className={`relative h-full overflow-hidden rounded-full ${s.cls} transition-[opacity,transform,box-shadow] duration-300 active:scale-[0.98]`}
            style={{
              boxShadow:
                selected === s.name
                  ? "inset 0 0 0 1px rgba(255,255,255,0.22)"
                  : undefined,
              opacity: selected === s.name ? 1 : 0.58,
              transitionTimingFunction: EASE,
              width: `${s.pct}%`,
            }}
          >
            <span
              className="absolute inset-y-1 left-1 rounded-full bg-white/20 transition-[width,opacity] duration-500"
              style={{
                opacity: selected === s.name ? 1 : 0,
                transitionTimingFunction: EASE,
                width: selected === s.name ? "calc(100% - 8px)" : "0%",
              }}
            />
          </button>
        ))}
      </fieldset>
      <div className="mt-2 flex items-center gap-1.5">
        {segments.map((s) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={selected === s.name}
            onClick={() => setSelected(s.name)}
            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
              selected === s.name
                ? "bg-field text-ink"
                : "text-ink-2 hover:bg-hover hover:text-ink"
            }`}
          >
            <span className={`size-1.5 rounded-full ${s.cls}`} />
            {s.name} <span className="tabular-nums">{s.pct}%</span>
          </button>
        ))}
      </div>
      <div className="rounded-control bg-inset shadow-hairline mt-3 min-h-16 px-2.5 py-2">
        <span className={`block text-[11.5px] font-medium ${active.tone}`}>
          {active.label}
        </span>
        <span className="text-ink-3 mt-1 block text-[11px] leading-relaxed">
          Contribution snapshot across current inventory value. Segment
          selection changes the inspected group without moving the card.
        </span>
      </div>
    </div>
  );
};

/* content shape for one insight page in the carousel */
export interface InsightPage {
  key: string;
  prose: ReactNode;
  Card: ComponentType;
  pill: string;
}

const PAGES: InsightPage[] = [
  {
    Card: CompareCard,
    key: "compare",
    pill: "Should I rebalance flavors?",
    prose: (
      <>
        The worst performer in your <Entity name="Creamery" tone="bg-orange" />{" "}
        is Rocky Road, down <Mono tone="red">-6%</Mono> or{" "}
        <Mono tone="red">-$2,453.44</Mono>.
      </>
    ),
  },
  {
    Card: AnomalyCard,
    key: "anomaly",
    pill: "Get tips on cutting freezer costs",
    prose: (
      <>
        Unusually high freezer bill on{" "}
        <span className="text-ink font-medium">Dec 13</span>,{" "}
        <Mono tone="red">+$1,834.66</Mono> above your average.
      </>
    ),
  },
  {
    Card: AllocationCard,
    key: "allocation",
    pill: "If we look at seasonals, what changes?",
    prose: (
      <>
        You’re heavily invested in <Entity name="Vanilla" tone="bg-orange" />.
        It’s <span className="text-ink font-medium">72.5%</span> of your case.
      </>
    ),
  },
];

export interface InsightCardsLabels {
  /** carousel heading shown before the page count */
  title: string;
}

const DEFAULT_INSIGHT_LABELS: InsightCardsLabels = {
  title: "Insights",
};

const InsightCards = ({
  pages = PAGES,
  labels,
}: {
  variant?: string;
  pages?: InsightPage[];
  labels?: Partial<InsightCardsLabels>;
} = {}) => {
  const l = { ...DEFAULT_INSIGHT_LABELS, ...labels };
  const [page, setPage] = useState(0);

  const move = (direction: -1 | 1) => {
    setPage((current) => (current + direction + pages.length) % pages.length);
  };

  const currentPage = pages[page];
  if (!currentPage) {
    return null;
  }
  const { prose, Card, pill } = currentPage;

  return (
    <div className="min-h-[408px] w-full max-w-86">
      {/* pager header */}
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-1.5">
          <span className="text-ink text-[13px] font-semibold">{l.title}</span>
          <span className="text-ink-3 text-[13px] tabular-nums">
            {pages.length}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          {(["M15 18l-6-6 6-6", "M9 6l6 6-6 6"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-label={
                d === "M15 18l-6-6 6-6" ? "Previous insight" : "Next insight"
              }
              onClick={() => move(d === "M15 18l-6-6 6-6" ? -1 : 1)}
              className="text-ink-3 hover:bg-hover hover:text-ink flex size-6 items-center justify-center rounded-[6px] transition-[background-color,color,transform] duration-100 active:scale-[0.96]"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={d} />
              </svg>
            </button>
          ))}
        </span>
      </div>

      {/* page content — blurred crossfade */}
      <div
        className="transition-[opacity,filter] duration-250"
        style={{ filter: "blur(0)", opacity: 1 }}
      >
        <p className="text-ink-2 mt-1.5 text-[12.5px] leading-relaxed">
          {prose}
        </p>
        <div className="mt-2">
          <Card />
        </div>
        <button
          type="button"
          className="bg-surface text-ink shadow-btn hover:bg-hover mt-2 rounded-full px-3 py-1.5 text-left text-[12px] transition-colors duration-100"
        >
          {pill}
        </button>
      </div>
    </div>
  );
};

export default InsightCards;
