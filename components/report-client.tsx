"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";

import { CheckBody } from "@/components/check-body";
import { CHANNEL_CONFIG } from "@/lib/channel";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import type { CheckStatus } from "@/lib/chat-onboarding";
import { pointsFor } from "@/lib/checks/types";
import type { CheckDefinition } from "@/lib/checks/types";
import {
  fetchEntitlement,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  requestCheckoutUrl,
  requestSignInCode,
  verifySignInCode,
} from "@/lib/polar";
import { businessToProfiles } from "@/lib/profiles";
import {
  auditJobPollSchema,
  businessSchema,
  checkResultSchema,
  checkoutPlanSchema,
  entitlementStateSchema,
  scanSummarySchema,
} from "@/lib/schema";
import type {
  Business,
  CheckResult,
  CheckoutPlan,
  EntitlementState,
  ScanSummary,
} from "@/lib/schema";
import {
  auditSummaryResultSchema,
  completedCheckSchema,
} from "@/lib/summaries";
import type { AuditSummaryResult, CompletedCheck } from "@/lib/summaries";
import { waitForMs } from "@/lib/wait";

const initialResultsSchema = z.record(z.string(), checkResultSchema);
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_MAX_ATTEMPTS = 30;
const missingCheckResult = checkResultSchema.parse({
  label: "This check could not run",
  type: "check",
  value: null,
});

const CHANNEL_GROUP_ORDER: readonly string[] = [
  "Website",
  "Google Business Profile",
  "Social Media",
  "Food Delivery",
];

interface LiveCheck {
  definition: CheckDefinition;
  status: CheckStatus;
  result: CheckResult | null;
  duration?: number;
}

const liveChecksFromResults = (
  checks: CheckDefinition[],
  results: Record<string, CheckResult>
): LiveCheck[] =>
  checks.map((definition) => {
    const result =
      results[definition.id] ??
      checkResultSchema.parse({
        label: "This check could not run",
        type: "check",
        value: null,
      });
    return {
      definition,
      result,
      status: statusFromResult(result),
    };
  });

const statusLabel = (status: CheckStatus): string => {
  switch (status) {
    case "pass": {
      return "Pass";
    }
    case "fail": {
      return "Fail";
    }
    case "error": {
      return "Error";
    }
    case "queued":
    case "pending": {
      return "Waiting";
    }
    default: {
      return "Idle";
    }
  }
};

const completedStatus = (
  status: CheckStatus
): CompletedCheck["status"] | null => {
  if (status === "pass" || status === "fail" || status === "error") {
    return status;
  }
  return null;
};

const titleForCheck = (
  checks: { id: string; title: string }[],
  id: string
): string => checks.find((check) => check.id === id)?.title ?? id;

const degradedCaption = (summary: AuditSummaryResult): string | null => {
  if (summary.available) {
    return null;
  }
  return "Listwell wrote this from the completed checks.";
};

const formatScanDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatScanDelta = (delta: number | null): string => {
  if (delta === null) {
    return "—";
  }
  if (delta === 0) {
    return "No change";
  }
  return `${delta > 0 ? "+" : ""}${delta}%`;
};

const reportShowsFixSteps = (access: EntitlementState): boolean =>
  !access.paymentsEnabled || (access.unlocked && !access.sessionRequired);

const CITATION_PREVIEW = 2;

const CitationLinks = ({
  checkIds,
  checks,
  onSelect,
}: {
  checkIds: string[];
  checks: { id: string; title: string }[];
  onSelect: (id: string) => void;
}) => {
  const named = checkIds.slice(0, CITATION_PREVIEW);
  const extra = checkIds.length - named.length;
  return (
    <span className="listwell-report__citations">
      {named.map((checkId) => (
        <button
          key={checkId}
          className="listwell-report__citation"
          type="button"
          onClick={() => onSelect(checkId)}
        >
          {titleForCheck(checks, checkId)}
        </button>
      ))}
      {extra > 0 ? (
        <span className="listwell-report__citation-rest">{extra} more</span>
      ) : null}
    </span>
  );
};

const ReportSource = ({
  checkIds,
  checks,
  onSelect,
}: {
  checkIds: string[];
  checks: { id: string; title: string }[];
  onSelect: (id: string) => void;
}) => (
  <p className="listwell-report__source">
    <span>From</span>
    <CitationLinks checkIds={checkIds} checks={checks} onSelect={onSelect} />
  </p>
);

