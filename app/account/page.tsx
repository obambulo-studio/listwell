import Link from "next/link";
import type { ReactNode } from "react";

import { ButtonLink } from "@/components/atoms/button";
import { getSessionUser, listReportsForUser } from "@/lib/auth";
import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { probeConvexBusinesses } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your businesses",
};

const ACCOUNT_DATE_FORMAT = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
});

const formatPlan = (plan: "preview" | "once" | "monthly"): string => {
  if (plan === "monthly") {
    return "Monthly scans";
  }
  if (plan === "once") {
    return "Full report";
  }
  return "Preview";
};

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return ACCOUNT_DATE_FORMAT.format(parsed);
};

type AccountReport = Awaited<ReturnType<typeof listReportsForUser>>[number];

const reportMeta = (report: AccountReport): string => {
  const parts = [formatPlan(report.plan)];
  const lastScan = formatDate(report.lastScan?.finishedAt);
  if (lastScan) {
    parts.push(`Scanned ${lastScan}`);
  }
  const nextScan =
    report.plan === "monthly" ? formatDate(report.nextScanAt) : null;
  if (nextScan) {
    parts.push(`Next scan ${nextScan}`);
  }
  return parts.join(" · ");
};

const Chevron = () => (
  <svg
    className="listwell-panel__chevron -rotate-90"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const AccountCard = ({
  action,
  children,
}: {
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="listwell-page">
    <div className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">Your businesses</h1>
        {action}
      </div>
      {children}
    </div>
  </section>
);

const AccountMessage = ({ children }: { children: ReactNode }) => (
  <AccountCard>
    <div className="listwell-panel__body">
      <output className="listwell-panel__note">{children}</output>
    </div>
  </AccountCard>
);

const addBusiness = (
  <Link className="listwell-panel__action" href="/">
    Add business
  </Link>
);

const AccountPage = async () => {
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
  try {
    await fetchAuthMutation(api.entitlements.attachPurchasesForCurrentUser, {});
  } catch {
    // Linking is best-effort. The account list still loads.
  }
  try {
    reports = await listReportsForUser(user.id);
  } catch {
    return (
      <AccountMessage>
        We could not load your account data. Try again in a few minutes.
      </AccountMessage>
    );
  }

  if (reports.length === 0) {
    return (
      <AccountCard action={addBusiness}>
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
    <AccountCard action={addBusiness}>
      <ul
        className="listwell-panel__rows"
        aria-label="Businesses on your account"
      >
        {reports.map((report) => {
          const score = report.lastScan?.score;
          return (
            <li key={report.id}>
              <Link className="listwell-panel__row" href={`/${report.id}`}>
                <span className="listwell-panel__row-main">
                  <span className="listwell-panel__row-title">
                    {report.name}
                  </span>
                  <span className="listwell-panel__row-meta">
                    {reportMeta(report)}
                  </span>
                </span>
                {score === null || score === undefined ? null : (
                  <span className="listwell-panel__mono">{score}%</span>
                )}
                <Chevron />
              </Link>
            </li>
          );
        })}
      </ul>
    </AccountCard>
  );
};

export default AccountPage;
