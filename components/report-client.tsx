"use client";

import Link from "next/link";
import { useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { z } from "zod";

import { CheckBody } from "@/components/check-body";
import { ListingReviewSection } from "@/components/listing-review-section";
import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { CheckStatusBadge } from "@/components/listwell/report-ui";
import { ReportShareDialog } from "@/components/report-share-dialog";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  entitlementCheckoutRetryPath,
  reportShowsFixSteps,
} from "@/lib/entitlements-access";
import type { ListingReviewResult } from "@/lib/listing-review";
import {
  fetchEntitlement,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
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
  AuditJobPoll,
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
import { cn } from "@/lib/utils";

const initialResultsSchema = z.record(z.string(), checkResultSchema);
const JOB_POLL_INTERVAL_MS = 2000;
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

const CITATION_PREVIEW = 2;

const ReportSystemNotice = ({ children }: { children: ReactNode }) => (
  <output className="listwell-report__notice">
    <p className="vbg-lede">{children}</p>
  </output>
);

const ReportKvExpiryNotice = ({ days }: { days: number }) => (
  <ReportSystemNotice>
    This report is saved temporarily ({days} days).{" "}
    <Link href="/sign-in?return=%2Faccount">Sign in</Link> to keep it on your
    account once accounts are available.
  </ReportSystemNotice>
);

const ReportBackendUnavailableNotice = () => (
  <ReportSystemNotice>
    We cannot verify unlock status right now. If you have already paid, use
    retry below or check back shortly — your purchase is still recorded.
  </ReportSystemNotice>
);

const ReportPurchasePendingNotice = ({
  checkoutRetryId,
  businessId,
}: {
  checkoutRetryId: string | undefined;
  businessId: string;
}) => {
  const retryHref =
    checkoutRetryId === undefined
      ? null
      : entitlementCheckoutRetryPath(checkoutRetryId, businessId);
  return (
    <ReportSystemNotice>
      Payment received, but we could not activate fix steps yet.{" "}
      {typeof retryHref === "string" ? (
        <a href={retryHref}>Retry activation</a>
      ) : (
        "Refresh this page in a minute"
      )}{" "}
      or wait for the payment webhook. Contact support if this persists.
    </ReportSystemNotice>
  );
};

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

interface UnlockFormState {
  busy: "verify" | "resend" | null;
  code: string;
  email: string;
  error: string | null;
  resent: boolean;
}

type UnlockFormAction =
  | { type: "busy"; busy: UnlockFormState["busy"] }
  | { type: "code"; code: string }
  | { type: "email"; email: string }
  | { type: "error"; error: string | null }
  | { type: "resent" };

const initialUnlockFormState: UnlockFormState = {
  busy: null,
  code: "",
  email: "",
  error: null,
  resent: false,
};

const unlockFormReducer = (
  state: UnlockFormState,
  action: UnlockFormAction
): UnlockFormState => {
  switch (action.type) {
    case "busy": {
      return { ...state, busy: action.busy, error: null, resent: false };
    }
    case "code": {
      return { ...state, code: action.code };
    }
    case "email": {
      return { ...state, email: action.email };
    }
    case "error": {
      return { ...state, busy: null, error: action.error };
    }
    case "resent": {
      return { ...state, busy: null, resent: true };
    }
    default: {
      return state;
    }
  }
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
  const [state, dispatch] = useReducer(
    unlockFormReducer,
    initialUnlockFormState
  );
  const destination = maskedEmail ?? "the email used at checkout";
  const lede = checkoutReturned
    ? `We sent a code to ${destination}.`
    : `Enter the code we sent to ${destination}.`;

  const verifyUnlockCode = async () => {
    dispatch({ busy: "verify", type: "busy" });
    try {
      await verifySignInCode(state.email, state.code);
      onUnlocked();
    } catch (verifyError) {
      dispatch({
        error:
          verifyError instanceof Error ? verifyError.message : "Invalid code",
        type: "error",
      });
    }
  };

  const resendUnlockCode = async () => {
    dispatch({ busy: "resend", type: "busy" });
    try {
      await requestSignInCode(state.email);
      dispatch({ type: "resent" });
    } catch (resendError) {
      dispatch({
        error:
          resendError instanceof Error
            ? resendError.message
            : "Could not send a code",
        type: "error",
      });
    }
  };

  return (
    <form className="listwell-report__unlock" action={verifyUnlockCode}>
      <h2 className="vbg-heading-24">Full report with fix steps</h2>
      <p className="vbg-lede">{lede}</p>
      <FieldGroup className="gap-4 py-2">
        <Field>
          <FieldLabel htmlFor="unlock-email">Email</FieldLabel>
          <Input
            id="unlock-email"
            type="email"
            name="email"
            autoComplete="email"
            value={state.email}
            onChange={(event) =>
              dispatch({ email: event.target.value, type: "email" })
            }
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="unlock-code">Code</FieldLabel>
          <Input
            id="unlock-code"
            className={cn("font-mono tracking-widest")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={state.code}
            onChange={(event) =>
              dispatch({
                code: event.target.value.replaceAll(/\D/gu, "").slice(0, 6),
                type: "code",
              })
            }
            required
          />
        </Field>
      </FieldGroup>
      <FormActions>
        <PrimaryButton type="submit" disabled={state.busy !== null}>
          {state.busy === "verify" ? "Checking…" : "Unlock report"}
        </PrimaryButton>
        <QuietButton
          type="button"
          disabled={state.busy !== null || state.email.trim().length === 0}
          onClick={() => {
            void resendUnlockCode();
          }}
        >
          {state.busy === "resend" ? "Sending…" : "Send a new code"}
        </QuietButton>
      </FormActions>
      {state.error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.resent && !state.error ? (
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
  if (!access.backendAvailable) {
    return (
      <section className="listwell-report__chapter">
        <div className="listwell-report__unlock">
          <h2 className="vbg-heading-24">Full report with fix steps</h2>
          <p className="vbg-lede">
            Account services are temporarily unavailable. Fix steps stay locked
            until we can confirm your entitlement.
          </p>
        </div>
      </section>
    );
  }

  if (!access.paymentsEnabled) {
    return (
      <section className="listwell-report__chapter">
        <div className="listwell-report__unlock">
          <h2 className="vbg-heading-24">Full report with fix steps</h2>
          <p className="vbg-lede">
            Payments are not configured on this environment yet.
          </p>
        </div>
      </section>
    );
  }

  const continuedPlansAvailable =
    access.monthlyAvailable || access.yearlyAvailable;
  const lede = continuedPlansAvailable
    ? "Unlock fix steps with a one-off report or continued scans (monthly or yearly, per business)."
    : `Pay ${REPORT_ONCE_PRICE} once to unlock the step-by-step fixes for this business.`;

  return (
    <section className="listwell-report__chapter">
      <div className="listwell-report__unlock">
        <h2 className="vbg-heading-24">Full report with fix steps</h2>
        <p className="vbg-lede">{lede}</p>
        <FormActions>
          <QuietButton
            type="button"
            disabled={redirecting !== null}
            onClick={() => onCheckout(checkoutPlanSchema.parse("once"))}
          >
            {redirecting === "once"
              ? "Redirecting…"
              : `Full report · ${REPORT_ONCE_PRICE} once`}
          </QuietButton>
          {access.yearlyAvailable ? (
            <PrimaryButton
              type="button"
              disabled={redirecting !== null}
              onClick={() => onCheckout(checkoutPlanSchema.parse("yearly"))}
            >
              {redirecting === "yearly"
                ? "Redirecting…"
                : `Best value · ${REPORT_YEARLY_PRICE}, ${REPORT_YEARLY_VALUE_NOTE}`}
            </PrimaryButton>
          ) : null}
          {access.monthlyAvailable ? (
            <QuietButton
              type="button"
              disabled={redirecting !== null}
              onClick={() => onCheckout(checkoutPlanSchema.parse("monthly"))}
            >
              {redirecting === "monthly"
                ? "Redirecting…"
                : `Monthly scans · ${REPORT_MONTHLY_PRICE}`}
            </QuietButton>
          ) : null}
        </FormActions>
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

const OnceRescanSection = ({
  access,
  businessId,
}: {
  access: EntitlementState;
  businessId: string;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    access.kind !== "report_once" ||
    !access.unlocked ||
    access.sessionRequired ||
    !access.onceRescan?.available
  ) {
    return null;
  }

  return (
    <section className="listwell-report__chapter">
      <h2 className="vbg-heading-24">Re-scan report</h2>
      <p className="vbg-caption">
        Run the checks again after you fix listings. You have{" "}
        {access.onceRescan.remaining} free re-scan
        {access.onceRescan.remaining === 1 ? "" : "s"} within 30 days of
        purchase.
      </p>
      <PrimaryButton
        type="button"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const response = await fetch(
                `/api/businesses/${businessId}/rescan`,
                { method: "POST" }
              );
              const payload: unknown = await response.json();
              if (!response.ok) {
                const message =
                  typeof payload === "object" &&
                  payload !== null &&
                  "error" in payload &&
                  typeof payload.error === "string"
                    ? payload.error
                    : "Re-scan failed";
                setError(message);
                setBusy(false);
                return;
              }
              window.location.reload();
            } catch (rescanError) {
              setError(
                rescanError instanceof Error
                  ? rescanError.message
                  : "Re-scan failed"
              );
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Re-scanning…" : "Re-scan now"}
      </PrimaryButton>
      {error ? <p className="vbg-caption">{error}</p> : null}
    </section>
  );
};

const ScanHistorySection = ({ scans }: { scans: ScanSummary[] }) => {
  if (scans.length === 0) {
    return null;
  }
  return (
    <section className="listwell-report__chapter">
      <h2 className="vbg-heading-24">Scan history</h2>
      <Table>
        <TableCaption>Monthly visibility scores over time.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Score</TableHead>
            <TableHead scope="col">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scans.map((scan, index) => {
            const previous = scans[index + 1];
            const delta =
              scan.score !== null &&
              previous?.score !== null &&
              previous?.score !== undefined
                ? scan.score - previous.score
                : null;
            return (
              <TableRow key={scan.id}>
                <TableCell className="font-medium">
                  {formatScanDate(scan.finishedAt ?? scan.startedAt)}
                </TableCell>
                <TableCell>
                  {scan.score === null ? "—" : `${scan.score}%`}
                </TableCell>
                <TableCell>{formatScanDelta(delta)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
      <Tabs
        value={filter}
        onValueChange={(value) => {
          if (value === "failures" || value === "all") {
            onFilterChange(value);
          }
        }}
        aria-label="Check filter"
      >
        <TabsList variant="line" className="h-auto">
          <TabsTrigger value="failures">Failures first</TabsTrigger>
          <TabsTrigger value="all">All checks</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <Table className="listwell-report__checks-table">
      <TableCaption>{checksCaption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Check</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col" className="text-right">
            Points
          </TableHead>
        </TableRow>
      </TableHeader>
      {groupedChecks.map((group) => (
        <TableBody key={group.category}>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell
              colSpan={3}
              className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
            >
              {group.category}
            </TableCell>
          </TableRow>
          {group.items.map((item) => (
            <TableRow
              key={item.definition.id}
              data-state={
                item.definition.id === selectedId ? "selected" : undefined
              }
              className={
                item.definition.id === selectedId ? "bg-muted/60" : undefined
              }
            >
              <TableCell className="font-medium">
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => onSelectCheck(item.definition.id)}
                >
                  {item.definition.title}
                </button>
              </TableCell>
              <TableCell>
                <CheckStatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pointsFor(item.definition, businessCategory)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
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
  showEditLink,
}: {
  businessId: string;
  profiles: ReturnType<typeof businessToProfiles>;
  listingsCaption: string;
  showEditLink: boolean;
}) => (
  <section className="listwell-report__chapter">
    <h2 className="vbg-heading-24">Listings on this audit</h2>
    {showEditLink ? (
      <p className="vbg-meta listwell-report__detail-meta">
        <Link href={`/${businessId}/edit`}>Edit listings</Link>
      </p>
    ) : null}
    <Table>
      <TableCaption>{listingsCaption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Channel</TableHead>
          <TableHead scope="col">Listing</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((profile) => (
          <TableRow key={`${profile.type}-${profile.title}`}>
            <TableCell>{CHANNEL_CONFIG[profile.type].name}</TableCell>
            <TableCell>
              {profile.title}
              {profile.subtitle ? (
                <div className="text-muted-foreground text-sm">
                  {profile.subtitle}
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </section>
);

const mergeJobResults = (
  base: Record<string, CheckResult>,
  job: AuditJobPoll | undefined
): Record<string, CheckResult> => {
  if (!job) {
    return base;
  }
  const next: Record<string, CheckResult> = { ...base };
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
};

const fetchAuditJob = async (url: string): Promise<AuditJobPoll> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Job poll failed");
  }
  return auditJobPollSchema.parse(await response.json());
};

const fetchScanHistory = async (url: string): Promise<ScanSummary[]> => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("Scans failed");
  }
  const payload: unknown = await response.json();
  return z.object({ scans: z.array(scanSummarySchema) }).parse(payload).scans;
};

const fetchRefinedSummary = async ([, businessId, completedChecks]: [
  "summary",
  string,
  CompletedCheck[],
]): Promise<AuditSummaryResult> => {
  const response = await fetch(`/api/businesses/${businessId}/summary`, {
    body: JSON.stringify({ checks: completedChecks }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload: unknown = await response.json();
  return auditSummaryResultSchema.parse(payload);
};

const useReportLiveData = ({
  business,
  checkJobId,
  checks,
  initialResults,
  initialSummary,
  scanHistoryOverride,
  serverAccess,
  variant,
}: {
  business: Business;
  checkJobId?: string;
  checks: CheckDefinition[];
  initialResults: Record<string, CheckResult>;
  initialSummary: AuditSummaryResult;
  scanHistoryOverride?: ScanSummary[];
  serverAccess: EntitlementState;
  variant: "owner" | "shared";
}) => {
  const parsedInitialResults = useMemo(
    () => initialResultsSchema.parse(initialResults),
    [initialResults]
  );
  const parsedInitialSummary = useMemo(
    () => auditSummaryResultSchema.parse(initialSummary),
    [initialSummary]
  );

  const { data: clientAccess } = useSWR(
    variant === "owner" ? (["entitlement", business.id] as const) : null,
    ([, id]) => fetchEntitlement(id),
    { revalidateOnFocus: false }
  );
  const access = clientAccess ?? serverAccess;
  const showFixSteps = reportShowsFixSteps(access);

  const { data: job } = useSWR(
    checkJobId ? `/api/jobs/${checkJobId}` : null,
    fetchAuditJob,
    {
      refreshInterval: (latest) => {
        if (latest?.status === "complete" || latest?.status === "error") {
          return 0;
        }
        return JOB_POLL_INTERVAL_MS;
      },
      refreshWhenHidden: true,
      revalidateOnFocus: false,
    }
  );

  const results = useMemo(
    () => mergeJobResults(parsedInitialResults, job),
    [job, parsedInitialResults]
  );
  const liveChecks = useMemo(
    () => liveChecksFromResults(checks, results),
    [checks, results]
  );
  const completedChecks = useMemo(
    () =>
      liveChecks.flatMap((item) => {
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
      }),
    [business.category, liveChecks]
  );

  const { data: refinedSummary } = useSWR(
    completedChecks.length > 0
      ? (["summary", business.id, completedChecks] as const)
      : null,
    fetchRefinedSummary,
    { revalidateOnFocus: false }
  );
  const summary =
    refinedSummary?.available === true ? refinedSummary : parsedInitialSummary;

  let scanHistoryUrl: string | null = null;
  if (
    scanHistoryOverride === undefined &&
    variant === "owner" &&
    showFixSteps &&
    (access.kind === "report_monthly" || access.kind === "report_once")
  ) {
    scanHistoryUrl = `/api/businesses/${business.id}/scans`;
  }
  const { data: fetchedScanHistory = [] } = useSWR(
    scanHistoryUrl,
    fetchScanHistory,
    { revalidateOnFocus: false }
  );
  const scanHistory = scanHistoryOverride ?? fetchedScanHistory;

  return { access, liveChecks, scanHistory, showFixSteps, summary };
};

const shouldShowScanHistory = ({
  access,
  isOwner,
  scanCount,
  scanHistoryOverride,
  showFixSteps,
}: {
  access: EntitlementState;
  isOwner: boolean;
  scanCount: number;
  scanHistoryOverride: ScanSummary[] | undefined;
  showFixSteps: boolean;
}): boolean => {
  if (!isOwner || scanCount === 0) {
    return false;
  }
  if (scanHistoryOverride !== undefined) {
    return true;
  }
  return (
    (access.kind === "report_monthly" || access.kind === "report_once") &&
    showFixSteps
  );
};

const ReportSharedBanner = ({
  expiresAt,
}: {
  expiresAt: string | null | undefined;
}) => {
  const expiryLabel =
    expiresAt && !Number.isNaN(Date.parse(expiresAt))
      ? new Date(expiresAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;
  return (
    <ReportSystemNotice>
      Read-only shared report
      {expiryLabel ? ` · link expires ${expiryLabel}` : ""}. Paid fix steps and
      account details are not shown.
    </ReportSystemNotice>
  );
};

const ReportTopNotices = ({
  access,
  businessId,
  checkoutRetryId,
  isOwner,
  kvExpiryDays,
  purchasePending,
  shareExpiresAt,
  showKvExpiryNotice,
}: {
  access: EntitlementState;
  businessId: string;
  checkoutRetryId?: string;
  isOwner: boolean;
  kvExpiryDays: number;
  purchasePending: boolean;
  shareExpiresAt?: string | null;
  showKvExpiryNotice: boolean;
}) => {
  if (isOwner) {
    return (
      <>
        {showKvExpiryNotice ? (
          <ReportKvExpiryNotice days={kvExpiryDays} />
        ) : null}
        {access.backendAvailable ? null : <ReportBackendUnavailableNotice />}
        {purchasePending ? (
          <ReportPurchasePendingNotice
            businessId={businessId}
            checkoutRetryId={checkoutRetryId}
          />
        ) : null}
      </>
    );
  }
  return <ReportSharedBanner expiresAt={shareExpiresAt} />;
};

export const ReportClient = ({
  initialBusiness,
  checks,
  initialResults,
  initialSummary,
  access: initialAccess,
  checkoutReturned,
  checkoutRetryId,
  purchasePending,
  showKvExpiryNotice,
  kvExpiryDays,
  checkJobId,
  variant = "owner",
  shareExpiresAt,
  listingReviewOverride,
  scanHistoryOverride,
}: {
  initialBusiness: Business;
  checks: CheckDefinition[];
  initialResults: Record<string, CheckResult>;
  initialSummary: AuditSummaryResult;
  access: EntitlementState;
  checkoutReturned: boolean;
  checkoutRetryId?: string;
  purchasePending: boolean;
  showKvExpiryNotice: boolean;
  kvExpiryDays: number;
  checkJobId?: string;
  variant?: "owner" | "shared";
  shareExpiresAt?: string | null;
  /** Dev UI fixture only — skips listing review fetch when set. */
  listingReviewOverride?: ListingReviewResult;
  /** Dev UI fixture only — skips scan history fetch when set. */
  scanHistoryOverride?: ScanSummary[];
}) => {
  const business = useMemo(
    () => businessSchema.parse(initialBusiness),
    [initialBusiness]
  );
  const serverAccess = useMemo(
    () => entitlementStateSchema.parse(initialAccess),
    [initialAccess]
  );
  const { access, liveChecks, scanHistory, showFixSteps, summary } =
    useReportLiveData({
      business,
      checkJobId,
      checks,
      initialResults,
      initialSummary,
      scanHistoryOverride,
      serverAccess,
      variant,
    });
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);
  const [pickedId, setPickedId] = useState<string | undefined>();
  const [filter, setFilter] = useState<"failures" | "all">("failures");
  const [shareOpen, setShareOpen] = useState(false);
  const isOwner = variant === "owner";

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
    <article
      className={
        isOwner ? "listwell-report" : "listwell-report listwell-report--shared"
      }
    >
      {shareOpen ? (
        <ReportShareDialog
          businessId={business.id}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      <ReportTopNotices
        access={access}
        businessId={business.id}
        checkoutRetryId={checkoutRetryId}
        isOwner={isOwner}
        kvExpiryDays={kvExpiryDays}
        purchasePending={purchasePending}
        shareExpiresAt={shareExpiresAt}
        showKvExpiryNotice={showKvExpiryNotice}
      />
      <header className="listwell-report__hero">
        <div className="listwell-report__hero-top">
          <h1 className="vbg-title">{business.name}</h1>
          <div className="listwell-report__toolbar listwell-report__toolbar--screen">
            {isOwner ? (
              <QuietButton type="button" onClick={() => setShareOpen(true)}>
                Share
              </QuietButton>
            ) : null}
            <PrimaryButton type="button" onClick={() => window.print()}>
              Download PDF / Print
            </PrimaryButton>
          </div>
        </div>
        {isOwner && access.kind === "report_monthly" ? (
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

      {isOwner ? (
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
      ) : null}

      <ListingReviewSection
        businessId={business.id}
        showContent={showFixSteps}
        listingReviewOverride={listingReviewOverride}
      />

      {isOwner ? (
        <OnceRescanSection access={access} businessId={business.id} />
      ) : null}

      {shouldShowScanHistory({
        access,
        isOwner,
        scanCount: scanHistory.length,
        scanHistoryOverride,
        showFixSteps,
      }) ? (
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
        showEditLink={isOwner}
      />
      <footer aria-hidden="true" className="listwell-report__print-footer">
        <p className="vbg-caption">
          Listwell · listwell.dev · local SEO audit for Australian businesses
        </p>
      </footer>
    </article>
  );
};
