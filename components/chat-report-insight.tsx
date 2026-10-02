"use client";

import { MultiplicationSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useId, useReducer, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/atoms/button";
import { reportAllocationSegments } from "@/components/chat-report-allocation";
import { Icon } from "@/components/icon";
import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Button as UiButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { scorePercent } from "@/lib/chat-onboarding";
import type { BasicReportStats, ReportIssue } from "@/lib/chat-onboarding";
import {
  fetchEntitlement,
  MONTHLY_SCANS_UPGRADE_COPY,
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
  requestCheckoutUrl,
} from "@/lib/polar";
import {
  businessSchema,
  checkoutPlanSchema,
  entitlementStateSchema,
} from "@/lib/schema";
import type { CheckoutPlan, EntitlementState } from "@/lib/schema";
import {
  isSameBusinessName,
  normalizeBusinessName,
} from "@/lib/text-normalize";

const IssueStatusMark = ({ status }: { status: ReportIssue["status"] }) => (
  <span
    className={`listwell-chat__report-issue-mark ${status === "pass" ? "listwell-chat__report-issue-mark--pass" : "listwell-chat__report-issue-mark--fail"}`}
    aria-label={status === "pass" ? "Pass" : "Needs work"}
  >
    <Icon
      absoluteStrokeWidth
      icon={status === "pass" ? Tick02Icon : MultiplicationSignIcon}
      size={9}
      strokeWidth={1.5}
    />
  </span>
);

export const ReportAllocation = ({
  stats,
}: {
  stats: Pick<BasicReportStats, "pass" | "fail" | "error" | "total">;
}) => {
  const segments = reportAllocationSegments(stats);
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
    </>
  );
};

const BUSINESS_NAME_MAX = 200;

