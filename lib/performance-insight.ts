import { z } from "zod";

export const LCP_GOOD_MS = 2500;
export const LCP_POOR_MS = 4000;

const timingKindSchema = z.enum(["lcp", "load", "none"]);

export type PerformanceTimingKind = z.infer<typeof timingKindSchema>;

const parsedPerformanceLabelSchema = z.object({
  lcpMs: z.number().int().nonnegative().optional(),
  timingKind: timingKindSchema,
});

export type ParsedPerformanceLabel = z.infer<
  typeof parsedPerformanceLabelSchema
>;

const lcpPatterns: { pattern: RegExp; timingKind: PerformanceTimingKind }[] = [
  {
    pattern: /LCP p75:\s*(?<ms>\d+)ms/iu,
    timingKind: "lcp",
  },
  {
    pattern: /LCP:\s*(?<ms>\d+)ms/iu,
    timingKind: "lcp",
  },
  {
    pattern: /Synthetic browser load LCP:\s*(?<ms>\d+)ms/iu,
    timingKind: "lcp",
  },
  {
    pattern: /Synthetic browser load load event:\s*(?<ms>\d+)ms/iu,
    timingKind: "load",
  },
];

export const parsePerformanceCheckLabel = (
  label: string | undefined
): ParsedPerformanceLabel => {
  if (!label) {
    return parsedPerformanceLabelSchema.parse({ timingKind: "none" });
  }

  for (const entry of lcpPatterns) {
    const match = label.match(entry.pattern);
    const msRaw = match?.groups?.ms;
    if (msRaw) {
      const ms = Number(msRaw);
      if (Number.isFinite(ms)) {
        return parsedPerformanceLabelSchema.parse({
          lcpMs: ms,
          timingKind: entry.timingKind,
        });
      }
    }
  }

  return parsedPerformanceLabelSchema.parse({ timingKind: "none" });
};

export type LcpBucket = "good" | "needs-improvement" | "poor";

export const lcpBucket = (lcpMs: number): LcpBucket => {
  if (lcpMs <= LCP_GOOD_MS) {
    return "good";
  }
  if (lcpMs <= LCP_POOR_MS) {
    return "needs-improvement";
  }
  return "poor";
};

/** Approximate Lighthouse performance score from LCP alone (lab-style, not official PSI). */
export const lcpToDisplayScore = (lcpMs: number): number => {
  if (lcpMs <= LCP_GOOD_MS) {
    return Math.min(100, Math.round(90 + (LCP_GOOD_MS - lcpMs) / 250));
  }
  if (lcpMs <= LCP_POOR_MS) {
    return Math.round(
      50 + ((LCP_POOR_MS - lcpMs) / (LCP_POOR_MS - LCP_GOOD_MS)) * 40
    );
  }
  return Math.max(0, Math.round(50 - (lcpMs - LCP_POOR_MS) / 200));
};

export const scoreRingTone = (score: number): "good" | "average" | "poor" => {
  if (score >= 90) {
    return "good";
  }
  if (score >= 50) {
    return "average";
  }
  return "poor";
};

export const formatMsForDisplay = (ms: number): string => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  return `${ms} ms`;
};
