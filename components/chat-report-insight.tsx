"use client";

import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/atoms/button";
import { reportAllocationSegments } from "@/components/chat-report-allocation";
import { PrimaryButton } from "@/components/listwell/actions";
import { Alert, AlertDescription } from "@/components/reui/alert";
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

const CheckIcon = () => (
  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M20 6L9 17l-5-5"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const XIcon = () => (
  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M18 6L6 18M6 6l12 12"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </svg>
);

const IssueStatusMark = ({ status }: { status: ReportIssue["status"] }) => (
  <span
    className={`listwell-chat__report-issue-mark ${status === "pass" ? "listwell-chat__report-issue-mark--pass" : "listwell-chat__report-issue-mark--fail"}`}
    aria-label={status === "pass" ? "Pass" : "Needs work"}
  >
    {status === "pass" ? <CheckIcon /> : <XIcon />}
  </span>
);

export const ReportAllocation = ({
  stats,
}: {
  stats: Pick<BasicReportStats, "pass" | "fail" | "error" | "total">;
}) => {
  const segments = reportAllocationSegments(stats);
  const legendSegments = segments.filter((segment) => segment.name !== "ERR");
  return (
    <>
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
        {legendSegments.map((segment) => (
          <li key={segment.name} className="listwell-chat__report-legend-item">
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
    </>
  );
};

export const formatCheckCount = (count: number): string =>
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
  return "Full report";
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
  sessionRequired: boolean;
  onUnlock: (plan: CheckoutPlan) => void;
  onPreview: () => void;
}

export const reportActionClass =
  "h-auto min-h-12 min-w-0 flex-1 flex-col gap-0.5 whitespace-normal px-3 py-3 text-center text-base leading-snug";

export const ReportActionLabel = ({
  caption,
  title,
}: {
  caption?: string;
  title: string;
}) => (
  <span className="flex flex-col items-center gap-0.5">
    <span>{title}</span>
    {caption ? (
      <span className="text-[11px] leading-none font-normal opacity-70">
        {caption}
      </span>
    ) : null}
  </span>
);

const ReportUnlockActions = ({
  businessId,
  access,
  ctaDisabled,
  ctaLabel,
  redirecting,
  sessionRequired,
  onUnlock,
  onPreview,
}: ReportUnlockActionsProps) => (
  <div className="flex w-full flex-row flex-wrap gap-2">
    {businessId && !access.unlocked ? (
      <Button
        type="button"
        variant="secondary"
        className={reportActionClass}
        onClick={onPreview}
      >
        <ReportActionLabel caption="Free" title="Preview report" />
      </Button>
    ) : null}
    <PrimaryButton
      type="button"
      disabled={ctaDisabled}
      className={reportActionClass}
      onClick={() => {
        onUnlock(checkoutPlanSchema.parse("once"));
      }}
    >
      <ReportActionLabel
        caption={
          redirecting === "once" || sessionRequired || access.unlocked
            ? undefined
            : `${REPORT_ONCE_PRICE} once`
        }
        title={redirecting === "once" ? "Redirecting…" : ctaLabel}
      />
    </PrimaryButton>
    {businessId && !access.unlocked && access.yearlyAvailable ? (
      <Button
        type="button"
        variant="secondary"
        disabled={ctaDisabled}
        className={reportActionClass}
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("yearly"));
        }}
      >
        {redirecting === "yearly"
          ? "Redirecting…"
          : `Best value · ${REPORT_YEARLY_PRICE}, ${REPORT_YEARLY_VALUE_NOTE}`}
      </Button>
    ) : null}
    {businessId && !access.unlocked && access.monthlyAvailable ? (
      <Button
        type="button"
        variant="secondary"
        disabled={ctaDisabled}
        className={reportActionClass}
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("monthly"));
        }}
      >
        {redirecting === "monthly"
          ? "Redirecting…"
          : `Monthly scans · ${REPORT_MONTHLY_PRICE}`}
      </Button>
    ) : null}
  </div>
);

export const ReportSummary = ({
  businessName,
  stats,
  businessId,
  onPreview,
}: ReportSummaryProps) => {
  const score = scorePercent(stats);
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
        <ReportAllocation stats={stats} />

        {stats.topIssues.length > 0 ? (
          <ul className="listwell-chat__report-issues space-y-2">
            {stats.topIssues.map((issue) => (
              <li
                key={`${issue.status}-${issue.title}`}
                className="flex items-center gap-2 text-sm"
              >
                <IssueStatusMark status={issue.status} />
                {issue.weightPercent === undefined ? (
                  <span className="w-9 shrink-0" />
                ) : (
                  <span className="text-muted-foreground w-9 shrink-0 text-right font-mono text-[11px] tabular-nums">
                    {issue.weightPercent}%
                  </span>
                )}
                <span className="min-w-0 flex-1">{issue.title}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      <CardFooter className="w-full flex-col items-stretch gap-3 border-t border-[color:var(--line-soft)] pt-4">
        <ReportUnlockActions
          businessId={businessId}
          access={access}
          ctaDisabled={ctaDisabled}
          ctaLabel={ctaLabel}
          redirecting={redirecting}
          sessionRequired={sessionRequired}
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
