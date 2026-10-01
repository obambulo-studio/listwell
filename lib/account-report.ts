import { z } from "zod";

const accountDateFormat = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
});

export const formatAccountScanDate = (
  iso: string | null | undefined
): string | null => {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return accountDateFormat.format(parsed);
};

export const accountReportMeta = (report: {
  lastScan: { finishedAt: string | null } | null;
}): string | null => {
  const lastScan = formatAccountScanDate(report.lastScan?.finishedAt);
  if (!lastScan) {
    return null;
  }
  return `Last scanned ${lastScan}`;
};

export const accountScoreDeltaDirectionSchema = z.enum(["down", "same", "up"]);
export type AccountScoreDeltaDirection = z.infer<
  typeof accountScoreDeltaDirectionSchema
>;

export const accountScoreDeltaSchema = z.object({
  direction: accountScoreDeltaDirectionSchema,
  points: z.number().int().nonnegative(),
});
export type AccountScoreDelta = z.infer<typeof accountScoreDeltaSchema>;

export const accountScoreDelta = (
  score: number | null,
  previousScore: number | null
): AccountScoreDelta | null => {
  if (score === null || previousScore === null) {
    return null;
  }
  const delta = score - previousScore;
  if (delta === 0) {
    return accountScoreDeltaSchema.parse({ direction: "same", points: 0 });
  }
  return accountScoreDeltaSchema.parse({
    direction: delta > 0 ? "up" : "down",
    points: Math.abs(delta),
  });
};

export const formatAccountScoreDelta = (delta: AccountScoreDelta): string => {
  if (delta.direction === "same") {
    return "\u2192";
  }
  const arrow = delta.direction === "up" ? "\u2191" : "\u2193";
  return `${arrow}${delta.points}`;
};

export const accountScoreDeltaAriaLabel = (
  delta: AccountScoreDelta
): string => {
  if (delta.direction === "same") {
    return "Same as previous scan.";
  }
  const unit = delta.points === 1 ? "point" : "points";
  if (delta.direction === "up") {
    return `Up ${delta.points} ${unit} from previous scan.`;
  }
  return `Down ${delta.points} ${unit} from previous scan.`;
};