const detailLabel = (item: LiveCheck): string | undefined => {
  if (item.status === "queued" || item.status === "pending") {
    return undefined;
  }
  const label = item.result?.label;
  if (!label) {
    return undefined;
  }
  if (label.toLowerCase() === statusLabel(item.status).toLowerCase()) {
    return undefined;
  }
  return label;
};

const groupVisibleByChannel = (
  items: LiveCheck[]
): { category: string; items: LiveCheck[] }[] => {
  const groups = new Map<string, LiveCheck[]>();
  for (const item of items) {
    const category = item.definition.channelCategory;
    const existing = groups.get(category);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(category, [item]);
    }
  }

  return [...groups.entries()]
    .toSorted((left, right) => {
      const leftRank = CHANNEL_GROUP_ORDER.indexOf(left[0]);
      const rightRank = CHANNEL_GROUP_ORDER.indexOf(right[0]);
      const leftOrder = leftRank === -1 ? CHANNEL_GROUP_ORDER.length : leftRank;
      const rightOrder =
        rightRank === -1 ? CHANNEL_GROUP_ORDER.length : rightRank;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([category, grouped]) => ({ category, items: grouped }));
};

const recommendedCheckId = (
  summary: AuditSummaryResult | null,
  liveChecks: LiveCheck[]
): string | undefined => {
  const cited = summary?.nextActions[0]?.checkIds[0];
  if (cited && liveChecks.some((item) => item.definition.id === cited)) {
    return cited;
  }
  return (
    liveChecks.find((item) => item.status === "fail" || item.status === "error")
      ?.definition.id ?? liveChecks[0]?.definition.id
  );
};

const UnlockCodeForm = ({
  maskedEmail,
  checkoutReturned,
  onUnlocked,
}: {
  maskedEmail: string | null;
  checkoutReturned: boolean;
  onUnlocked: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const destination = maskedEmail ?? "the email used at checkout";
  const lede = checkoutReturned
    ? `We sent a code to ${destination}.`
    : `Enter the code we sent to ${destination}.`;

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy("verify");
    try {
      await verifySignInCode(email, code);
      onUnlocked();
    } catch (verifyError) {
      setBusy(null);
      setError(
        verifyError instanceof Error ? verifyError.message : "Invalid code"
      );
    }
  };

  const handleResend = async () => {
    setError(null);
    setResent(false);
    setBusy("resend");
    try {
      await requestSignInCode(email);
      setResent(true);
      setBusy(null);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "Could not send a code"
      );
      setBusy(null);
    }
  };

  return (
    <form className="listwell-report__unlock" onSubmit={handleVerify}>
      <h2 className="vbg-heading-24">Full report with fix steps</h2>
      <p className="vbg-lede">{lede}</p>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="unlock-email">
          Email
        </label>
        <input
          id="unlock-email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus={checkoutReturned}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="unlock-code">
          Code
        </label>
        <input
          id="unlock-code"
          className="vbg-mono"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replaceAll(/\D/gu, "").slice(0, 6))
          }
          required
        />
      </div>
      <div className="listwell-report__unlock-actions">
        <button
          className="listwell-report__button"
          type="submit"
          disabled={busy !== null}
        >
          {busy === "verify" ? "Checking…" : "Unlock report"}
        </button>
        <button
          className="listwell-report__button listwell-report__button--quiet"
          type="button"
          disabled={busy !== null || email.trim().length === 0}
          onClick={() => {
            void handleResend();
          }}
        >
          {busy === "resend" ? "Sending…" : "Send a new code"}
        </button>
      </div>
      {error ? <p className="vbg-error">{error}</p> : null}
      {resent && !error ? (
        <p className="vbg-caption">
          If that email has a Listwell account, we sent a new code.
        </p>
      ) : null}
    </form>
  );
};

const ReportOverviewSection = ({
  summary,
  citationChecks,
  briefCaption,
  onSelectCheck,
}: {
  summary: AuditSummaryResult;
  citationChecks: { id: string; title: string }[];
  briefCaption: string | null;
  onSelectCheck: (id: string) => void;
}) => {
  if (summary.overview.length === 0) {
    return null;
  }
  return (
    <section className="listwell-report__chapter">
      <h2 className="vbg-heading-24">What the checks found</h2>
      <div className="listwell-report__brief">
        {summary.overview.map((claim) => (
          <div key={claim.text} className="listwell-report__claim">
            <p>{claim.text}</p>
            <ReportSource
              checkIds={claim.checkIds}
              checks={citationChecks}
              onSelect={onSelectCheck}
            />
          </div>
        ))}
      </div>
      {briefCaption ? <p className="vbg-caption">{briefCaption}</p> : null}
    </section>
  );
};

