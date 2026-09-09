"use client";

import type { AllocationSegment } from "@/components/primitives/insight-cards";
import type { BasicReportStats } from "@/lib/chat-onboarding";

export const reportAllocationSegments = (
  stats: BasicReportStats
): AllocationSegment[] => {
  const { pass, fail, error, total } = stats;
  if (total === 0) {
    return [
      {
        amount: "0 checks",
        cls: "bg-line",
        label: "Pending",
        name: "PEND",
        pct: 100,
        tone: "text-ink-3",
      },
    ];
  }

  const segments: AllocationSegment[] = [
    {
      amount: `${pass} checks`,
      cls: "bg-green",
      label: "Passing",
      name: "PASS",
      pct: Math.round((pass / total) * 1000) / 10,
      tone: "text-green",
    },
    {
      amount: `${fail} checks`,
      cls: "bg-orange",
      label: "Needs work",
      name: "FAIL",
      pct: Math.round((fail / total) * 1000) / 10,
      tone: "text-orange",
    },
  ];

  if (error > 0) {
    segments.push({
      amount: `${error} checks`,
      cls: "bg-line-strong",
      label: "Could not run",
      name: "ERR",
      pct: Math.round((error / total) * 1000) / 10,
      tone: "text-ink-2",
    });
  }

  return segments;
};
