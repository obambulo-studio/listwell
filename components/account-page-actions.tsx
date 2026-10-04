"use client";

import {
  Add01Icon,
  ChevronRightIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { useQuery } from "convex/react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AccountBusinessRowMenu } from "@/components/account-business-row-menu";
import { AccountBusinessUpgradeButton } from "@/components/account-business-upgrade";
import { AccountCheckoutFollowUp } from "@/components/account-checkout-follow-up";
import { Icon } from "@/components/icon";
import { openProfileSettings } from "@/components/profile-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  accountReportMeta,
  accountScoreDelta,
  accountScoreDeltaAriaLabel,
  formatAccountScoreDelta,
} from "@/lib/account-report";
import { accountRowShowsUpgrade } from "@/lib/account-row-upgrade";
import type { AccountUpgradeCatalog } from "@/lib/account-row-upgrade";
import { api } from "@/lib/convex/server";
import { accountReportSchema } from "@/lib/schema";
import type { AccountReport } from "@/lib/schema";
import {
  LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
  LISTWELL_ACCOUNT_SCAN_COMPLETE_EVENT,
  parseAccountScanCompleteDetail,
  readAccountBackgroundScan,
  startAccountBackgroundScan,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

const accountButtonClass = "h-11 px-4";

export const BillingNoticeToast = ({
  notice,
}: {
  notice: { message: string; tone: "error" | "message" } | null;
}) => {
  const message = notice?.message ?? null;
  const tone = notice?.tone ?? null;

  useEffect(() => {
    if (!(message && tone)) {
      return;
    }
    const options = { id: `billing:${message}` };
    if (tone === "error") {
      toast.error(message, options);
      return;
    }
    toast.message(message, options);
  }, [message, tone]);

  return null;
};

const subscribeAccountScan = (onStoreChange: () => void): (() => void) => {
  window.addEventListener(
    LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
    onStoreChange
  );
  return () => {
    window.removeEventListener(
      LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
      onStoreChange
    );
  };
};

const pendingBusinessName = (): string | null =>
  readAccountBackgroundScan()?.businessName ?? null;

const accountReportsSchema = z.array(accountReportSchema);

const pinReportToFront = (
  items: AccountReport[],
  pinId: string | null
): AccountReport[] => {
  if (!pinId) {
    return items;
  }
  const pinned = items.find((report) => report.id === pinId);
  if (!pinned) {
    return items;
  }
  return [pinned, ...items.filter((report) => report.id !== pinId)];
};

const Chevron = () => (
  <Icon className="listwell-panel__chevron" icon={ChevronRightIcon} size={15} />
);

const AccountReportRow = ({
  catalog,
  enter = false,
  monthlyScansAvailable,
  paymentsEnabled,
  report,
  showOwnerMenu,
  siteOrigin,
}: {
  catalog: AccountUpgradeCatalog;
  enter?: boolean;
  monthlyScansAvailable: boolean;
  paymentsEnabled: boolean;
  report: AccountReport;
  showOwnerMenu: boolean;
  siteOrigin: string;
}) => {
  const score = report.lastScan?.score;
  const meta = accountReportMeta(report);
  const scoreDelta = accountScoreDelta(
    score ?? null,
    report.lastScan?.previousScore ?? null
  );
  const showUpgrade = accountRowShowsUpgrade({
    catalog,
    owned: report.owned,
    plan: report.plan,
  });
  return (
    <li
      className={cn(
        "listwell-account-row",
        enter && "listwell-account-row--enter"
      )}
    >
      <div className="listwell-panel__row">
        <Link className="listwell-panel__row-link" href={`/${report.id}`}>
          <span className="listwell-panel__row-main">
            <span className="listwell-panel__row-title">{report.name}</span>
            {meta ? (
              <span className="listwell-panel__row-meta">{meta}</span>
            ) : null}
          </span>
          {score === null || score === undefined ? null : (
            <span className="listwell-account-row__score">
              <span className="listwell-panel__mono">{score}%</span>
              {scoreDelta ? (
                <span
                  className={cn(
                    "listwell-account-row__score-delta",
                    `listwell-account-row__score-delta--${scoreDelta.direction}`
                  )}
                  aria-label={accountScoreDeltaAriaLabel(scoreDelta)}
                >
                  {formatAccountScoreDelta(scoreDelta)}
                </span>
              ) : null}
            </span>
          )}
        </Link>
        <div className="listwell-account-row__trail">
          {showUpgrade ? (
            <AccountBusinessUpgradeButton
              businessId={report.id}
              businessName={report.name}
              catalog={catalog}
            />
          ) : null}
          {showOwnerMenu ? (
            <AccountBusinessRowMenu
              businessId={report.id}
              businessName={report.name}
              canRemove={report.owned}
              catalog={catalog}
              monthlyScansAvailable={monthlyScansAvailable}
              paymentsEnabled={paymentsEnabled}
              plan={report.plan}
              siteOrigin={siteOrigin}
            />
          ) : null}
          <Link
            className="listwell-account-row__chevron"
            href={`/${report.id}`}
            aria-label={`View ${report.name}`}
          >
            <Chevron />
          </Link>
        </div>
      </div>
    </li>
  );
};

const AccountPendingBusinessRow = ({
  enter = true,
  name,
}: {
  enter?: boolean;
  name: string;
}) => (
  <li
    className={cn(
      "listwell-account-row listwell-account-row--pending",
      enter && "listwell-account-row--enter"
    )}
  >
    <div
      className="listwell-panel__row"
      aria-busy="true"
      aria-label={`${name}. Check in progress.`}
    >
      <span className="listwell-panel__row-main">
        <span className="listwell-panel__row-title">{name}</span>
      </span>
      <span className="listwell-account-row__trail">
        <span className="listwell-account-row__spinner" aria-hidden="true" />
      </span>
    </div>
  </li>
);

export const AccountOwnedBusinesses = ({
  catalog,
  checkoutReturned,
  monthlyScansAvailable,
  paymentsEnabled,
  reports: initialReports,
  siteOrigin,
}: {
  catalog: AccountUpgradeCatalog;
  checkoutReturned: boolean;
  monthlyScansAvailable: boolean;
  paymentsEnabled: boolean;
  reports: AccountReport[];
  siteOrigin: string;
}) => {
  const [frontBusinessId, setFrontBusinessId] = useState<string | null>(null);
  const queriedReports = useQuery(api.account.listReports);
  const reports = useMemo(() => {
    if (queriedReports === undefined) {
      return initialReports;
    }
    return accountReportsSchema.parse(queriedReports);
  }, [initialReports, queriedReports]);

  const pendingName = useSyncExternalStore(
    subscribeAccountScan,
    pendingBusinessName,
    () => null
  );
  const pendingId = pendingName
    ? (readAccountBackgroundScan()?.businessId ?? null)
    : null;

  useEffect(() => {
    const onComplete = (event: Event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const detail = parseAccountScanCompleteDetail(event.detail);
      if (detail) {
        setFrontBusinessId(detail.businessId);
      }
    };
    window.addEventListener(LISTWELL_ACCOUNT_SCAN_COMPLETE_EVENT, onComplete);
    return () => {
      window.removeEventListener(
        LISTWELL_ACCOUNT_SCAN_COMPLETE_EVENT,
        onComplete
      );
    };
  }, []);

  const pinId = pendingName ? pendingId : frontBusinessId;
  const orderedReports = pinReportToFront(reports, pinId);
  const orphanPending =
    pendingName !== null &&
    (pendingId === null || !reports.some((report) => report.id === pendingId));
  const showEmpty = reports.length === 0 && !pendingName;
  const body: ReactNode = showEmpty ? (
    <output className="listwell-panel__empty">
      <span className="listwell-panel__empty-text">
        No businesses added yet.
      </span>
    </output>
  ) : (
    <ul
      className="listwell-panel__rows"
      aria-label="Businesses on your account"
    >
      {orphanPending ? (
        <AccountPendingBusinessRow
          key="account-scan-pending"
          name={pendingName}
        />
      ) : null}
      {orderedReports.map((report) =>
        pendingName && report.id === pendingId ? (
          <AccountPendingBusinessRow key={report.id} name={report.name} />
        ) : (
          <AccountReportRow
            key={report.id}
            catalog={catalog}
            enter={report.id === frontBusinessId}
            monthlyScansAvailable={monthlyScansAvailable}
            paymentsEnabled={paymentsEnabled}
            report={report}
            showOwnerMenu
            siteOrigin={siteOrigin}
          />
        )
      )}
    </ul>
  );

  return (
    <>
      <AccountCheckoutFollowUp checkoutReturned={checkoutReturned} />
      <span className="vbg-visually-hidden" aria-live="polite">
        {pendingName ? `${pendingName}. Check in progress.` : ""}
      </span>
      {body}
    </>
  );
};

export const AccountSharedBusinesses = ({
  catalog,
  paymentsEnabled,
  reports,
  siteOrigin,
}: {
  catalog: AccountUpgradeCatalog;
  paymentsEnabled: boolean;
  reports: AccountReport[];
  siteOrigin: string;
}) => (
  <ul className="listwell-panel__rows" aria-label="Businesses shared with you">
    {reports.map((report) => (
      <AccountReportRow
        key={report.id}
        catalog={catalog}
        monthlyScansAvailable={false}
        paymentsEnabled={paymentsEnabled}
        report={report}
        showOwnerMenu={false}
        siteOrigin={siteOrigin}
      />
    ))}
  </ul>
);

export const AccountPageActions = () => {
  const formId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitBusiness = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = businessName.trim();
    if (!trimmed) {
      setSubmitError("Enter a business name.");
      return;
    }
    setSubmitError(null);
    startAccountBackgroundScan(trimmed);
    setDialogOpen(false);
    setBusinessName("");
  };

  return (
    <>
      <div className="listwell-page__actions">
        <button
          type="button"
          className={cn(
            buttonVariants({ size: "lg", variant: "default" }),
            accountButtonClass
          )}
          onClick={() => {
            setSubmitError(null);
            setDialogOpen(true);
          }}
        >
          <Icon icon={Add01Icon} size={16} />
          Add business
        </button>
        <button
          type="button"
          className={cn(
            buttonVariants({ size: "lg", variant: "secondary" }),
            accountButtonClass
          )}
          onClick={() => {
            openProfileSettings();
          }}
        >
          <Icon icon={UserIcon} size={16} />
          Profile
        </button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSubmitError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add business</DialogTitle>
            <DialogDescription>
              We will match listings and run the same free basic check as chat.
              You can stay on this page while it runs.
            </DialogDescription>
          </DialogHeader>
          <form id={formId} onSubmit={submitBusiness}>
            <Input
              autoComplete="organization"
              name="businessName"
              placeholder="e.g. Willow Whip Gelato"
              value={businessName}
              onChange={(event) => {
                setBusinessName(event.target.value);
                setSubmitError(null);
              }}
            />
            {submitError ? (
              <p className="listwell-panel__error mt-3">{submitError}</p>
            ) : null}
          </form>
          <DialogFooter>
            <button
              type="button"
              className={buttonVariants({ variant: "secondary" })}
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              className={buttonVariants({ variant: "default" })}
            >
              Start check
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
