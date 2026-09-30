"use client";

import { useEffect, useState } from "react";

import { LighthousePerformanceInsight } from "@/components/lighthouse-performance-insight";
import type { ParsedPerformanceLabel } from "@/lib/performance-insight";

/* ─────────────────────────────────────────────────────────
 * TASK ROWS
 *
 *     0ms   rows enter staggered (80ms apart)
 *   600ms   row 1 ring sweeps 0 → 66%
 *  1500ms   row 1 expands — detail steps drop down
 *  3900ms   row 1 collapses; row 2 flips to Failed + retry
 *  5300ms   row 2 resolves to Completed
 * The status run completes once; task details stay clickable.
 * ───────────────────────────────────────────────────────── */

const TICKS = [600, 900, 2400, 1400, 2400, 600];

const useTick = (intervals: number[]) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick >= intervals.length - 1) {
      return;
    }
    const t = setTimeout(() => setTick((x) => x + 1), intervals[tick]);
    return () => clearTimeout(t);
  }, [tick, intervals]);
  return tick;
};

const SpinnerRing = ({
  active,
  children,
  size = "default",
}: {
  active?: boolean;
  children?: React.ReactNode;
  size?: "default" | "sm";
}) => {
  const px = size === "sm" ? 16 : 24;
  const stroke = size === "sm" ? 1.5 : 2;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ height: px, width: px }}
    >
      <svg
        width={px}
        height={px}
        className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {active && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="text-ink relative text-[10.5px] font-semibold tabular-nums">
        {children}
      </span>
    </span>
  );
};

const badgeToneClass = (tone: "red" | "green" | "grey"): string => {
  if (tone === "red") {
    return "bg-red";
  }
  if (tone === "grey") {
    return "bg-ink-3";
  }
  return "bg-green";
};