const saveBusinessName = async (
  businessId: string,
  name: string
): Promise<string> => {
  const next = normalizeBusinessName(name);
  if (next.length === 0 || next.length > BUSINESS_NAME_MAX) {
    throw new Error("Enter a business name");
  }
  const response = await fetch(`/api/businesses/${businessId}`, {
    body: JSON.stringify({ name: next }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error("Could not save this name");
  }
  const parsed = businessSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Could not save this name");
  }
  return parsed.data.name;
};

interface NameEditState {
  draft: string;
  editing: boolean;
  error: string | null;
  pending: boolean;
}

type NameEditAction =
  | { name: string; type: "cancel" }
  | { type: "draft"; value: string }
  | { name: string; type: "edit" }
  | { message: string; type: "failed" }
  | { type: "saved" }
  | { type: "start" };

const nameEditReducer = (
  state: NameEditState,
  action: NameEditAction
): NameEditState => {
  switch (action.type) {
    case "cancel": {
      return {
        draft: action.name,
        editing: false,
        error: null,
        pending: false,
      };
    }
    case "draft": {
      return { ...state, draft: action.value };
    }
    case "edit": {
      return {
        draft: action.name,
        editing: true,
        error: null,
        pending: false,
      };
    }
    case "failed": {
      return { ...state, error: action.message, pending: false };
    }
    case "saved": {
      return { ...state, editing: false, error: null, pending: false };
    }
    case "start": {
      return { ...state, error: null, pending: true };
    }
    default: {
      return state;
    }
  }
};

/** Owner control for the name shown on a report. Does not re-run the scan. */
export const BusinessNameHeading = ({
  businessId,
  canRename,
  heading = "h1",
  name,
  onRenamed,
  showRenameButton = true,
  titleClassName = "listwell-panel__question",
  titleId = "report-title",
}: {
  businessId: string;
  canRename: boolean;
  heading?: "h1" | "p";
  name: string;
  onRenamed: (name: string) => void;
  /** Chat keeps the button beside the name. The report header uses a dialog. */
  showRenameButton?: boolean;
  titleClassName?: string;
  titleId?: string;
}) => {
  const [state, dispatch] = useReducer(nameEditReducer, {
    draft: name,
    editing: false,
    error: null,
    pending: false,
  });
  const { draft, editing, error, pending } = state;
  const TitleTag = heading;

  const save = async () => {
    const next = normalizeBusinessName(draft);
    if (next.length === 0 || next.length > BUSINESS_NAME_MAX) {
      dispatch({ message: "Enter a business name", type: "failed" });
      return;
    }
    if (isSameBusinessName(next, name)) {
      dispatch({ name, type: "cancel" });
      return;
    }
    dispatch({ type: "start" });
    try {
      const saved = await saveBusinessName(businessId, next);
      dispatch({ type: "saved" });
      onRenamed(saved);
    } catch (saveError) {
      dispatch({
        message:
          saveError instanceof Error
            ? saveError.message
            : "Could not save this name",
        type: "failed",
      });
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <TitleTag
          id={titleId}
          className={
            editing
              ? `${titleClassName} listwell-name-title--editing`
              : titleClassName
          }
        >
          {name}
        </TitleTag>
        {canRename && showRenameButton && !editing ? (
          <button
            type="button"
            className="listwell-panel__action listwell-name-rename"
            onClick={() => {
              dispatch({ name, type: "edit" });
            }}
          >
            Rename
          </button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="listwell-name-form flex min-w-0 flex-col gap-2"
          action={save}
        >
          <label
            className="text-ink-2 m-0 text-sm"
            htmlFor={`${titleId}-input`}
          >
            Business name
          </label>
          <Input
            id={`${titleId}-input`}
            value={draft}
            autoCapitalize="none"
            autoComplete="organization"
            spellCheck={false}
            maxLength={BUSINESS_NAME_MAX}
            onChange={(event) => {
              dispatch({ type: "draft", value: event.target.value });
            }}
          />
          <p className="text-ink-2 m-0 text-sm">
            Shown on this report. The scan stays as it is.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="listwell-panel__action"
              disabled={
                pending ||
                normalizeBusinessName(draft).length === 0 ||
                isSameBusinessName(draft, name)
              }
            >
              {pending ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              className="listwell-panel__action"
              disabled={pending}
              onClick={() => {
                dispatch({ name, type: "cancel" });
              }}
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p className="text-ink m-0 text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
};

interface ReportSummaryProps {
  businessName: string;
  stats: BasicReportStats;
  businessId: string | null;
  onPreview: () => void;
  onBusinessNameChange: (name: string) => void;
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

const lockedAccessNote = (access: EntitlementState): string | null => {
  if (!access.backendAvailable) {
    return "Account services are temporarily unavailable.";
  }
  if (!access.paymentsEnabled) {
    return access.fixStepsWithoutPayment
      ? "Fix steps are included in this environment."
      : "Payments are not configured yet.";
  }
  return null;
};

const buildAccessNote = (
  access: EntitlementState,
  businessId: string | null
): string | null => {
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

const offerRowClass =
  "h-auto min-h-11 w-full min-w-0 shrink-0 justify-between gap-3 whitespace-normal px-3 py-2 text-left text-sm leading-snug transition-[transform,background-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

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

const OfferChoice = ({
  detail,
  price,
  title,
}: {
  detail?: string;
  price?: string;
  title: string;
}) => (
  <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
    <span className="col-start-1 row-start-1">{title}</span>
    {price ? (
      <span className="col-start-2 row-start-1 text-right tabular-nums">
        {price}
      </span>
    ) : null}
    {detail ? (
      <span className="col-start-2 row-start-2 text-right font-normal">
        {detail}
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
  <fieldset className="m-0 flex w-full min-w-0 flex-col gap-2 border-0 p-0">
    <legend className="vbg-visually-hidden">Report prices</legend>
    {businessId && !access.unlocked ? (
      <Button
        type="button"
        variant="secondary"
        className={offerRowClass}
        onClick={onPreview}
      >
        <OfferChoice price="Free" title="Preview report" />
      </Button>
    ) : null}
    <PrimaryButton
      type="button"
      disabled={ctaDisabled}
      className={offerRowClass}
      onClick={() => {
        onUnlock(checkoutPlanSchema.parse("once"));
      }}
    >
      <OfferChoice
        price={
          redirecting === "once" || sessionRequired || access.unlocked
            ? undefined
            : `${REPORT_ONCE_PRICE} once`
        }
        title={ctaLabel}
      />
    </PrimaryButton>
    {businessId && !access.unlocked && access.yearlyAvailable ? (
      <Button
        type="button"
        variant="secondary"
        disabled={ctaDisabled}
        className={offerRowClass}
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("yearly"));
        }}
      >
        <OfferChoice
          detail={
            redirecting === "yearly" ? undefined : REPORT_YEARLY_VALUE_NOTE
          }
          price={redirecting === "yearly" ? undefined : REPORT_YEARLY_PRICE}
          title={redirecting === "yearly" ? "Redirecting…" : "Best value"}
        />
      </Button>
    ) : null}
    {businessId && !access.unlocked && access.monthlyAvailable ? (
      <Button
        type="button"
        variant="secondary"
        disabled={ctaDisabled}
        className={offerRowClass}
        onClick={() => {
          onUnlock(checkoutPlanSchema.parse("monthly"));
        }}
      >
        <OfferChoice
          price={redirecting === "monthly" ? undefined : REPORT_MONTHLY_PRICE}
          title={redirecting === "monthly" ? "Redirecting…" : "Monthly scans"}
        />
      </Button>
    ) : null}
  </fieldset>
);

/** Rename dialog for the report Edit menu and the account row menu. */
export const BusinessNameRenameDialog = ({
  businessId,
  name,
  open,
  onOpenChange,
  onRenamed,
}: {
  businessId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (name: string) => void;
}) => {
  const inputId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // react-doctor-disable-next-line react-doctor/no-derived-useState
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    const next = normalizeBusinessName(draft);
    if (next.length === 0 || next.length > BUSINESS_NAME_MAX) {
      setError("Enter a business name");
      return;
    }
    if (isSameBusinessName(next, name)) {
      onOpenChange(false);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const saved = await saveBusinessName(businessId, next);
      setPending(false);
      onRenamed(saved);
      onOpenChange(false);
    } catch (saveError) {
      setPending(false);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this name"
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        initialFocus={() => nameInputRef.current}
      >
        <DialogHeader>
          <DialogTitle>Rename business</DialogTitle>
          <DialogDescription>
            Shown on this report. The scan stays as it is.
          </DialogDescription>
        </DialogHeader>
        <form className="listwell-name-form flex flex-col gap-2" action={save}>
          <label className="text-ink-2 m-0 text-sm" htmlFor={inputId}>
            Business name
          </label>
          <Input
            ref={nameInputRef}
            id={inputId}
            value={draft}
            autoCapitalize="none"
            autoComplete="organization"
            spellCheck={false}
            maxLength={BUSINESS_NAME_MAX}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          {error ? (
            <p className="text-ink m-0 text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <FormActions className="justify-end pt-0">
            <QuietButton
              disabled={pending}
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </QuietButton>
            <PrimaryButton
              disabled={
                pending ||
                normalizeBusinessName(draft).length === 0 ||
                isSameBusinessName(draft, name)
              }
              type="submit"
            >
              {pending ? "Saving" : "Save"}
            </PrimaryButton>
          </FormActions>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const BusinessRemoveDialog = ({
  businessName,
  open,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: {
  businessName: string;
  open: boolean;
  busy: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!busy) {
        onOpenChange(nextOpen);
      }
    }}
  >
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Remove business</DialogTitle>
        <DialogDescription className="text-foreground leading-relaxed">
          {businessName} will leave your account. Past scans, scores, and share
          links for this business are deleted and cannot be restored. Active
          billing for this business stops when it is removed.
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="listwell-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions className="justify-end pt-0">
        <QuietButton
          disabled={busy}
          type="button"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </QuietButton>
        <UiButton
          disabled={busy}
          type="button"
          variant="destructive"
          onClick={onConfirm}
        >
          {busy ? "Removing…" : "Remove business"}
        </UiButton>
      </FormActions>
    </DialogContent>
  </Dialog>
);

export const MonthlyScansUpgradeDialog = ({
  open,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) => (
  <Dialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!busy) {
        onOpenChange(nextOpen);
      }
    }}
  >
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Monthly scans</DialogTitle>
        <DialogDescription className="text-foreground leading-relaxed">
          {MONTHLY_SCANS_UPGRADE_COPY}
        </DialogDescription>
      </DialogHeader>
      <p className="text-muted-foreground text-sm">{REPORT_MONTHLY_PRICE}</p>
      {error ? (
        <p className="listwell-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions className="justify-end pt-0">
        <QuietButton
          disabled={busy}
          type="button"
          onClick={() => onOpenChange(false)}
        >
          Not now
        </QuietButton>
        <PrimaryButton disabled={busy} type="button" onClick={onConfirm}>
          {busy ? "Redirecting…" : "Continue to checkout"}
        </PrimaryButton>
      </FormActions>
    </DialogContent>
  </Dialog>
);

export const ReportSummary = ({
  businessName,
  stats,
  businessId,
  onPreview,
  onBusinessNameChange,
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
  const [monthlyDialogOpen, setMonthlyDialogOpen] = useState(false);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);

  const sessionRequired = Boolean(access.unlocked && access.sessionRequired);
  const ctaDisabled = isCtaDisabled(businessId, access, redirecting);
  const ctaLabel = buildCtaLabel(access, redirecting, sessionRequired);
  const note = buildAccessNote(access, businessId);

  const startCheckout = async (plan: CheckoutPlan) => {
    if (!businessId) {
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

  const handleUnlock = (
    plan: CheckoutPlan = checkoutPlanSchema.parse("once")
  ) => {
    if (!businessId) {
      return;
    }
    if (access.unlocked) {
      onPreview();
      return;
    }
    if (plan === checkoutPlanSchema.parse("monthly")) {
      setCheckoutError(null);
      setMonthlyDialogOpen(true);
      return;
    }
    void startCheckout(plan);
  };

  return (
    <Card
      className="listwell-chat__report max-w-full ring-0"
      aria-label={`Visibility report for ${businessName}`}
    >
      <CardHeader className="gap-1">
        {businessId ? (
          <BusinessNameHeading
            businessId={businessId}
            canRename
            heading="p"
            name={businessName}
            titleClassName="text-foreground m-0 text-base"
            titleId="chat-report-title"
            onRenamed={onBusinessNameChange}
          />
        ) : (
          <CardDescription className="text-foreground text-base">
            {businessName}
          </CardDescription>
        )}
        <CardTitle className="text-3xl font-semibold tracking-tight">
          {score}%
          <span className="text-muted-foreground text-lg font-normal">
            {" "}
            visibility
          </span>
        </CardTitle>
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
        {checkoutError && !monthlyDialogOpen ? (
          <Alert variant="destructive">
            <AlertDescription>{checkoutError}</AlertDescription>
          </Alert>
        ) : null}
        {note && !(checkoutError && !monthlyDialogOpen) ? (
          <p className="text-muted-foreground text-sm">{note}</p>
        ) : null}
      </CardFooter>
      {businessId ? (
        <MonthlyScansUpgradeDialog
          busy={redirecting === checkoutPlanSchema.parse("monthly")}
          error={checkoutError}
          open={monthlyDialogOpen}
          onConfirm={() => {
            void startCheckout(checkoutPlanSchema.parse("monthly"));
          }}
          onOpenChange={setMonthlyDialogOpen}
        />
      ) : null}
    </Card>
  );
};
