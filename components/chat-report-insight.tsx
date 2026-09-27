"use client";

import { useState } from "react";
import useSWR from "swr";

import { reportAllocationSegments } from "@/components/chat-report-allocation";
import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { scorePercent } from "@/lib/chat-onboarding";
import type { BasicReportStats, ReportIssue } from "@/lib/chat-onboarding";
import {
  fetchEntitlement,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
  requestCheckoutUrl,
  unlockPricingNote,
} from "@/lib/polar";
import { checkoutPlanSchema, entitlementStateSchema } from "@/lib/schema";
import type { CheckoutPlan, EntitlementState } from "@/lib/schema";

const IssueStatusMark = ({ status }: { status: ReportIssue["status"] }) => (
  <Badge
    variant={status === "pass" ? "secondary" : "destructive"}
    className="mr-2 shrink-0"
  >
    {status === "pass" ? "Pass" : "Needs work"}
  </Badge>
);

const formatCheckCount = (count: number): string =>
  count === 1 ? "1 check" : `${count} checks`;

interface ReportSummaryProps {
  businessName: string;
  stats: BasicReportStats;
  businessId: string | null;
  onPreview: () => void;
}

const buildCtaLabel = (
  access: EntitlementState,
  redirecting: CheckoutPlan | null,
  sessionRequired: boolean
): string => {
  if (sessionRequired) {
    return "Enter code";
  }
  if (access.unlocked) {
    return access.kind === "report_monthly"
      ? "Monthly scans active"
      : "View full report";
  }
  if (redirecting === "once") {
    return "Redirecting…";
  }
  return `Full report · ${REPORT_ONCE_PRICE} once`;
};

const sessionAccessNote = (access: EntitlementState): string => {
  if (access.maskedEmail) {
    return `Enter the code we sent to ${access.maskedEmail}.`;
  }
  return "Enter the code we sent to open the full report.";
};

const unlockedAccessNote = (access: EntitlementState): string =>
  access.kind === "report_monthly"
    ? "Monthly scans active."
    : "Full report unlocked.";

const lockedAccessNote = (access: EntitlementState): string => {
  if (!access.backendAvailable) {
    return "Account services are temporarily unavailable.";
  }
  if (!access.paymentsEnabled) {
    return access.fixStepsWithoutPayment
      ? "Fix steps are included in this environment."
      : "Payments are not configured yet.";
  }
  return (
    unlockPricingNote(access) ??
    `Pay ${REPORT_ONCE_PRICE} once to unlock fix steps for this business.`
  );
};

const buildAccessNote = (
  access: EntitlementState,
  businessId: string | null
): string => {
  if (!businessId) {
    return "Save this audit to unlock the full report.";
  }
  if (access.unlocked && access.sessionRequired) {
    return sessionAccessNote(access);
  }
  if (access.unlocked) {
    return unlockedAccessNote(access);
  }
  return lockedAccessNote(access);
};

const isCtaDisabled = (
  businessId: string | null,
  access: EntitlementState,
  redirecting: CheckoutPlan | null
): boolean =>
  !businessId ||
  redirecting !== null ||
  !access.backendAvailable ||
  (!access.unlocked &&
    !access.paymentsEnabled &&
    !access.fixStepsWithoutPayment);

interface ReportUnlockActionsProps {
  businessId: string | null;
  access: EntitlementState;
  ctaDisabled: boolean;
  ctaLabel: string;
  redirecting: CheckoutPlan | null;
  onUnlock: (plan: CheckoutPlan) => void;
  onPreview: () => void;
}

const ReportUnlockActions = ({
  businessId,
  access,
  ctaDisabled,
  ctaLabel,
  redirecting,
  onUnlock,
  onPreview,
}: ReportUnlockActionsProps) => (
  <FormActions className="flex-col items-stretch sm:flex-row sm:items-center">
    <PrimaryButton
      type="button"
      disabled={ctaDisabled}
      className="w-full sm:w-auto"
      onClick={() => {
        onUnlock(checkoutPlanSchema.parse("once"));
      }}
    >
      {ctaLabel}
    </PrimaryButton>
    {businessId && !access.unlocked && access.yearlyAvailable ? (
      <QuietButton
        type="button"
        disabled={ctaDisabled}
        className="w-full justify-start sm:w-auto"
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("yearly"));
        }}
      >
        {redirecting === "yearly"
          ? "Redirecting…"
          : `Best value · ${REPORT_YEARLY_PRICE}, ${REPORT_YEARLY_VALUE_NOTE}`}
      </QuietButton>
    ) : null}
    {businessId && !access.unlocked && access.monthlyAvailable ? (
      <QuietButton
        type="button"
        disabled={ctaDisabled}
        className="w-full justify-start sm:w-auto"
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("monthly"));
        }}
      >
        {redirecting === "monthly"
          ? "Redirecting…"
          : `Monthly scans · ${REPORT_MONTHLY_PRICE}`}
      </QuietButton>
    ) : null}
    {businessId && !access.unlocked ? (
      <QuietButton
        type="button"
        className="w-full sm:w-auto"
        onClick={onPreview}
      >
        Preview
      </QuietButton>
    ) : null}
  </FormActions>
);

