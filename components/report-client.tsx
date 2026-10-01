"use client";

import {
  ChevronDownIcon,
  FileDownloadIcon,
  PrinterIcon,
  Share01Icon,
} from "@hugeicons/core-free-icons";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import useSWR from "swr";
import { z } from "zod";

import { Button } from "@/components/atoms/button";
import {
  BusinessNameHeading,
  MonthlyScansUpgradeDialog,
  ReportActionLabel,
  reportActionClass,
  ReportAllocation,
} from "@/components/chat-report-insight";
import { FixGuide } from "@/components/check-body";
import { Icon } from "@/components/icon";
import { ListingReviewSection } from "@/components/listing-review-section";
import { PrimaryButton, QuietButton } from "@/components/listwell/actions";
import {
  CheckStatusMark,
  checkStatusText,
} from "@/components/listwell/report-ui";
import {
  PeerComparisonSection,
  NextFixSection,
} from "@/components/peer-comparison-section";
import GlideMenu from "@/components/primitives/glide-menu";
import { ReportShareDialog } from "@/components/report-share-dialog";
import { ResearchSections } from "@/components/research-sections";
import { SearchPhrasesSection } from "@/components/search-phrases-section";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  reportResearchChrome,
  reportShowsFixSteps,
  reportShowsPurchasePrices,
} from "@/lib/entitlements-access";
import {
  FIX_DIFFICULTY_LABEL,
  FIX_SEVERITY_LABEL,
  formatFixDuration,
  planNextActions,
} from "@/lib/fix-plan";
import type { PlannedFix, PlannedFixGroup } from "@/lib/fix-plan";
import type { ListingReviewResult } from "@/lib/listing-review";
import type { PeerAuditJob } from "@/lib/peers";
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
import { businessToProfiles, profileViewHref } from "@/lib/profiles";
import {
  buildReportPdf,
  downloadReportPdf,
  reportPdfEditionSchema,
  reportPdfFilename,
} from "@/lib/report-pdf";
import { canManageReportShareFromAccess } from "@/lib/report-share-access";
import { CONTINUED_REPORT_COPY } from "@/lib/research-report";
import type { ResearchView } from "@/lib/research-view";
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

const ResearchHistory = dynamic(
  async () => {
    const mod = await import("@/components/research-history");
    return mod.ResearchHistory;
  },
  {
    loading: () => (
      <p className="listwell-panel__fine">Loading change over time.</p>
    ),
  }
);

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
  "Apple Business Profile",
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

const formatScanDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("en-AU", {
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
  <output className="listwell-notice">{children}</output>
);

const ChevronIcon = () => (
  <Icon className="listwell-panel__chevron" icon={ChevronDownIcon} size={15} />
);

const Disclosure = ({
  children,
  id,
  open,
}: {
  children: ReactNode;
  id: string;
  open: boolean;
}) => (
  <div
    className="listwell-disclosure"
    data-open={open ? "true" : "false"}
    id={id}
    inert={open ? undefined : true}
  >
    <div className="listwell-disclosure__clip">{children}</div>
  </div>
);

const PanelHead = ({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children?: ReactNode;
}) => (
  <div className="listwell-panel__head">
    <h2 id={id} className="listwell-panel__title">
      {title}
    </h2>
    {children ? (
      <div className="listwell-panel__actions">{children}</div>
    ) : null}
  </div>
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
    retry below or check back shortly. Your purchase is still recorded.
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
    <span className="listwell-chips">
      {named.map((checkId) => (
        <button
          key={checkId}
          className="listwell-chip"
          type="button"
          onClick={() => onSelect(checkId)}
        >
          {titleForCheck(checks, checkId)}
        </button>
      ))}
      {extra > 0 ? (
        <span className="listwell-panel__fine">+{extra} more</span>
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
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="listwell-panel__fine">From</span>
    <CitationLinks checkIds={checkIds} checks={checks} onSelect={onSelect} />
  </div>
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

const needsWork = (item: LiveCheck): boolean =>
  item.status === "fail" || item.status === "error";

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
    <form
      className="listwell-panel"
      action={verifyUnlockCode}
      aria-labelledby="report-unlock"
    >
      <PanelHead id="report-unlock" title="Full report with fix steps" />
      <div className="listwell-panel__body">
        <p className="listwell-panel__text">{lede}</p>
        <FieldGroup className="gap-4">
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
              className="font-mono tracking-widest"
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
        {state.error ? (
          <p className="listwell-panel__error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.resent && !state.error ? (
          <p className="listwell-panel__note" aria-live="polite">
            If that email has a Listwell account, we sent a new code.
          </p>
        ) : null}
      </div>
      <div className="listwell-panel__foot">
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
      </div>
    </form>
  );
};

const ReportOverviewSection = ({
  summary,
  className,
}: {
  summary: AuditSummaryResult;
  className?: string;
}) => {
  if (summary.overview.length === 0) {
    return null;
  }
  return (
    <section
      className={["listwell-panel", className].filter(Boolean).join(" ")}
      aria-labelledby="report-overview"
    >
      <PanelHead id="report-overview" title="What the checks found" />
      {summary.overview.map((claim) => (
        <div key={claim.text} className="listwell-panel__body">
          <p className="listwell-panel__text">{claim.text}</p>
        </div>
      ))}
    </section>
  );
};

const nextActionKey = (action: PlannedFix["action"]): string =>
  `${action.priority}-${action.checkIds.join("-")}`;

const firstFixPlanBandId = (groups: PlannedFixGroup[]): string | null => {
  const [firstGroup] = groups;
  const [firstBand] = firstGroup?.bands ?? [];
  if (!(firstGroup && firstBand)) {
    return null;
  }
  return `next-${firstGroup.difficulty}-${firstBand.severity}`;
};

const PanelGroupToggle = ({
  controls,
  expanded,
  onToggle,
  sub,
  children,
}: {
  controls: string;
  expanded: boolean;
  onToggle: () => void;
  sub?: boolean;
  children: ReactNode;
}) => (
  <div
    className={[
      "listwell-panel__group m-0",
      sub ? "listwell-panel__group--sub" : null,
    ]
      .filter(Boolean)
      .join(" ")}
  >
    <button
      type="button"
      className="listwell-panel__group-button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className="listwell-panel__group-button-labels">{children}</span>
      <ChevronIcon />
    </button>
  </div>
);

const NextActionRow = ({
  item,
  openKey,
  citationChecks,
  definitions,
  onOpen,
  onSelectCheck,
}: {
  item: PlannedFix;
  openKey: string | null;
  citationChecks: { id: string; title: string }[];
  definitions: CheckDefinition[];
  onOpen: (key: string) => void;
  onSelectCheck: (id: string) => void;
}) => {
  const key = nextActionKey(item.action);
  const open = openKey === key;
  const panelId = `next-${key}`;
  const guides = item.action.checkIds.flatMap((checkId) => {
    const definition = definitions.find((entry) => entry.id === checkId);
    return definition ? [definition] : [];
  });
  return (
    <li>
      <button
        type="button"
        className="listwell-panel__row listwell-panel__row--top"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpen(key)}
      >
        <span className="listwell-step" aria-hidden>
          {item.rank}
        </span>
        <span className="listwell-panel__row-main">
          <span className="listwell-panel__row-title">{item.action.text}</span>
          {item.minutes === null ? null : (
            <span className="listwell-panel__row-meta">
              {formatFixDuration(item.minutes)}
            </span>
          )}
        </span>
        <ChevronIcon />
      </button>
      <div className="listwell-action__rest">
        <ReportSource
          checkIds={item.action.checkIds}
          checks={citationChecks}
          onSelect={onSelectCheck}
        />
        <Disclosure id={panelId} open={open}>
          <div className="listwell-fix-stack">
            {guides.map((definition) => (
              <div key={definition.id}>
                {guides.length > 1 ? (
                  <p className="listwell-panel__row-title">
                    {definition.title}
                  </p>
                ) : null}
                <FixGuide body={definition.body} />
              </div>
            ))}
          </div>
        </Disclosure>
      </div>
    </li>
  );
};

const ReportNextActionsSection = ({
  summary,
  groups,
  citationChecks,
  definitions,
  onSelectCheck,
}: {
  summary: AuditSummaryResult;
  groups: PlannedFixGroup[];
  citationChecks: { id: string; title: string }[];
  definitions: CheckDefinition[];
  onSelectCheck: (id: string) => void;
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => {
    setOpenKey(openKey === key ? null : key);
  };
  const [openDifficultyIds, setOpenDifficultyIds] = useState<
    Set<PlannedFixGroup["difficulty"]>
  >(() => {
    const [first] = groups;
    return first ? new Set([first.difficulty]) : new Set();
  });
  const [openBandIds, setOpenBandIds] = useState<Set<string>>(() => {
    const firstBandId = firstFixPlanBandId(groups);
    return firstBandId ? new Set([firstBandId]) : new Set();
  });
  const toggleDifficulty = (difficulty: PlannedFixGroup["difficulty"]) => {
    setOpenDifficultyIds((current) => {
      const next = new Set(current);
      if (next.has(difficulty)) {
        next.delete(difficulty);
      } else {
        next.add(difficulty);
      }
      return next;
    });
  };
  const toggleBand = (bandId: string) => {
    setOpenBandIds((current) => {
      const next = new Set(current);
      if (next.has(bandId)) {
        next.delete(bandId);
      } else {
        next.add(bandId);
      }
      return next;
    });
  };

  if (groups.length > 0) {
    return (
      <section className="listwell-panel" aria-labelledby="report-next">
        <PanelHead id="report-next" title="What to do next" />
        {groups.map((group, groupIndex) => {
          let count = 0;
          for (const band of group.bands) {
            count += band.actions.length;
          }
          const tierOpen = openDifficultyIds.has(group.difficulty);
          const tierPanelId = `next-tier-${group.difficulty}`;
          return (
            <div key={group.difficulty} className="listwell-next-group">
              <PanelGroupToggle
                controls={tierPanelId}
                expanded={tierOpen}
                onToggle={() => {
                  toggleDifficulty(group.difficulty);
                }}
              >
                <span>{FIX_DIFFICULTY_LABEL[group.difficulty]}</span>
                <span className="listwell-panel__mono">
                  {groupIndex === 0 ? "Start here" : count}
                </span>
              </PanelGroupToggle>
              <Disclosure id={tierPanelId} open={tierOpen}>
                <div>
                  {group.bands.map((band) => {
                    const bandId = `next-${group.difficulty}-${band.severity}`;
                    const bandPanelId = `${bandId}-rows`;
                    const bandOpen = openBandIds.has(bandId);
                    return (
                      <div key={band.severity}>
                        <PanelGroupToggle
                          controls={bandPanelId}
                          expanded={bandOpen}
                          sub
                          onToggle={() => {
                            toggleBand(bandId);
                          }}
                        >
                          <span id={bandId}>
                            {FIX_SEVERITY_LABEL[band.severity]}
                          </span>
                          <span className="listwell-panel__mono">
                            {band.actions.length}
                          </span>
                        </PanelGroupToggle>
                        <Disclosure id={bandPanelId} open={bandOpen}>
                          <ol
                            className="listwell-panel__rows"
                            aria-labelledby={bandId}
                          >
                            {band.actions.map((item) => (
                              <NextActionRow
                                key={nextActionKey(item.action)}
                                item={item}
                                openKey={openKey}
                                citationChecks={citationChecks}
                                definitions={definitions}
                                onOpen={toggle}
                                onSelectCheck={onSelectCheck}
                              />
                            ))}
                          </ol>
                        </Disclosure>
                      </div>
                    );
                  })}
                </div>
              </Disclosure>
            </div>
          );
        })}
      </section>
    );
  }
  if (summary.overview.length > 0) {
    return (
      <section className="listwell-panel" aria-labelledby="report-next">
        <PanelHead id="report-next" title="What to do next" />
        <div className="listwell-panel__body">
          <p className="listwell-panel__note">No failed checks to act on.</p>
        </div>
      </section>
    );
  }
  return null;
};

const PaywallPanel = ({
  children,
  foot,
}: {
  children: ReactNode;
  foot?: ReactNode;
}) => (
  <section className="listwell-panel" aria-labelledby="report-paywall">
    <PanelHead id="report-paywall" title="Full report with fix steps" />
    <div className="listwell-panel__body">{children}</div>
    {foot ? <div className="listwell-panel__foot">{foot}</div> : null}
  </section>
);

const ReportPaywallSection = ({ access }: { access: EntitlementState }) => {
  if (!access.backendAvailable) {
    return (
      <PaywallPanel>
        <p className="listwell-panel__note">
          Account services are temporarily unavailable. Fix steps stay locked
          until we can confirm your entitlement.
        </p>
      </PaywallPanel>
    );
  }

  if (!access.paymentsEnabled) {
    return (
      <PaywallPanel>
        <p className="listwell-panel__note">
          Payments are not configured on this environment yet.
        </p>
      </PaywallPanel>
    );
  }

  return null;
};

const ReportPriceActions = ({
  access,
  redirecting,
  checkoutError,
  onCheckout,
}: {
  access: EntitlementState;
  redirecting: CheckoutPlan | null;
  checkoutError: string | null;
  onCheckout: (plan: CheckoutPlan) => void;
}) => (
  <div className="listwell-report__prices flex flex-col gap-1.5">
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className="vbg-visually-hidden">Report prices</legend>
      {access.monthlyAvailable ? (
        <Button
          type="button"
          variant={access.yearlyAvailable ? "secondary" : "primary"}
          className={`${reportActionClass} w-full flex-none`}
          disabled={redirecting !== null}
          onClick={() => onCheckout(checkoutPlanSchema.parse("monthly"))}
        >
          <ReportActionLabel
            title={redirecting === "monthly" ? "Redirecting…" : "Monthly scans"}
            caption={
              redirecting === "monthly" ? undefined : REPORT_MONTHLY_PRICE
            }
          />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-row gap-1.5">
        {access.yearlyAvailable ? (
          <PrimaryButton
            type="button"
            className={reportActionClass}
            disabled={redirecting !== null}
            onClick={() => onCheckout(checkoutPlanSchema.parse("yearly"))}
          >
            <ReportActionLabel
              title={redirecting === "yearly" ? "Redirecting…" : "Best value"}
              caption={
                redirecting === "yearly"
                  ? undefined
                  : `${REPORT_YEARLY_PRICE}, ${REPORT_YEARLY_VALUE_NOTE}`
              }
            />
          </PrimaryButton>
        ) : null}
        <Button
          type="button"
          variant={
            access.yearlyAvailable || access.monthlyAvailable
              ? "secondary"
              : "primary"
          }
          className={reportActionClass}
          disabled={redirecting !== null}
          onClick={() => onCheckout(checkoutPlanSchema.parse("once"))}
        >
          <ReportActionLabel
            title={redirecting === "once" ? "Redirecting…" : "Full report"}
            caption={
              redirecting === "once" ? undefined : `${REPORT_ONCE_PRICE} once`
            }
          />
        </Button>
      </div>
    </fieldset>
    {checkoutError ? (
      <p className="listwell-panel__error" role="alert">
        {checkoutError}
      </p>
    ) : null}
  </div>
);

const ReportAccessSection = ({
  access,
  checkoutReturned,
  summary,
  fixPlan,
  citationChecks,
  definitions,
  onSelectCheck,
  onUnlocked,
}: {
  access: EntitlementState;
  checkoutReturned: boolean;
  summary: AuditSummaryResult;
  fixPlan: PlannedFixGroup[];
  citationChecks: { id: string; title: string }[];
  definitions: CheckDefinition[];
  onSelectCheck: (id: string) => void;
  onUnlocked: () => void;
}) => {
  const showFixSteps = reportShowsFixSteps(access);
  const showCodePrompt = access.unlocked && access.sessionRequired;

  if (showCodePrompt) {
    return (
      <UnlockCodeForm
        maskedEmail={access.maskedEmail}
        checkoutReturned={checkoutReturned}
        onUnlocked={onUnlocked}
      />
    );
  }
  if (showFixSteps) {
    return (
      <ReportNextActionsSection
        summary={summary}
        groups={fixPlan}
        citationChecks={citationChecks}
        definitions={definitions}
        onSelectCheck={onSelectCheck}
      />
    );
  }
  return <ReportPaywallSection access={access} />;
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
    <section className="listwell-panel" aria-labelledby="report-rescan">
      <PanelHead id="report-rescan" title="Re-scan report" />
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          Run the checks again after you fix listings. You have{" "}
          {access.onceRescan.remaining} free re-scan
          {access.onceRescan.remaining === 1 ? "" : "s"} within 30 days of
          purchase.
        </p>
      </div>
      <div className="listwell-panel__foot">
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
        {error ? (
          <p className="listwell-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
};

const scanDeltaClass = (delta: number | null): string => {
  if (delta === null || delta === 0) {
    return "listwell-panel__mono";
  }
  return delta > 0
    ? "listwell-pill listwell-pill--green"
    : "listwell-pill listwell-pill--red";
};

const ScanHistorySection = ({ scans }: { scans: ScanSummary[] }) => {
  if (scans.length === 0) {
    return null;
  }
  return (
    <section className="listwell-panel" aria-labelledby="report-scans">
      <PanelHead id="report-scans" title="Scan history" />
      <table className="listwell-panel__table">
        <caption className="vbg-visually-hidden">
          Monthly visibility scores over time.
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col" className="listwell-panel__numeric">
              Score
            </th>
            <th scope="col" className="listwell-panel__numeric">
              Change
            </th>
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
                <td>{formatScanDate(scan.finishedAt ?? scan.startedAt)}</td>
                <td className="listwell-panel__numeric font-medium">
                  {scan.score === null ? "—" : `${scan.score}%`}
                </td>
                <td className="listwell-panel__numeric">
                  <span className={scanDeltaClass(delta)}>
                    {formatScanDelta(delta)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

const CheckRow = ({
  item,
  expanded,
  businessCategory,
  showFixSteps,
  onToggle,
}: {
  item: LiveCheck;
  expanded: boolean;
  businessCategory: Business["category"];
  showFixSteps: boolean;
  onToggle: (id: string) => void;
}) => {
  const { id } = item.definition;
  const detail = detailLabel(item);
  const points = pointsFor(item.definition, businessCategory);
  return (
    <li id={`check-${id}`}>
      <button
        type="button"
        className="listwell-panel__row"
        aria-expanded={expanded}
        aria-controls={`check-${id}-detail`}
        onClick={() => onToggle(id)}
      >
        <CheckStatusMark status={item.status} />
        <span className="listwell-panel__row-main">
          <span className="listwell-panel__row-title">
            {item.definition.title}
          </span>
          {detail && !expanded ? (
            <span className="listwell-panel__row-meta line-clamp-1">
              {detail}
            </span>
          ) : null}
        </span>
        <span className="listwell-panel__mono">
          {points} {points === 1 ? "pt" : "pts"}
        </span>
        <ChevronIcon />
      </button>
      <Disclosure id={`check-${id}-detail`} open={expanded}>
        <div className="listwell-panel__detail">
          <p className="listwell-panel__row-meta">
            {item.definition.channelCategory}
            {" · "}
            {points} {points === 1 ? "point" : "points"}
            {" · "}
            {checkStatusText(item.status)}
            {detail ? ` · ${detail}` : ""}
          </p>
          {showFixSteps ? (
            <FixGuide body={item.definition.body} />
          ) : (
            <p className="listwell-panel__note">
              Unlock the full report to see fix steps.
            </p>
          )}
        </div>
      </Disclosure>
    </li>
  );
};

const ChecksLedgerSection = ({
  groupedChecks,
  checksCaption,
  filter,
  expandedId,
  businessCategory,
  showFixSteps,
  onFilterChange,
  onToggleCheck,
}: {
  groupedChecks: { category: string; items: LiveCheck[] }[];
  checksCaption: string;
  filter: "failures" | "all";
  expandedId: string | null | undefined;
  businessCategory: Business["category"];
  showFixSteps: boolean;
  onFilterChange: (filter: "failures" | "all") => void;
  onToggleCheck: (id: string) => void;
}) => (
  <section
    className="listwell-panel listwell-report__ledger"
    aria-labelledby="report-checks"
  >
    <PanelHead id="report-checks" title="Checks">
      <button
        type="button"
        className="listwell-panel__action"
        aria-pressed={filter === "failures"}
        onClick={() => onFilterChange("failures")}
      >
        Needs work
      </button>
      <button
        type="button"
        className="listwell-panel__action"
        aria-pressed={filter === "all"}
        onClick={() => onFilterChange("all")}
      >
        All
      </button>
    </PanelHead>
    {groupedChecks.length === 0 ? (
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">
          Nothing needs work right now. Show all checks to review what passed.
        </p>
      </div>
    ) : null}
    {groupedChecks.map((group) => (
      <div key={group.category}>
        <h3 className="listwell-panel__group m-0">
          <span>{group.category}</span>
          <span className="listwell-panel__mono">{group.items.length}</span>
        </h3>
        <ul className="listwell-panel__rows">
          {group.items.map((item) => (
            <CheckRow
              key={item.definition.id}
              item={item}
              expanded={item.definition.id === expandedId}
              businessCategory={businessCategory}
              showFixSteps={showFixSteps}
              onToggle={onToggleCheck}
            />
          ))}
        </ul>
      </div>
    ))}
    <div className="listwell-panel__foot">
      <p className="listwell-panel__fine" aria-live="polite">
        {checksCaption}
      </p>
    </div>
  </section>
);

const ListingsSection = ({
  businessId,
  profiles,
  showEditLink,
}: {
  businessId: string;
  profiles: ReturnType<typeof businessToProfiles>;
  showEditLink: boolean;
}) => (
  <section className="listwell-panel" aria-labelledby="report-listings">
    <PanelHead id="report-listings" title="Listings on this audit">
      {showEditLink ? (
        <Link className="listwell-panel__action" href={`/${businessId}/edit`}>
          Edit listings
        </Link>
      ) : null}
    </PanelHead>
    {profiles.length === 0 ? (
      <div className="listwell-panel__body">
        <p className="listwell-panel__note">No listings yet.</p>
      </div>
    ) : (
      <ul className="listwell-panel__rows">
        {profiles.map((profile) => {
          const href = profileViewHref(profile);
          const content = (
            <span className="listwell-panel__row-main">
              <span className="listwell-panel__row-title break-all">
                {profile.title}
              </span>
              <span className="listwell-panel__row-meta">
                {[CHANNEL_CONFIG[profile.type].name, profile.subtitle]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          );
          return (
            <li key={`${profile.type}-${profile.title}`}>
              {href ? (
                <a
                  className="listwell-panel__row"
                  href={href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {content}
                </a>
              ) : (
                <div className="listwell-panel__row">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    )}
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
      ? new Date(expiresAt).toLocaleDateString("en-AU", {
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

interface ReportUiState {
  checkoutError: string | null;
  filter: "failures" | "all";
  monthlyUpgradeOpen: boolean;
  pickedId: string | null | undefined;
  redirecting: CheckoutPlan | null;
  shareOpen: boolean;
}

type ReportUiAction =
  | { type: "set-error"; error: string }
  | { type: "clear-error" }
  | { type: "set-redirecting"; plan: CheckoutPlan | null }
  | { type: "set-monthly-upgrade-open"; open: boolean }
  | { type: "set-picked-id"; id: string | null }
  | { type: "set-filter"; filter: "failures" | "all" }
  | { type: "set-share-open"; open: boolean };

const initialReportUiState: ReportUiState = {
  checkoutError: null,
  filter: "failures",
  monthlyUpgradeOpen: false,
  pickedId: undefined,
  redirecting: null,
  shareOpen: false,
};

const reportUiReducer = (
  state: ReportUiState,
  action: ReportUiAction
): ReportUiState => {
  switch (action.type) {
    case "set-error": {
      return { ...state, checkoutError: action.error };
    }
    case "clear-error": {
      return { ...state, checkoutError: null };
    }
    case "set-redirecting": {
      return { ...state, redirecting: action.plan };
    }
    case "set-picked-id": {
      return { ...state, pickedId: action.id };
    }
    case "set-filter": {
      return { ...state, filter: action.filter };
    }
    case "set-share-open": {
      return { ...state, shareOpen: action.open };
    }
    case "set-monthly-upgrade-open": {
      return { ...state, monthlyUpgradeOpen: action.open };
    }
    default: {
      return state;
    }
  }
};

const reportPdfPayload = ({
  businessName,
  counts,
  fixPlan,
  liveChecks,
  overview,
  showFixSteps,
  visibilityScore,
}: {
  businessName: string;
  counts: { pass: number; fail: number; error: number };
  fixPlan: PlannedFixGroup[];
  liveChecks: LiveCheck[];
  overview: AuditSummaryResult["overview"];
  showFixSteps: boolean;
  visibilityScore: number;
}) => ({
  businessName,
  checks: liveChecks.map((item) => ({
    category: item.definition.channelCategory,
    detail: detailLabel(item),
    status: checkStatusText(item.status),
    title: item.definition.title,
  })),
  edition: reportPdfEditionSchema.parse(showFixSteps ? "final" : "preview"),
  generatedAt: new Date().toISOString(),
  needsWork: counts.fail,
  nextActionSections: showFixSteps
    ? fixPlan.flatMap((group) =>
        group.bands.map((band) => ({
          actions: band.actions.map((item) => item.action.text),
          title: `${FIX_DIFFICULTY_LABEL[group.difficulty]}, ${FIX_SEVERITY_LABEL[band.severity].toLowerCase()}`,
        }))
      )
    : [],
  nextActions: [],
  overview: overview.map((claim) => claim.text),
  passing: counts.pass,
  score: visibilityScore,
  skipped: counts.error,
});

const shareMenuIconClass = "listwell-account-menu__icon";

const shareMenuItems = (menu: HTMLElement | null): HTMLElement[] => {
  if (!menu) {
    return [];
  }
  return [...menu.querySelectorAll("[role='menuitem']")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  );
};

const ReportHeaderShareMenu = ({
  businessName,
  canManageShare,
  counts,
  fixPlan,
  liveChecks,
  overview,
  showFixSteps,
  visibilityScore,
  onShare,
}: {
  businessName: string;
  canManageShare: boolean;
  counts: { pass: number; fail: number; error: number };
  fixPlan: PlannedFixGroup[];
  liveChecks: LiveCheck[];
  overview: AuditSummaryResult["overview"];
  showFixSteps: boolean;
  visibilityScore: number;
  onShare: () => void;
}) => {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);
  const onDismissMenu = useEffectEvent((restoreFocus = false) => {
    close(restoreFocus);
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const { target } = event;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      onDismissMenu();
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onDismissMenu(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const items = shareMenuItems(menuRef.current);
    items[0]?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute("role") !== "menuitem"
    ) {
      return;
    }

    const items = shareMenuItems(menuRef.current);
    if (items.length === 0) {
      return;
    }

    const { activeElement } = document;
    const current =
      activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const index = current === -1 ? 0 : (current + 1) % items.length;
      items[index]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const index =
        current === -1
          ? items.length - 1
          : (current - 1 + items.length) % items.length;
      items[index]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const savePdf = () => {
    const payload = reportPdfPayload({
      businessName,
      counts,
      fixPlan,
      liveChecks,
      overview,
      showFixSteps,
      visibilityScore,
    });
    downloadReportPdf(
      buildReportPdf(payload),
      reportPdfFilename(businessName, payload.edition ?? "preview")
    );
  };

  return (
    <div ref={rootRef} className="listwell-panel__share-menu print:hidden">
      <button
        ref={triggerRef}
        type="button"
        className="listwell-panel__action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Icon icon={Share01Icon} size={14} />
        Share
        <Icon icon={ChevronDownIcon} size={12} aria-hidden />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label="Share and export"
          className="listwell-account-menu"
          onKeyDown={handleMenuKeyDown}
        >
          <GlideMenu className="listwell-account-menu__list">
            {canManageShare ? (
              <button
                type="button"
                role="menuitem"
                data-menu-row
                className="listwell-account-menu__item"
                onClick={() => {
                  close();
                  onShare();
                }}
              >
                <Icon
                  className={shareMenuIconClass}
                  icon={Share01Icon}
                  size={15}
                />
                Share link
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              data-menu-row
              className="listwell-account-menu__item"
              onClick={() => {
                close();
                window.print();
              }}
            >
              <Icon
                className={shareMenuIconClass}
                icon={PrinterIcon}
                size={15}
              />
              Print
            </button>
            <button
              type="button"
              role="menuitem"
              data-menu-row
              className="listwell-account-menu__item"
              onClick={() => {
                close();
                savePdf();
              }}
            >
              <Icon
                className={shareMenuIconClass}
                icon={FileDownloadIcon}
                size={15}
              />
              Save PDF
            </button>
          </GlideMenu>
        </div>
      ) : null}
    </div>
  );
};

const ReportHeader = ({
  access,
  businessId,
  businessName,
  canManageShare,
  counts,
  fixPlan,
  isOwner,
  liveChecks,
  overview,
  prices,
  showFixSteps,
  visibilityScore,
  onRename,
  onShare,
}: {
  access: EntitlementState;
  businessId: string;
  businessName: string;
  canManageShare: boolean;
  counts: { pass: number; fail: number; error: number };
  fixPlan: PlannedFixGroup[];
  isOwner: boolean;
  liveChecks: LiveCheck[];
  overview: AuditSummaryResult["overview"];
  prices?: ReactNode;
  showFixSteps: boolean;
  visibilityScore: number;
  onRename: (name: string) => void;
  onShare: () => void;
}) => (
  <header className="listwell-panel" aria-labelledby="report-title">
    <div className="listwell-panel__head">
      <p className="listwell-panel__title">
        {isOwner ? "Visibility report" : "Shared report"}
      </p>
      <div className="listwell-panel__actions">
        <ReportHeaderShareMenu
          businessName={businessName}
          canManageShare={canManageShare}
          counts={counts}
          fixPlan={fixPlan}
          liveChecks={liveChecks}
          overview={overview}
          showFixSteps={showFixSteps}
          visibilityScore={visibilityScore}
          onShare={onShare}
        />
      </div>
    </div>
    <div className="listwell-panel__body">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BusinessNameHeading
          businessId={businessId}
          canRename={isOwner}
          name={businessName}
          onRenamed={onRename}
        />
        {isOwner && access.kind === "report_monthly" ? (
          <span className="listwell-pill listwell-pill--green">
            Monthly scans active
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-ink m-0 text-3xl font-semibold tracking-tight">
          {visibilityScore}%
          <span className="text-ink-2 text-lg font-normal"> visibility</span>
        </p>
        <ReportAllocation
          stats={{
            ...counts,
            total: counts.pass + counts.fail + counts.error,
          }}
        />
        {prices}
      </div>
    </div>
  </header>
);

const ContinuedReportSections = ({
  access,
  businessId,
  businessName,
  canManageCompetitors,
  checkoutError,
  isOwner,
  onCheckout,
  peerAuditOverride,
  phrases,
  redirecting,
  research,
  researchVisible,
  showFixSteps,
  subjectChecks,
}: {
  access: EntitlementState;
  businessId: string;
  businessName: string;
  canManageCompetitors: boolean;
  checkoutError: string | null;
  isOwner: boolean;
  onCheckout: (plan: CheckoutPlan) => void;
  peerAuditOverride?: PeerAuditJob;
  phrases: Business["searchPhrases"];
  redirecting: CheckoutPlan | null;
  research: ResearchView | null;
  researchVisible: boolean;
  showFixSteps: boolean;
  subjectChecks: {
    id: string;
    label?: string;
    queued?: boolean;
    title: string;
    value: boolean | null;
  }[];
}) => {
  const chrome = reportResearchChrome({
    isOwner,
    researchVisible,
    showFixSteps,
  });
  return (
    <>
      {isOwner && access.kind === "report_once" && access.unlocked ? (
        <section className="listwell-panel" aria-labelledby="continued-reports">
          <div className="listwell-panel__head">
            <h2 className="listwell-panel__title" id="continued-reports">
              Continued reports
            </h2>
          </div>
          <div className="listwell-panel__body">
            <p className="listwell-panel__note">{CONTINUED_REPORT_COPY}</p>
            {checkoutError ? (
              <p className="listwell-panel__error" role="alert">
                {checkoutError}
              </p>
            ) : null}
          </div>
          {!access.sessionRequired &&
          (access.monthlyAvailable || access.yearlyAvailable) ? (
            <div className="listwell-panel__foot">
              <fieldset className="m-0 flex w-full min-w-0 flex-col gap-2 border-0 p-0 sm:flex-row sm:flex-wrap">
                <legend className="vbg-visually-hidden">
                  Continued report prices
                </legend>
                {access.yearlyAvailable ? (
                  <PrimaryButton
                    type="button"
                    className={reportActionClass}
                    disabled={redirecting !== null}
                    onClick={() =>
                      onCheckout(checkoutPlanSchema.parse("yearly"))
                    }
                  >
                    <ReportActionLabel
                      title={
                        redirecting === "yearly" ? "Redirecting…" : "Best value"
                      }
                      caption={
                        redirecting === "yearly"
                          ? undefined
                          : `${REPORT_YEARLY_PRICE}, ${REPORT_YEARLY_VALUE_NOTE}`
                      }
                    />
                  </PrimaryButton>
                ) : null}
                {access.monthlyAvailable ? (
                  <Button
                    type="button"
                    variant={access.yearlyAvailable ? "secondary" : "primary"}
                    className={reportActionClass}
                    disabled={redirecting !== null}
                    onClick={() =>
                      onCheckout(checkoutPlanSchema.parse("monthly"))
                    }
                  >
                    <ReportActionLabel
                      title={
                        redirecting === "monthly"
                          ? "Redirecting…"
                          : "Monthly scans"
                      }
                      caption={
                        redirecting === "monthly"
                          ? undefined
                          : REPORT_MONTHLY_PRICE
                      }
                    />
                  </Button>
                ) : null}
              </fieldset>
            </div>
          ) : null}
        </section>
      ) : null}

      {chrome.phrasesEditor ? (
        <SearchPhrasesSection businessId={businessId} phrases={phrases} />
      ) : null}

      {canManageCompetitors ? (
        <NextFixSection
          businessId={businessId}
          peerAuditOverride={peerAuditOverride}
          subjectChecks={subjectChecks}
        />
      ) : null}

      <PeerComparisonSection
        businessId={businessId}
        businessName={businessName}
        canManageCompetitors={canManageCompetitors}
        peerAuditOverride={peerAuditOverride}
        subjectChecks={subjectChecks}
      />

      {chrome.research ? <ResearchSections view={research} /> : null}
      {chrome.research && research ? (
        <ResearchHistory businessName={businessName} view={research} />
      ) : null}
    </>
  );
};

const ReportClientMain = ({
  access,
  business,
  businessName,
  checkoutError,
  checkoutReturned,
  dispatch,
  filter,
  fixPlan,
  isOwner,
  listingReviewOverride,
  liveChecks,
  onCheckout,
  peerAuditOverride,
  pickedId,
  redirecting,
  research,
  researchVisible,
  scanHistory,
  scanHistoryOverride,
  showFixSteps,
  summary,
}: {
  access: EntitlementState;
  business: Business;
  businessName: string;
  checkoutError: string | null;
  checkoutReturned: boolean;
  dispatch: (action: ReportUiAction) => void;
  filter: ReportUiState["filter"];
  fixPlan: PlannedFixGroup[];
  isOwner: boolean;
  listingReviewOverride?: ListingReviewResult;
  liveChecks: LiveCheck[];
  onCheckout: (plan: CheckoutPlan) => void;
  peerAuditOverride?: PeerAuditJob;
  pickedId: ReportUiState["pickedId"];
  redirecting: CheckoutPlan | null;
  research: ResearchView | null;
  researchVisible: boolean;
  scanHistory: ScanSummary[];
  scanHistoryOverride?: ScanSummary[];
  showFixSteps: boolean;
  summary: AuditSummaryResult;
}) => {
  const subjectChecks = liveChecks.map((item) => ({
    id: item.definition.id,
    label: item.result?.label,
    queued: item.result?.queued,
    title: item.definition.title,
    value: item.result?.value ?? null,
  }));
  const expandedId =
    pickedId === undefined ? recommendedCheckId(summary, liveChecks) : pickedId;
  const citationChecks = liveChecks.map((item) => ({
    id: item.definition.id,
    title: item.definition.title,
  }));
  const visible = liveChecks.filter(
    (item) => filter === "all" || needsWork(item)
  );
  const groupedChecks = groupVisibleByChannel(visible);
  const profiles = businessToProfiles(business);
  const checksCaption =
    filter === "failures"
      ? `Showing checks that still need attention. ${visible.length} of ${liveChecks.length}.`
      : `Showing all checks. ${visible.length} of ${liveChecks.length}.`;

  const toggleCheck = (id: string) => {
    dispatch({ id: expandedId === id ? null : id, type: "set-picked-id" });
  };

  const revealCheck = (id: string) => {
    const target = liveChecks.find((item) => item.definition.id === id);
    if (target && !needsWork(target)) {
      dispatch({ filter: "all", type: "set-filter" });
    }
    dispatch({ id, type: "set-picked-id" });
    window.requestAnimationFrame(() => {
      document
        .querySelector(`#check-${CSS.escape(id)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="listwell-report__main">
      {isOwner ? (
        <ReportAccessSection
          access={access}
          checkoutReturned={checkoutReturned}
          summary={summary}
          fixPlan={fixPlan}
          citationChecks={citationChecks}
          definitions={liveChecks.map((item) => item.definition)}
          onSelectCheck={revealCheck}
          onUnlocked={() => {
            window.location.replace(`/${business.id}`);
          }}
        />
      ) : null}

      <ListingReviewSection
        businessId={business.id}
        businessName={businessName}
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

      <ContinuedReportSections
        access={access}
        businessId={business.id}
        businessName={businessName}
        canManageCompetitors={
          isOwner && access.unlocked && !access.sessionRequired
        }
        checkoutError={checkoutError}
        isOwner={isOwner}
        redirecting={redirecting}
        onCheckout={onCheckout}
        peerAuditOverride={peerAuditOverride}
        phrases={business.searchPhrases}
        research={research}
        researchVisible={researchVisible}
        showFixSteps={showFixSteps}
        subjectChecks={subjectChecks}
      />

      <ChecksLedgerSection
        groupedChecks={groupedChecks}
        checksCaption={checksCaption}
        filter={filter}
        expandedId={expandedId}
        businessCategory={business.category}
        showFixSteps={showFixSteps}
        onFilterChange={(next) =>
          dispatch({ filter: next, type: "set-filter" })
        }
        onToggleCheck={toggleCheck}
      />

      <ListingsSection
        businessId={business.id}
        profiles={profiles}
        showEditLink={isOwner}
      />
      <footer aria-hidden="true" className="listwell-report__print-footer">
        <p className="listwell-panel__fine">
          {showFixSteps ? "Full report" : "Preview"} · Listwell · listwell.dev
        </p>
      </footer>
    </div>
  );
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
  peerAuditOverride,
  scanHistoryOverride,
  research = null,
  researchVisible = false,
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
  /** Dev UI fixture only — skips the nearby comparison fetch when set. */
  peerAuditOverride?: PeerAuditJob;
  /** Dev UI fixture only — skips scan history fetch when set. */
  scanHistoryOverride?: ScanSummary[];
  /** Stored research for a continued report. Null when it could not be loaded. */
  research?: ResearchView | null;
  researchVisible?: boolean;
}) => {
  const business = useMemo(
    () => businessSchema.parse(initialBusiness),
    [initialBusiness]
  );
  const [savedName, setSavedName] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const businessName =
    savedName?.id === business.id ? savedName.name : business.name;
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
  const [ui, dispatch] = useReducer(reportUiReducer, initialReportUiState);
  const {
    checkoutError,
    filter,
    monthlyUpgradeOpen,
    pickedId,
    redirecting,
    shareOpen,
  } = ui;
  const isOwner = variant === "owner";
  const canManageShare = canManageReportShareFromAccess({
    isOwnerView: isOwner,
    sessionRequired: access.sessionRequired,
    unlocked: access.unlocked,
  });
  const counts = visibilityCounts(liveChecks);
  const visibilityScore = scorePercent(counts);
  const showPrices =
    isOwner && !purchasePending && reportShowsPurchasePrices(access);
  const fixPlan = useMemo(
    () =>
      planNextActions({
        actions: summary.nextActions,
        category: business.category,
        definitions: liveChecks.map((item) => item.definition),
      }),
    [business.category, liveChecks, summary.nextActions]
  );
  const monthlyPlan = checkoutPlanSchema.parse("monthly");

  const startCheckout = async (plan: CheckoutPlan) => {
    if (plan === monthlyPlan) {
      dispatch({ type: "clear-error" });
      dispatch({ open: true, type: "set-monthly-upgrade-open" });
      return;
    }
    dispatch({ type: "clear-error" });
    dispatch({ plan, type: "set-redirecting" });
    try {
      const url = await requestCheckoutUrl(business.id, plan);
      window.location.assign(url);
    } catch (error) {
      dispatch({ plan: null, type: "set-redirecting" });
      dispatch({
        error: error instanceof Error ? error.message : "Checkout failed",
        type: "set-error",
      });
    }
  };

  const confirmMonthlyCheckout = async () => {
    dispatch({ type: "clear-error" });
    dispatch({ plan: monthlyPlan, type: "set-redirecting" });
    try {
      const url = await requestCheckoutUrl(business.id, monthlyPlan);
      window.location.assign(url);
    } catch (error) {
      dispatch({ plan: null, type: "set-redirecting" });
      dispatch({
        error: error instanceof Error ? error.message : "Checkout failed",
        type: "set-error",
      });
    }
  };

  return (
    <article className="listwell-page listwell-report">
      {canManageShare ? (
        <ReportShareDialog
          businessId={business.id}
          open={shareOpen}
          onClose={() => dispatch({ open: false, type: "set-share-open" })}
        />
      ) : null}
      {isOwner ? (
        <MonthlyScansUpgradeDialog
          busy={redirecting === monthlyPlan}
          error={monthlyUpgradeOpen ? checkoutError : null}
          open={monthlyUpgradeOpen}
          onConfirm={() => {
            void confirmMonthlyCheckout();
          }}
          onOpenChange={(open) => {
            dispatch({ open, type: "set-monthly-upgrade-open" });
          }}
        />
      ) : null}
      <div className="listwell-report__layout">
        <div className="listwell-report__notices">
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
        </div>

        <ReportOverviewSection
          className="listwell-report__overview"
          summary={summary}
        />

        <aside className="listwell-report__summary">
          <ReportHeader
            access={access}
            businessId={business.id}
            businessName={businessName}
            canManageShare={canManageShare}
            onRename={(name) => {
              setSavedName({ id: business.id, name });
              document.title = `${name} report`;
            }}
            counts={counts}
            fixPlan={fixPlan}
            isOwner={isOwner}
            liveChecks={liveChecks}
            overview={summary.overview}
            prices={
              showPrices ? (
                <ReportPriceActions
                  access={access}
                  checkoutError={checkoutError}
                  redirecting={redirecting}
                  onCheckout={(plan) => {
                    void startCheckout(plan);
                  }}
                />
              ) : null
            }
            showFixSteps={showFixSteps}
            visibilityScore={visibilityScore}
            onShare={() => dispatch({ open: true, type: "set-share-open" })}
          />
        </aside>

        <ReportClientMain
          access={access}
          business={business}
          businessName={businessName}
          checkoutError={checkoutError}
          checkoutReturned={checkoutReturned}
          dispatch={dispatch}
          filter={filter}
          fixPlan={fixPlan}
          isOwner={isOwner}
          listingReviewOverride={listingReviewOverride}
          liveChecks={liveChecks}
          onCheckout={(plan) => {
            void startCheckout(plan);
          }}
          peerAuditOverride={peerAuditOverride}
          pickedId={pickedId}
          redirecting={redirecting}
          research={research}
          researchVisible={researchVisible}
          scanHistory={scanHistory}
          scanHistoryOverride={scanHistoryOverride}
          showFixSteps={showFixSteps}
          summary={summary}
        />
      </div>
    </article>
  );
};
