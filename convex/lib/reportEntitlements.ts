export type ReportEntitlementKind = "report_once" | "report_monthly";

export type EntitlementLifecycleStatus = "active" | "cancelled" | "revoked";

export const reportEntitlementKind = (
  kind: string
): ReportEntitlementKind | null => {
  if (kind === "report_once" || kind === "report_monthly") {
    return kind;
  }
  return null;
};

const isReportKind = (kind: string): boolean =>
  reportEntitlementKind(kind) !== null;

/** Active monthly plan when one exists, otherwise any active report row. */
export const activeReportEntitlement = <
  Row extends { kind: string; status: string },
>(
  rows: readonly Row[]
): Row | null => {
  const active = rows.filter(
    (row) => row.status === "active" && isReportKind(row.kind)
  );
  return (
    active.find((row) => row.kind === "report_monthly") ?? active[0] ?? null
  );
};

/** Latest cancelled monthly plan. Newer `updatedAt` wins. */
export const cancelledMonthlyEntitlement = <
  Row extends { kind: string; status: string; updatedAt: string },
>(
  rows: readonly Row[]
): Row | null => {
  const cancelled = rows.filter(
    (row) => row.status === "cancelled" && row.kind === "report_monthly"
  );
  return (
    cancelled.toSorted((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    )[0] ?? null
  );
};

/**
 * Research reads an active monthly plan first, then a cancelled monthly plan,
 * then any other active report.
 */
export const researchReportEntitlement = <
  Row extends { kind: string; status: string; updatedAt: string },
>(
  rows: readonly Row[]
): Row | null => {
  const active = activeReportEntitlement(rows);
  if (active?.kind === "report_monthly") {
    return active;
  }
  return cancelledMonthlyEntitlement(rows) ?? active;
};

export const isCancelledMonthly = (row: {
  kind: string;
  status: string;
}): boolean => row.status === "cancelled" && row.kind === "report_monthly";

const analyticsKinds = new Set([
  "analytics_10k",
  "analytics_100k",
  "analytics_1m",
]);

const isAnalyticsKind = (kind: string): boolean => analyticsKinds.has(kind);

const sameBillingFamily = (left: string, right: string): boolean => {
  if (isAnalyticsKind(left) && isAnalyticsKind(right)) {
    return true;
  }
  return isReportKind(left) && isReportKind(right);
};

/**
 * A new analytics purchase stays beside an existing report plan.
 * Reuse a row only inside the same family, so a subscription id on the
 * report cannot be rewritten into an analytics band.
 */
export const grantReusesEntitlementRow = (input: {
  existingKind: string;
  grantKind: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  rowOrderId?: string;
  rowSubscriptionId?: string;
}): boolean => {
  if (!sameBillingFamily(input.existingKind, input.grantKind)) {
    return false;
  }
  if (input.existingKind === input.grantKind) {
    return true;
  }
  if (
    input.polarOrderId !== undefined &&
    input.rowOrderId !== undefined &&
    input.polarOrderId === input.rowOrderId
  ) {
    return true;
  }
  return (
    input.polarSubscriptionId !== undefined &&
    input.rowSubscriptionId !== undefined &&
    input.polarSubscriptionId === input.rowSubscriptionId
  );
};

/**
 * The account can take a business that already has a plan when that plan
 * belongs to them. Another account's active plan still blocks the claim.
 * An unassigned purchase stays with the email link, not a random claim.
 */
export const businessClaimAllowed = (
  rows: readonly { status: string; userId?: string | null }[],
  userId: string
): boolean => {
  let ownsActivePlan = false;
  for (const row of rows) {
    if (row.status !== "active") {
      continue;
    }
    if (
      row.userId === undefined ||
      row.userId === null ||
      row.userId.length === 0
    ) {
      continue;
    }
    if (row.userId !== userId) {
      return false;
    }
    ownsActivePlan = true;
  }
  const hasActivePlan = rows.some((row) => row.status === "active");
  if (!hasActivePlan) {
    return true;
  }
  return ownsActivePlan;
};

/**
 * Ending one Polar subscription leaves the other product on that business.
 * A matched order or subscription is the only row that changes. A lapse
 * with no match still ends a legacy monthly report that has no subscription id.
 */
export const entitlementRowsForBillingEnd = <
  Row extends {
    kind: string;
    polarSubscriptionId?: string;
    status: string;
  },
>(input: {
  businessRows: readonly Row[];
  identifiedRows: readonly Row[];
  polarOrderId?: string;
  polarSubscriptionId?: string;
  scope: "lapse" | "revoke";
}): readonly Row[] => {
  if (input.identifiedRows.length > 0) {
    return input.identifiedRows;
  }
  const hasBillingId = Boolean(input.polarOrderId || input.polarSubscriptionId);
  if (hasBillingId && input.scope === "revoke") {
    return [];
  }
  if (input.scope === "lapse") {
    return input.businessRows.filter((row) => {
      if (row.kind !== "report_monthly" || row.status === "revoked") {
        return false;
      }
      const differentSubscription =
        row.polarSubscriptionId !== undefined &&
        input.polarSubscriptionId !== undefined &&
        row.polarSubscriptionId !== input.polarSubscriptionId;
      return !differentSubscription;
    });
  }
  return input.businessRows;
};

/**
 * Ending a monthly subscription keeps stored scans.
 * A refund or pause removes that access. `null` means leave the row alone.
 */
export const entitlementStatusAfterEnd = (input: {
  effect: "lapse" | "revoke";
  kind: string;
  status: EntitlementLifecycleStatus;
}): "cancelled" | "revoked" | null => {
  if (input.status === "revoked") {
    return null;
  }
  if (input.effect === "revoke") {
    return "revoked";
  }
  if (input.kind === "report_monthly") {
    return input.status === "cancelled" ? null : "cancelled";
  }
  if (input.status !== "active") {
    return null;
  }
  return "revoked";
};