const Badge = ({
  children,
  size = "default",
  tone,
}: {
  children: React.ReactNode;
  size?: "default" | "sm";
  tone: "red" | "green" | "grey";
}) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-full text-white ${size === "sm" ? "size-4" : "size-5.5"} ${badgeToneClass(tone)}`}
    style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
  >
    {children}
  </span>
);

const iconSize = (size: "default" | "sm") => (size === "sm" ? 9 : 12);

const XIcon = ({ size = "default" }: { size?: "default" | "sm" }) => (
  <svg
    width={iconSize(size)}
    height={iconSize(size)}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
  >
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const DashIcon = ({ size = "default" }: { size?: "default" | "sm" }) => (
  <svg
    width={iconSize(size)}
    height={iconSize(size)}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
  >
    <path d="M5 12h14" />
  </svg>
);
const ExternalLinkIcon = () => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 17L17 7M17 7h-6M17 7v6" />
  </svg>
);

const CheckIcon = ({ size = "default" }: { size?: "default" | "sm" }) => (
  <svg
    width={size === "sm" ? 9 : 13}
    height={size === "sm" ? 9 : 13}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const RetryIcon = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);

export interface TaskDetailInsight {
  caption?: string;
  kind: "lighthouse-performance";
  parsed: ParsedPerformanceLabel;
  status: "pass" | "fail" | "error" | "running" | "queued";
}

/* One detail line shown when a task row is expanded. */
export interface TaskDetail {
  checkCaption?: string;
  href?: string;
  label: string;
  meta: string;
  insight?: TaskDetailInsight;
}

export interface TaskDetailSection {
  title: string;
  details: TaskDetail[];
}

/* A single task row.
 *  - "done"     → green check badge + completed pill (static)
 *  - "running"  → active spinner showing `step`, no pill (static)
 *  - "pending"  → inactive spinner, waiting to start (static)
 *  - "sequence" → animation-driven: pending spinner → failed → completed
 */
export interface TaskRow {
  key: string;
  label: string;
  amount: string;
  status: "done" | "running" | "pending" | "sequence" | "skipped";
  step?: number;
  details: TaskDetail[];
  detailSections?: TaskDetailSection[];
  expandable?: boolean;
}

export interface TaskRowsLabels {
  completed: string;
  failed: string;
}

const DEFAULT_LABELS: TaskRowsLabels = {
  completed: "Completed",
  failed: "Failed",
};

const CHECK_DETAIL_STATUSES = new Set([
  "pass",
  "fail",
  "error",
  "running",
  "queued",
]);

const DetailMeta = ({ meta }: { meta: string }) => {
  if (meta === "pass") {
    return (
      <span aria-label="Pass" className="inline-flex shrink-0">
        <Badge size="sm" tone="green">
          <CheckIcon size="sm" />
        </Badge>
      </span>
    );
  }
  if (meta === "fail") {
    return (
      <span aria-label="Fail" className="inline-flex shrink-0">
        <Badge size="sm" tone="red">
          <XIcon size="sm" />
        </Badge>
      </span>
    );
  }
  if (meta === "error") {
    return (
      <span aria-label="Could not run" className="inline-flex shrink-0">
        <Badge size="sm" tone="grey">
          <DashIcon size="sm" />
        </Badge>
      </span>
    );
  }
  if (meta === "running") {
    return (
      <span aria-label="Running" className="inline-flex shrink-0">
        <SpinnerRing active size="sm" />
      </span>
    );
  }
  if (meta === "queued") {
    return (
      <span aria-label="Queued" className="inline-flex shrink-0">
        <SpinnerRing size="sm" />
      </span>
    );
  }
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11.5px] tabular-nums">
      {meta}
    </span>
  );
};

const TASK_ROWS: TaskRow[] = [
  {
    amount: "12 suppliers",
    details: [
      { label: "Matched tax and contact IDs", meta: "12/12" },
      { label: "Flagged stale records", meta: "0" },
    ],
    key: "verify",
    label: "Verified vendor records",
    status: "done",
  },
  {
    amount: "7 SKUs",
    details: [
      { label: "Reading POS export", meta: "3 files" },
      { label: "Scoring stockout risk", meta: "68%" },
    ],
    key: "index",
    label: "Build reorder task list",
    status: "running",
    step: 2,
  },
  {
    amount: "2 messages",
    details: [
      { label: "Cone supplier follow-up", meta: "draft" },
      { label: "Pistachio reorder note", meta: "draft" },
    ],
    key: "draft",
    label: "Draft supplier emails",
    status: "sequence",
    step: 3,
  },
];

const detailTrailingContent = (detail: TaskDetail) => {
  if (detail.href) {
    return (
      <a
        href={detail.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink-2 hover:text-ink inline-flex shrink-0 items-center gap-1 text-[12px] font-medium"
      >
        View
        <ExternalLinkIcon />
      </a>
    );
  }
  if (CHECK_DETAIL_STATUSES.has(detail.meta)) {
    return <DetailMeta meta={detail.meta} />;
  }
  if (!detail.meta) {
    return null;
  }
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11.5px] tabular-nums">
      {detail.meta}
    </span>
  );
};

const detailLine = (detail: TaskDetail, animate: boolean, delayMs: number) => {
  const motionStyle = animate
    ? {
        animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${delayMs}ms both`,
      }
    : undefined;

  if (detail.insight?.kind === "lighthouse-performance") {
    return (
      <div key={detail.label} className="w-full min-w-0" style={motionStyle}>
        <LighthousePerformanceInsight
          caption={detail.insight.caption}
          parsed={detail.insight.parsed}
          status={detail.insight.status}
        />
      </div>
    );
  }

  return (
    <div
      key={detail.label}
      className="flex items-center justify-between gap-3"
      style={motionStyle}
    >
      <span className="text-ink-2 min-w-0 text-[12px]">{detail.label}</span>
      {detailTrailingContent(detail)}
    </div>
  );
};

