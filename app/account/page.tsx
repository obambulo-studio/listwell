import { ChevronRightIcon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

import { AccountBusinessRowMenu } from "@/components/account-business-row-menu";
import { AccountPageActions } from "@/components/account-page-actions";
import { ButtonLink } from "@/components/atoms/button";
import { Icon } from "@/components/icon";
import {
  accountReportMeta,
  accountScoreDelta,
  accountScoreDeltaAriaLabel,
  formatAccountScoreDelta,
} from "@/lib/account-report";
import { getSessionUser, listAccountForUser } from "@/lib/auth";
import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { probeConvexBusinesses } from "@/lib/data";
import { getSharedReportViewerAccess } from "@/lib/polar-server";
import { firstSearchParam } from "@/lib/query-params";
import type { AccountReport } from "@/lib/schema";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your businesses",
};

const Chevron = () => (
  <Icon className="listwell-panel__chevron" icon={ChevronRightIcon} size={15} />
);

const AccountCard = ({
  actions,
  children,
  title = "Your businesses",
}: {
  actions?: ReactNode;
  children: ReactNode;
  title?: string;
}) => (
  <section className="listwell-page">
    <div className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">{title}</h1>
      </div>
      {children}
    </div>
    {actions}
  </section>
);

const AccountMessage = ({ children }: { children: ReactNode }) => (
  <AccountCard>
    <div className="listwell-panel__body">
      <output className="listwell-panel__note">{children}</output>
    </div>
  </AccountCard>
);

const accountActions = <AccountPageActions />;

const billingNoticeSchema = z.enum(["unconfigured", "missing", "error"]);

const billingNoticeCopy = (
  notice: z.infer<typeof billingNoticeSchema>
): string => {
  if (notice === "unconfigured") {
    return "Billing is not available right now.";
  }
  if (notice === "missing") {
    return "No billing account yet. Invoices appear after you buy a report.";
  }
  return "We could not open billing. Try again in a few minutes.";
};

const BillingNotice = ({ notice }: { notice: string | null }) => {
  if (!notice) {
    return null;
  }
  return (
    <div className="listwell-panel__body">
      <p className="listwell-panel__text">{notice}</p>
    </div>
  );
};

const AccountReportRow = ({
  monthlyScansAvailable,
  report,
  showOwnerMenu,
}: {
  monthlyScansAvailable: boolean;
  report: AccountReport;
  showOwnerMenu: boolean;
}) => {
  const score = report.lastScan?.score;
  const meta = accountReportMeta(report);
  const scoreDelta = accountScoreDelta(
    score ?? null,
    report.lastScan?.previousScore ?? null
  );
  return (
    <li className="listwell-account-row">
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
          {showOwnerMenu ? (
            <AccountBusinessRowMenu
              businessId={report.id}
              businessName={report.name}
              canRemove={report.owned}
              monthlyScansAvailable={monthlyScansAvailable}
              plan={report.plan}
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

const AccountPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const billingNotice = billingNoticeSchema.safeParse(
    firstSearchParam(params.billing)
  );
  const billingNote = billingNotice.success
    ? billingNoticeCopy(billingNotice.data)
    : null;
  const user = await getSessionUser();
  if (!user) {
    return (
      <AccountCard>
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">
            Sign in to see businesses linked to your account.
          </p>
        </div>
        <div className="listwell-panel__foot">
          <ButtonLink variant="primary" href="/sign-in?return=%2Faccount">
            Sign in
          </ButtonLink>
        </div>
      </AccountCard>
    );
  }

  const convexHealth = await probeConvexBusinesses();
  if (convexHealth === "error") {
    return (
      <AccountMessage>
        Account services are temporarily unavailable. Your sign-in is fine, but
        we cannot load your saved businesses right now. Try again shortly.
      </AccountMessage>
    );
  }

  let reports: AccountReport[] = [];
  let sharedReports: AccountReport[] = [];
  let monthlyScansAvailable = false;
  try {
    await fetchAuthMutation(api.entitlements.attachPurchasesForCurrentUser, {});
  } catch {
    // Linking is best-effort. The account list still loads.
  }
  try {
    const { reports: ownedReports, sharedReports: guestReports } =
      await listAccountForUser(user.id);
    reports = ownedReports;
    sharedReports = guestReports;
  } catch {
    return (
      <AccountMessage>
        We could not load your account data. Try again in a few minutes.
      </AccountMessage>
    );
  }

  try {
    const catalog = await getSharedReportViewerAccess();
    monthlyScansAvailable = catalog.paymentsEnabled && catalog.monthlyAvailable;
  } catch {
    monthlyScansAvailable = false;
  }

  const hasPrimary = reports.length > 0;
  const hasShared = sharedReports.length > 0;

  if (!hasPrimary && !hasShared) {
    return (
      <AccountCard actions={accountActions}>
        <BillingNotice notice={billingNote} />
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">No businesses yet.</p>
          <p className="listwell-panel__note">
            Check a business from the chat to start a report.
          </p>
        </div>
      </AccountCard>
    );
  }

  return (
    <>
      <AccountCard actions={accountActions}>
        <BillingNotice notice={billingNote} />
        {hasPrimary ? (
          <ul
            className="listwell-panel__rows"
            aria-label="Businesses on your account"
          >
            {reports.map((report) => (
              <AccountReportRow
                key={report.id}
                monthlyScansAvailable={monthlyScansAvailable}
                report={report}
                showOwnerMenu
              />
            ))}
          </ul>
        ) : (
          <div className="listwell-panel__body">
            <p className="listwell-panel__text">
              No businesses on your account yet.
            </p>
            <p className="listwell-panel__note">
              Check a business from the chat to start a report, or open a shared
              report below.
            </p>
          </div>
        )}
      </AccountCard>
      {hasShared ? (
        <AccountCard title="Shared with you">
          <p className="listwell-panel__body listwell-panel__note">
            Reports other people invited you to view. Billing and settings stay
            on their account.
          </p>
          <ul
            className="listwell-panel__rows"
            aria-label="Businesses shared with you"
          >
            {sharedReports.map((report) => (
              <AccountReportRow
                key={report.id}
                monthlyScansAvailable={false}
                report={report}
                showOwnerMenu={false}
              />
            ))}
          </ul>
        </AccountCard>
      ) : null}
    </>
  );
};

export default AccountPage;
