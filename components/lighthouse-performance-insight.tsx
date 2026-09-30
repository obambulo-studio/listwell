import type { ReactNode } from "react";

import {
  formatMsForDisplay,
  lcpBucket,
  lcpToDisplayScore,
  scoreRingTone,
} from "@/lib/performance-insight";
import type { ParsedPerformanceLabel } from "@/lib/performance-insight";

export interface LighthousePerformanceInsightProps {
  caption?: string;
  parsed: ParsedPerformanceLabel;
  status: "pass" | "fail" | "error" | "running" | "queued";
}

const ringColors = {
  average: "var(--orange)",
  good: "var(--green)",
  poor: "var(--red)",
} as const;

const bucketColors = {
  good: "var(--green)",
  "needs-improvement": "var(--orange)",
  poor: "var(--red)",
} as const;

const trackColor = "var(--line)";

const metricBarSegmentIds = [
  "metric-bar-0",
  "metric-bar-1",
  "metric-bar-2",
  "metric-bar-3",
  "metric-bar-4",
  "metric-bar-5",
  "metric-bar-6",
  "metric-bar-7",
  "metric-bar-8",
  "metric-bar-9",
] as const;

const ScoreRing = ({ score }: { score: number }) => {
  const tone = scoreRingTone(score);
  const color = ringColors[tone];
  const size = 56;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ height: size, width: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute font-semibold tabular-nums"
        style={{ color, fontSize: "18px" }}
      >
        {score}
      </span>
    </div>
  );
};

const metricBarFill = (bucket: keyof typeof bucketColors): number => {
  if (bucket === "good") {
    return 4;
  }
  if (bucket === "needs-improvement") {
    return 7;
  }
  return 10;
};

const MetricBar = ({ bucket }: { bucket: keyof typeof bucketColors }) => {
  const fill = metricBarFill(bucket);
  return (
    <div
      className="flex h-1 w-16 shrink-0 gap-px overflow-hidden rounded-sm"
      aria-hidden
    >
      {metricBarSegmentIds.map((id, index) => (
        <span
          key={id}
          className="h-full flex-1 rounded-[1px]"
          style={{
            backgroundColor: index >= fill ? trackColor : bucketColors[bucket],
          }}
        />
      ))}
    </div>
  );
};

export const LighthousePerformanceInsight = ({
  caption,
  parsed,
  status,
}: LighthousePerformanceInsightProps) => {
  if (status === "running" || status === "queued") {
    return (
      <div className="lighthouse-insight font-mono text-[11.5px]">
        <p className="text-ink-3">
          {status === "running" ? "Measuring load…" : "Queued for speed test"}
        </p>
      </div>
    );
  }

  const { lcpMs } = parsed;
  const hasMetric = lcpMs !== undefined && parsed.timingKind !== "none";
  const score = hasMetric ? lcpToDisplayScore(lcpMs) : undefined;
  const bucket = hasMetric ? lcpBucket(lcpMs) : undefined;
  const metricLabel =
    parsed.timingKind === "load"
      ? "Load event end"
      : "Largest Contentful Paint";

  let scoreRing: ReactNode = null;
  if (score !== undefined) {
    scoreRing = <ScoreRing score={score} />;
  }

  return (
    <section
      className="lighthouse-insight bg-surface text-ink rounded-card shadow-hairline overflow-hidden"
      aria-label="Lighthouse-style performance summary"
    >
      <div className="bg-inset border-line flex items-center gap-2 border-b px-3 py-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2L4 20h16L12 2z"
            stroke="var(--orange)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M12 9v4M12 16h.01"
            stroke="var(--orange)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[12px] font-medium">Performance</span>
        <span className="text-ink-3 ml-auto font-mono text-[11px]">
          Lab test
        </span>
      </div>

      <div className="flex gap-4 p-3">
        {scoreRing}
        <div className="min-w-0 flex-1">
          <p className="text-ink-3 mb-2 text-[11.5px] font-medium">Metrics</p>
          {hasMetric && bucket ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-2 min-w-0 text-[12px] leading-snug">
                {metricLabel}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <MetricBar bucket={bucket} />
                <span
                  className="font-mono text-[11.5px] font-medium tabular-nums"
                  style={{ color: bucketColors[bucket] }}
                >
                  {formatMsForDisplay(lcpMs)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-ink-2 text-[12px] leading-snug">
              {caption ?? "No timing data from this run."}
            </p>
          )}
        </div>
      </div>

      {caption && !hasMetric ? (
        <p className="border-line text-ink-3 border-t px-3 py-2 text-[11.5px] leading-snug">
          {caption}
        </p>
      ) : null}
      {hasMetric && caption?.includes("This is") ? (
        <p className="border-line text-ink-3 border-t px-3 py-2 text-[11.5px] leading-snug">
          {caption.slice(caption.indexOf("This is"))}
        </p>
      ) : null}
    </section>
  );
};