const ReportNextActionsSection = ({
  summary,
  citationChecks,
  onSelectCheck,
}: {
  summary: AuditSummaryResult;
  citationChecks: { id: string; title: string }[];
  onSelectCheck: (id: string) => void;
}) => {
  if (summary.nextActions.length > 0) {
    return (
      <section className="listwell-report__chapter">
        <h2 className="vbg-heading-24">What to do next</h2>
        <ol className="listwell-report__actions">
          {summary.nextActions.map((action) => (
            <li key={`${action.priority}-${action.text}`}>
              <span className="listwell-report__action-n">
                {action.priority}
              </span>
              <div>
                <p>{action.text}</p>
                <ReportSource
                  checkIds={action.checkIds}
                  checks={citationChecks}
                  onSelect={onSelectCheck}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  if (summary.overview.length > 0) {
    return (
      <section className="listwell-report__chapter">
        <h2 className="vbg-heading-24">What to do next</h2>
        <p className="vbg-caption">No failed checks to act on.</p>
      </section>
    );
  }
  return null;
};

const ReportPaywallSection = ({
  access,
  redirecting,
  checkoutError,
  onCheckout,
}: {
  access: EntitlementState;
  redirecting: CheckoutPlan | null;
  checkoutError: string | null;
  onCheckout: (plan: CheckoutPlan) => void;
}) => {
  const lede = access.monthlyAvailable
    ? "Unlock fix steps with a one-off report or monthly scans."
    : `Pay ${REPORT_ONCE_PRICE} once to unlock the step-by-step fixes for this business.`;

  return (
    <section className="listwell-report__chapter">
      <div className="listwell-report__unlock">
        <h2 className="vbg-heading-24">Full report with fix steps</h2>
        <p className="vbg-lede">{lede}</p>
        <div className="listwell-report__unlock-actions">
          <button
            className="listwell-report__button"
            type="button"
            disabled={redirecting !== null}
            onClick={() => onCheckout(checkoutPlanSchema.parse("once"))}
          >
            {redirecting === "once"
              ? "Redirecting…"
              : `Full report · ${REPORT_ONCE_PRICE} once`}
          </button>
          {access.monthlyAvailable ? (
            <button
              className="listwell-report__button listwell-report__button--quiet"
              type="button"
              disabled={redirecting !== null}
              onClick={() => onCheckout(checkoutPlanSchema.parse("monthly"))}
            >
              {redirecting === "monthly"
                ? "Redirecting…"
                : `Monthly scans · ${REPORT_MONTHLY_PRICE}`}
            </button>
          ) : null}
        </div>
        {checkoutError ? <p className="vbg-caption">{checkoutError}</p> : null}
      </div>
    </section>
  );
};

const ReportAccessSection = ({
  access,
  checkoutReturned,
  summary,
  citationChecks,
  redirecting,
  checkoutError,
  onSelectCheck,
  onCheckout,
  onUnlocked,
}: {
  access: EntitlementState;
  checkoutReturned: boolean;
  summary: AuditSummaryResult;
  citationChecks: { id: string; title: string }[];
  redirecting: CheckoutPlan | null;
  checkoutError: string | null;
  onSelectCheck: (id: string) => void;
  onCheckout: (plan: CheckoutPlan) => void;
  onUnlocked: () => void;
}) => {
  const showFixSteps = reportShowsFixSteps(access);
  const showCodePrompt = access.unlocked && access.sessionRequired;

  if (showCodePrompt) {
    return (
      <section className="listwell-report__chapter">
        <UnlockCodeForm
          maskedEmail={access.maskedEmail}
          checkoutReturned={checkoutReturned}
          onUnlocked={onUnlocked}
        />
      </section>
    );
  }
  if (showFixSteps) {
    return (
      <ReportNextActionsSection
        summary={summary}
        citationChecks={citationChecks}
        onSelectCheck={onSelectCheck}
      />
    );
  }
  return (
    <ReportPaywallSection
      access={access}
      redirecting={redirecting}
      checkoutError={checkoutError}
      onCheckout={onCheckout}
    />
  );
};

const ScanHistorySection = ({ scans }: { scans: ScanSummary[] }) => {
  if (scans.length === 0) {
    return null;
  }
  return (
    <section className="listwell-report__chapter">
      <h2 className="vbg-heading-24">Scan history</h2>
      <div className="vbg-table-wrap">
        <table>
          <caption className="vbg-caption">
            Monthly visibility scores over time.
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Score</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan, index) => {
              const previous = scans[index + 1];
              const delta =
                scan.score !== null &&
                previous?.score !== null &&
                previous?.score !== undefined
                  ? scan.score - previous.score
                  : null;
              return (
                <tr key={scan.id}>
                  <th scope="row">
                    {formatScanDate(scan.finishedAt ?? scan.startedAt)}
                  </th>
                  <td>{scan.score === null ? "—" : `${scan.score}%`}</td>
                  <td>{formatScanDelta(delta)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ChecksLedgerSection = ({
  groupedChecks,
  checksCaption,
  filter,
  selectedId,
  businessCategory,
  onFilterChange,
  onSelectCheck,
}: {
  groupedChecks: { category: string; items: LiveCheck[] }[];
  checksCaption: string;
  filter: "failures" | "all";
  selectedId: string | undefined;
  businessCategory: Business["category"];
  onFilterChange: (filter: "failures" | "all") => void;
  onSelectCheck: (id: string) => void;
}) => (
  <section className="listwell-report__chapter listwell-report__ledger">
    <div className="listwell-report__ledger-head">
      <h2 className="vbg-heading-24">Checks</h2>
      <fieldset className="listwell-report__filters" aria-label="Check filter">
        <button
          className="listwell-report__filter"
          type="button"
          aria-pressed={filter === "failures"}
          onClick={() => onFilterChange("failures")}
        >
          Failures first
        </button>
        <button
          className="listwell-report__filter"
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          All checks
        </button>
      </fieldset>
    </div>
    <div className="vbg-table-wrap">
      <table className="vbg-custom-checks-table">
        <caption className="vbg-caption">{checksCaption}</caption>
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Status</th>
            <th scope="col" className="vbg-numeric">
              Points
            </th>
          </tr>
        </thead>
        {groupedChecks.map((group) => (
          <tbody key={group.category}>
            <tr className="vbg-custom-channel-group">
              <th scope="colgroup" colSpan={3}>
                {group.category}
              </th>
            </tr>
            {group.items.map((item) => (
              <tr
                key={item.definition.id}
                className={
                  item.definition.id === selectedId
                    ? "vbg-custom-row-selected"
                    : undefined
                }
              >
                <th scope="row">
                  <button
                    type="button"
                    onClick={() => onSelectCheck(item.definition.id)}
                  >
                    {item.definition.title}
                  </button>
                </th>
                <td className={`vbg-custom-status-${item.status}`}>
                  {statusLabel(item.status)}
                </td>
                <td className="vbg-numeric">
                  {pointsFor(item.definition, businessCategory)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  </section>
);

const SelectedCheckSection = ({
  selected,
  selectedDetail,
  businessCategory,
  showFixSteps,
}: {
  selected: LiveCheck;
  selectedDetail: string | undefined;
  businessCategory: Business["category"];
  showFixSteps: boolean;
}) => (
  <section className="listwell-report__chapter">
    <h2 className="vbg-heading-24">{selected.definition.title}</h2>
    <p className="vbg-meta listwell-report__detail-meta">
      {selected.definition.channelCategory}
      {" · "}
      {pointsFor(selected.definition, businessCategory)} points
      {" · "}
      {statusLabel(selected.status)}
      {selectedDetail ? ` · ${selectedDetail}` : ""}
    </p>
    {showFixSteps ? (
      <CheckBody markdown={selected.definition.body} />
    ) : (
      <p className="vbg-caption">Unlock the full report to see fix steps.</p>
    )}
  </section>
);

const ListingsSection = ({
  businessId,
  profiles,
  listingsCaption,
}: {
  businessId: string;
  profiles: ReturnType<typeof businessToProfiles>;
  listingsCaption: string;
}) => (
  <section className="listwell-report__chapter">
    <h2 className="vbg-heading-24">Listings on this audit</h2>
    <p className="vbg-meta listwell-report__detail-meta">
      <Link href={`/${businessId}/edit`}>Edit listings</Link>
    </p>
    <div className="vbg-table-wrap">
      <table>
        <caption className="vbg-caption">{listingsCaption}</caption>
        <thead>
          <tr>
            <th scope="col">Channel</th>
            <th scope="col">Listing</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={`${profile.type}-${profile.title}`}>
              <td>{CHANNEL_CONFIG[profile.type].name}</td>
              <td>
                {profile.title}
                {profile.subtitle ? (
                  <div className="vbg-meta">{profile.subtitle}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export const ReportClient = ({
  initialBusiness,
  checks,
  initialResults,
  initialSummary,
  access: initialAccess,
  checkoutReturned,
  checkJobId,
}: {
  initialBusiness: Business;
  checks: CheckDefinition[];
  initialResults: Record<string, CheckResult>;
  initialSummary: AuditSummaryResult;
  access: EntitlementState;
  checkoutReturned: boolean;
  checkJobId?: string;
}) => {
  const business = useMemo(
    () => businessSchema.parse(initialBusiness),
    [initialBusiness]
  );
  const serverAccess = useMemo(
    () => entitlementStateSchema.parse(initialAccess),
    [initialAccess]
  );
  const [clientAccess, setClientAccess] = useState<EntitlementState | null>(
    null
  );
  const access = clientAccess ?? serverAccess;
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanSummary[]>([]);
  const showFixSteps = reportShowsFixSteps(access);
  const [results, setResults] = useState(() =>
    initialResultsSchema.parse(initialResults)
  );
  const liveChecks = useMemo(
    () => liveChecksFromResults(checks, results),
    [checks, results]
  );
  const [pickedId, setPickedId] = useState<string | undefined>();
  const [filter, setFilter] = useState<"failures" | "all">("failures");
  const [summary, setSummary] = useState<AuditSummaryResult>(() =>
    auditSummaryResultSchema.parse(initialSummary)
  );

  useEffect(() => {
    let cancelled = false;
    const refineAccess = async () => {
      try {
        const next = await fetchEntitlement(business.id);
        if (!cancelled) {
          setClientAccess(next);
        }
      } catch {
        // Keep the server-rendered entitlement.
      }
    };
    void refineAccess();
    return () => {
      cancelled = true;
    };
  }, [business.id]);

  useEffect(() => {
    if (!checkJobId) {
      return;
    }
    let cancelled = false;

    const poll = async (attempt: number): Promise<void> => {
      if (cancelled || attempt >= JOB_POLL_MAX_ATTEMPTS) {
        return;
      }
      await waitForMs(JOB_POLL_INTERVAL_MS);
      if (cancelled) {
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${checkJobId}`);
        if (!response.ok) {
          return;
        }
        const parsed = auditJobPollSchema.safeParse(await response.json());
        if (!parsed.success) {
          return;
        }
        const job = parsed.data;
        if (cancelled) {
          return;
        }
        setResults((current) => {
          const next: Record<string, CheckResult> = { ...current };
          for (const [id, result] of Object.entries(job.results)) {
            if (result) {
              next[id] = result;
            }
          }
          if (job.status === "complete" || job.status === "error") {
            for (const [id, result] of Object.entries(next)) {
              if (result.queued) {
                next[id] = missingCheckResult;
              }
            }
          }
          return next;
        });
        if (job.status === "complete" || job.status === "error") {
          return;
        }
        await poll(attempt + 1);
      } catch {
        // Stop polling if the job endpoint is unreachable.
      }
    };

    void poll(0);
    return () => {
      cancelled = true;
    };
  }, [checkJobId]);

  useEffect(() => {
    if (access.kind !== "report_monthly" || !showFixSteps) {
      return;
    }
    let cancelled = false;
    const loadScans = async () => {
      try {
        const response = await fetch(`/api/businesses/${business.id}/scans`, {
          credentials: "same-origin",
        });
        if (!response.ok) {
          return;
        }
        const payload: unknown = await response.json();
        const parsed = z
          .object({ scans: z.array(scanSummarySchema) })
          .parse(payload);
        if (!cancelled) {
          setScanHistory(parsed.scans);
        }
      } catch {
        // Keep scan history hidden when unavailable.
      }
    };
    void loadScans();
    return () => {
      cancelled = true;
    };
  }, [access.kind, business.id, showFixSteps]);

  useEffect(() => {
    const completedChecks = liveChecks.flatMap((item) => {
      const status = completedStatus(item.status);
      if (!status) {
        return [];
      }
      return [
        completedCheckSchema.parse({
          channelCategory: item.definition.channelCategory,
          id: item.definition.id,
          label: item.result?.label,
          points: pointsFor(item.definition, business.category),
          status,
          title: item.definition.title,
        }),
      ];
    });
    if (completedChecks.length === 0) {
      return;
    }

    let cancelled = false;
    const refineSummary = async () => {
      try {
        const response = await fetch(`/api/businesses/${business.id}/summary`, {
          body: JSON.stringify({ checks: completedChecks }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload: unknown = await response.json();
        const next = auditSummaryResultSchema.parse(payload);
        if (!cancelled && next.available) {
          setSummary(next);
        }
      } catch {
        // Keep the server-rendered fallback brief.
      }
    };
    void refineSummary();
    return () => {
      cancelled = true;
    };
  }, [business.category, business.id, liveChecks]);

  const selectedId = pickedId ?? recommendedCheckId(summary, liveChecks);
  const selected = liveChecks.find((item) => item.definition.id === selectedId);
  const selectedDetail = selected ? detailLabel(selected) : undefined;
  const citationChecks = liveChecks.map((item) => ({
    id: item.definition.id,
    title: item.definition.title,
  }));
  const briefCaption = degradedCaption(summary);
  const counts = visibilityCounts(liveChecks);
  const visibilityScore = scorePercent(counts);

  const visible = liveChecks.filter((item) => {
    if (filter === "all") {
      return true;
    }
    return item.status === "fail" || item.status === "error";
  });
  const groupedChecks = groupVisibleByChannel(visible);

  const profiles = businessToProfiles(business);
  const checksCaption =
    filter === "failures"
      ? `Showing checks that still need attention. ${visible.length} of ${liveChecks.length}.`
      : `Showing all checks. ${visible.length} of ${liveChecks.length}.`;
  const listingsCaption =
    profiles.length === 0
      ? "No listings yet."
      : `${profiles.length} ${profiles.length === 1 ? "listing" : "listings"} on this audit.`;

  const startCheckout = async (plan: CheckoutPlan) => {
    setCheckoutError(null);
    setRedirecting(plan);
    try {
      const url = await requestCheckoutUrl(business.id, plan);
      window.location.assign(url);
    } catch (error) {
      setRedirecting(null);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout failed"
      );
    }
  };

  return (
    <article className="listwell-report">
      <header className="listwell-report__hero">
        <h1 className="vbg-title">{business.name}</h1>
        {access.kind === "report_monthly" ? (
          <p className="vbg-caption listwell-report__badge">
            Monthly scans active
          </p>
        ) : null}
        <p className="vbg-display listwell-report__score-value">{`${visibilityScore}%`}</p>
        <p className="vbg-caption listwell-report__score-caption">
          of scored checks
        </p>
      </header>

      <dl className="listwell-report__stats">
        <div className="listwell-report__stat">
          <dt className="vbg-stat-label">Passing</dt>
          <dd className="vbg-stat-value">{counts.pass}</dd>
        </div>
        <div className="listwell-report__stat">
          <dt className="vbg-stat-label">Need work</dt>
          <dd className="vbg-stat-value">{counts.fail}</dd>
        </div>
        <div className="listwell-report__stat">
          <dt className="vbg-stat-label">Skipped</dt>
          <dd className="vbg-stat-value">{counts.error}</dd>
        </div>
      </dl>

      <ReportOverviewSection
        summary={summary}
        citationChecks={citationChecks}
        briefCaption={briefCaption}
        onSelectCheck={setPickedId}
      />

      <ReportAccessSection
        access={access}
        checkoutReturned={checkoutReturned}
        summary={summary}
        citationChecks={citationChecks}
        redirecting={redirecting}
        checkoutError={checkoutError}
        onSelectCheck={setPickedId}
        onCheckout={(plan) => {
          void startCheckout(plan);
        }}
        onUnlocked={() => {
          window.location.replace(`/${business.id}`);
        }}
      />

      {access.kind === "report_monthly" && scanHistory.length > 0 ? (
        <ScanHistorySection scans={scanHistory} />
      ) : null}

      <ChecksLedgerSection
        groupedChecks={groupedChecks}
        checksCaption={checksCaption}
        filter={filter}
        selectedId={selectedId}
        businessCategory={business.category}
        onFilterChange={setFilter}
        onSelectCheck={setPickedId}
      />

      {selected ? (
        <SelectedCheckSection
          selected={selected}
          selectedDetail={selectedDetail}
          businessCategory={business.category}
          showFixSteps={showFixSteps}
        />
      ) : null}

      <ListingsSection
        businessId={business.id}
        profiles={profiles}
        listingsCaption={listingsCaption}
      />
    </article>
  );
};