export const ReportSummary = ({
  businessName,
  stats,
  businessId,
  onPreview,
}: ReportSummaryProps) => {
  const score = scorePercent(stats);
  const segments = reportAllocationSegments(stats);
  const fallbackAccess = entitlementStateSchema.parse({
    paymentsEnabled: false,
    unlocked: false,
  });
  const { data: fetchedAccess } = useSWR(
    businessId ? (["entitlement", businessId] as const) : null,
    ([, id]) => fetchEntitlement(id),
    { revalidateOnFocus: false }
  );
  const access = fetchedAccess ?? fallbackAccess;
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);

  const sessionRequired = Boolean(access.unlocked && access.sessionRequired);
  const ctaDisabled = isCtaDisabled(businessId, access, redirecting);
  const ctaLabel = buildCtaLabel(access, redirecting, sessionRequired);
  const note = buildAccessNote(access, businessId);

  const handleUnlock = async (
    plan: CheckoutPlan = checkoutPlanSchema.parse("once")
  ) => {
    if (!businessId) {
      return;
    }
    if (access.unlocked) {
      onPreview();
      return;
    }
    setCheckoutError(null);
    setRedirecting(plan);
    try {
      const url = await requestCheckoutUrl(businessId, plan);
      window.location.assign(url);
    } catch (error) {
      setRedirecting(null);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout failed"
      );
    }
  };

  return (
    <Card
      className="listwell-chat__report max-w-full ring-0"
      aria-label={`Visibility report for ${businessName}`}
    >
      <CardHeader className="gap-1">
        <CardDescription className="text-foreground text-base">
          {businessName}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">
          {score}%
          <span className="text-muted-foreground text-lg font-normal">
            {" "}
            visibility
          </span>
        </CardTitle>
        <CardDescription>
          {formatCheckCount(stats.pass)} passing ·{" "}
          {formatCheckCount(stats.fail)} need work
          {stats.error > 0 ? ` · ${formatCheckCount(stats.error)} skipped` : ""}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <figure
          className="listwell-chat__report-bar"
          aria-label={`${stats.pass} passing, ${stats.fail} need work${stats.error > 0 ? `, ${stats.error} skipped` : ""}`}
        >
          {segments.map((segment) => (
            <span
              key={segment.name}
              className={`listwell-chat__report-bar-segment ${segment.cls}`}
              style={{ flex: `${segment.pct} 1 0%` }}
            />
          ))}
        </figure>

        <ul className="listwell-chat__report-legend">
          {segments.map((segment) => (
            <li
              key={segment.name}
              className="listwell-chat__report-legend-item"
            >
              <span
                className={`listwell-chat__report-legend-label ${segment.tone}`}
              >
                {segment.label}
              </span>
              <span className="listwell-chat__report-legend-pct">
                {segment.pct}%
              </span>
            </li>
          ))}
        </ul>

        {stats.topIssues.length > 0 ? (
          <ul className="listwell-chat__report-issues space-y-2">
            {stats.topIssues.slice(0, 4).map((issue) => (
              <li
                key={`${issue.status}-${issue.title}`}
                className="flex items-start gap-1 text-sm"
              >
                <IssueStatusMark status={issue.status} />
                {issue.title}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-4">
        <ReportUnlockActions
          businessId={businessId}
          access={access}
          ctaDisabled={ctaDisabled}
          ctaLabel={ctaLabel}
          redirecting={redirecting}
          onUnlock={handleUnlock}
          onPreview={onPreview}
        />
        {checkoutError ? (
          <Alert variant="destructive">
            <AlertDescription>{checkoutError}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-muted-foreground text-sm">{note}</p>
        )}
      </CardFooter>
    </Card>
  );
};
