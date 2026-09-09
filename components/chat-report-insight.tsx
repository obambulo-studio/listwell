"use client";

import { useEffect, useState } from "react";

import { reportAllocationSegments } from "@/components/chat-report-allocation";
import { scorePercent } from "@/lib/chat-onboarding";
import type { BasicReportStats, ReportIssue } from "@/lib/chat-onboarding";
import {
  fetchEntitlement,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  requestCheckoutUrl,
} from "@/lib/polar";
import { checkoutPlanSchema, entitlementStateSchema } from "@/lib/schema";
import type { CheckoutPlan, EntitlementState } from "@/lib/schema";

const STATUS_COPY = {
  fail: "Needs work",
  pass: "Pass",
} as const;

const IssueStatusMark = ({ status }: { status: ReportIssue["status"] }) => {
  if (status === "pass") {
    return (
      <span
        className="listwell-chat__report-issue-mark listwell-chat__report-issue-mark--pass"
        aria-hidden="true"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className="listwell-chat__report-issue-mark listwell-chat__report-issue-mark--fail"
      aria-hidden="true"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </span>
  );
};

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

const buildAccessNote = (
  access: EntitlementState,
  businessId: string | null
): string => {
  if (!businessId) {
    return "Save this audit to unlock the full report.";
  }

  const sessionRequired = access.unlocked && access.sessionRequired;
  if (sessionRequired) {
    if (access.maskedEmail) {
      return `Enter the code we sent to ${access.maskedEmail}.`;
    }
    return "Enter the code we sent to open the full report.";
  }

  if (access.unlocked) {
    return access.kind === "report_monthly"
      ? "Monthly scans active."
      : "Full report unlocked.";
  }

  if (!access.paymentsEnabled) {
    return "Payment coming soon.";
  }

  if (access.monthlyAvailable) {
    return `Unlock with ${REPORT_ONCE_PRICE} once or ${REPORT_MONTHLY_PRICE}.`;
  }

  return `Pay ${REPORT_ONCE_PRICE} once to unlock fix steps for this business.`;
};

export const ReportSummary = ({
  businessName,
  stats,
  businessId,
  onPreview,
}: ReportSummaryProps) => {
  const score = scorePercent(stats);
  const segments = reportAllocationSegments(stats);
  const [access, setAccess] = useState<EntitlementState>(() =>
    entitlementStateSchema.parse({ paymentsEnabled: false, unlocked: false })
  );
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);

  useEffect(() => {
    if (!businessId) {
      return;
    }
    const id = businessId;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await fetchEntitlement(id);
        if (!cancelled) {
          setAccess(next);
        }
      } catch {
        if (!cancelled) {
          setAccess(
            entitlementStateSchema.parse({
              paymentsEnabled: false,
              unlocked: false,
            })
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const sessionRequired = Boolean(access.unlocked && access.sessionRequired);
  const ctaDisabled =
    !businessId ||
    redirecting !== null ||
    (!access.unlocked && !access.paymentsEnabled);
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
    <article
      className="listwell-chat__report"
      aria-label={`Visibility report for ${businessName}`}
    >
      <header className="listwell-chat__report-header">
        <p className="listwell-chat__report-business">{businessName}</p>
        <p className="listwell-chat__report-score">
          <span className="listwell-chat__report-score-value">{score}%</span>
          <span className="listwell-chat__report-score-label"> visibility</span>
        </p>
        <p className="listwell-chat__report-meta">
          {formatCheckCount(stats.pass)} passing ·{" "}
          {formatCheckCount(stats.fail)} need work
          {stats.error > 0 ? ` · ${formatCheckCount(stats.error)} skipped` : ""}
        </p>
      </header>

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

      {stats.topIssues.length > 0 ? (
        <ul className="listwell-chat__report-issues">
          {stats.topIssues.slice(0, 4).map((issue) => (
            <li key={`${issue.status}-${issue.title}`}>
              <IssueStatusMark status={issue.status} />
              <span className="vbg-visually-hidden">
                {STATUS_COPY[issue.status]}:{" "}
              </span>
              {issue.title}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="listwell-chat__report-actions">
        <button
          type="button"
          className="listwell-chat__report-cta"
          disabled={ctaDisabled}
          onClick={() => {
            handleUnlock(checkoutPlanSchema.parse("once"));
          }}
        >
          {ctaLabel}
        </button>
        {businessId && !access.unlocked && access.monthlyAvailable ? (
          <button
            type="button"
            className="listwell-chat__report-link"
            disabled={ctaDisabled}
            onClick={() => {
              handleUnlock(checkoutPlanSchema.parse("monthly"));
            }}
          >
            {redirecting === "monthly"
              ? "Redirecting…"
              : `Monthly scans · ${REPORT_MONTHLY_PRICE}`}
          </button>
        ) : null}
        {businessId && !access.unlocked ? (
          <button
            type="button"
            className="listwell-chat__report-link"
            onClick={onPreview}
          >
            Preview
          </button>
        ) : null}
      </div>
      <p className="listwell-chat__report-note">{checkoutError ?? note}</p>
    </article>
  );
};