const TaskRowDetails = ({
  animate,
  open,
  row,
}: {
  animate: boolean;
  open: boolean;
  row: TaskRow;
}) => {
  if (row.detailSections && row.detailSections.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {row.detailSections.map((section, sectionIndex) => {
          const priorDetailCount = row.detailSections
            ? row.detailSections
                .slice(0, sectionIndex)
                .reduce((sum, entry) => sum + entry.details.length, 0)
            : 0;
          return (
            <div
              key={section.title}
              className={
                sectionIndex > 0
                  ? "border-line flex flex-col gap-2 border-t pt-3"
                  : "flex flex-col gap-2"
              }
            >
              <p className="text-ink text-[12px] leading-snug font-semibold">
                {section.title}
              </p>
              <div className="flex flex-col gap-1.5">
                {section.details.map((detail, detailIndex) =>
                  detailLine(
                    detail,
                    open && animate,
                    120 + (priorDetailCount + detailIndex) * 100
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {row.details.map((detail, index) =>
        detailLine(detail, open && animate, 120 + index * 100)
      )}
    </div>
  );
};

const sequenceState = (tick: number): "pending" | "failed" | "done" => {
  if (tick < 3) {
    return "pending";
  }
  if (tick === 3) {
    return "failed";
  }
  return "done";
};

const TaskRows = ({
  variant = "Capsules",
  rows = TASK_ROWS,
  labels,
  className,
  onToggleRow,
}: {
  variant?: string;
  rows?: TaskRow[];
  labels?: Partial<TaskRowsLabels>;
  className?: string;
  onToggleRow?: (key: string, open: boolean) => void;
}) => {
  const tick = useTick(TICKS);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const row2 = sequenceState(tick);
  const copy = { ...DEFAULT_LABELS, ...labels };

  const badgeFor = (row: TaskRow) => {
    if (row.status === "done") {
      return (
        <Badge tone="green">
          <CheckIcon />
        </Badge>
      );
    }
    if (row.status === "skipped") {
      return (
        <span
          className="flex size-5.5 items-center justify-center rounded-full text-white"
          style={{ background: "var(--ink-3)" }}
        >
          <DashIcon />
        </span>
      );
    }
    if (row.status === "running") {
      return <SpinnerRing active>{row.step}</SpinnerRing>;
    }
    if (row.status === "pending") {
      return <SpinnerRing>{row.step}</SpinnerRing>;
    }
    if (row2 === "pending") {
      return <SpinnerRing>{row.step}</SpinnerRing>;
    }
    if (row2 === "failed") {
      return (
        <Badge tone="red">
          <XIcon />
        </Badge>
      );
    }
    return (
      <Badge tone="green">
        <CheckIcon />
      </Badge>
    );
  };

  const pillFor = (row: TaskRow) => {
    if (row.status === "done") {
      return (
        <span className="bg-green-tint text-green inline-flex h-5.5 items-center rounded-full px-2 text-[11.5px] font-medium">
          {copy.completed}
        </span>
      );
    }
    if (
      row.status === "running" ||
      row.status === "pending" ||
      row.status === "skipped"
    ) {
      return null;
    }
    if (row2 === "failed") {
      return (
        <span
          className="bg-red-tint text-red inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium"
          style={{ animation: "fade-in 200ms ease-out both" }}
        >
          {copy.failed}{" "}
          <span
            style={{ animation: "spin 1s linear infinite" }}
            className="flex"
          >
            {RetryIcon}
          </span>
        </span>
      );
    }
    if (row2 === "done") {
      return (
        <span
          className="bg-green-tint text-green inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium"
          style={{ animation: "fade-in 200ms ease-out both" }}
        >
          {copy.completed}
        </span>
      );
    }
    return null;
  };

  const list = variant === "List";
  return (
    <div
      className={`flex w-full max-w-110 flex-col ${
        list
          ? "rounded-card border-line bg-surface gap-0 self-start overflow-hidden border"
          : "min-h-[196px] gap-2"
      }${className ? ` ${className}` : ""}`}
    >
      {rows.map((row, i) => {
        const expands =
          row.expandable !== false &&
          (row.details.length > 0 || (row.detailSections?.length ?? 0) > 0);
        const open =
          expands &&
          (manualOpen[row.key] ?? (row.key === "index" && tick === 2));
        const borderRadius = (() => {
          if (list) {
            return 0;
          }
          if (open) {
            return 14;
          }
          return 22;
        })();
        return (
          <div
            key={row.key}
            className={`${expands ? "hover:bg-inset" : ""} self-stretch overflow-hidden transition-[border-radius,background-color] duration-300 ${
              list
                ? "border-line border-b last:border-0"
                : "bg-surface shadow-card"
            }`}
            style={{
              animation: list
                ? undefined
                : `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
              borderRadius,
            }}
          >
            {expands ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => {
                  setManualOpen((current) => ({
                    ...current,
                    [row.key]: !open,
                  }));
                  onToggleRow?.(row.key, !open);
                }}
                className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left"
              >
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {badgeFor(row)}
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">
                  {row.label}
                </span>
                {row.amount ? (
                  <span className="text-ink-2 text-[12.5px] tabular-nums">
                    {row.amount}
                  </span>
                ) : null}
                {pillFor(row)}
                <span
                  aria-hidden="true"
                  className="text-ink-3 -ml-2 flex size-7 shrink-0 items-center justify-center rounded-full"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform duration-300"
                    style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
            ) : (
              <div className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left">
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {badgeFor(row)}
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">
                  {row.label}
                </span>
                {row.amount ? (
                  <span className="text-ink-2 text-[12.5px] tabular-nums">
                    {row.amount}
                  </span>
                ) : null}
                {pillFor(row)}
              </div>
            )}

            {expands ? (
              <div
                className="grid transition-[grid-template-rows,opacity] duration-300"
                style={{
                  gridTemplateRows: open ? "1fr" : "0fr",
                  opacity: open ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                }}
              >
                <div className="overflow-hidden">
                  <div className="mb-2.5 pr-2.5 pl-11">
                    <TaskRowDetails animate={!list} open={open} row={row} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default TaskRows;
