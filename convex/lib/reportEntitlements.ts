export type ReportEntitlementKind = "report_once" | "report_monthly";

export const reportEntitlementKind = (
  kind: string
): ReportEntitlementKind | null => {
  if (kind === "report_once" || kind === "report_monthly") {
    return kind;
  }
  return null;
};
