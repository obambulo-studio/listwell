import type { ReactNode } from "react";
import { z } from "zod";

import { AccountAgentConnect } from "@/components/account-agent-connect";
import {
  AccountOwnedBusinesses,
  AccountPageActions,
  AccountSharedBusinesses,
  BillingNoticeToast,
} from "@/components/account-page-actions";
import { ButtonLink } from "@/components/atoms/button";
import { accountUpgradeCatalogSchema } from "@/lib/account-row-upgrade";
import { configuredAnalyticsBandIds } from "@/lib/analytics-catalog";
import { getSessionUser, listAccountForUser } from "@/lib/auth";
import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { probeConvexBusinesses } from "@/lib/data";
import { getSharedReportViewerAccess } from "@/lib/polar-server";
import { firstSearchParam } from "@/lib/query-params";
import type { AccountReport } from "@/lib/schema";
import { listwellSiteUrl } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your businesses",
};

const AccountCard = ({
  actions,
  children,
  includeHead = true,
  title = "Your businesses",
}: {
  actions?: ReactNode;
  children: ReactNode;
  includeHead?: boolean;
  title?: string;
}) => (
  <section className="listwell-page">
    <div className="listwell-panel">
      {includeHead ? (
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">{title}</h1>
        </div>
      ) : null}
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

const billingNoticeTone = (
  notice: z.infer<typeof billingNoticeSchema>
): "error" | "message" => (notice === "missing" ? "message" : "error");

const AccountPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const checkoutReturned = firstSearchParam(params.checkout_returned) === "1";
  const billingNotice = billingNoticeSchema.safeParse(
    firstSearchParam(params.billing)
  );
  const billingNote = billingNotice.success
    ? {
        message: billingNoticeCopy(billingNotice.data),
        tone: billingNoticeTone(billingNotice.data),
      }
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
  let upgradeCatalog = accountUpgradeCatalogSchema.parse({
    availableAnalyticsBands: [],
    fixStepsWithoutPayment: false,
    monthlyAvailable: false,
    paymentsEnabled: false,
    yearlyAvailable: false,
  });
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
    let availableAnalyticsBands: Awaited<
      ReturnType<typeof configuredAnalyticsBandIds>
    > = [];
    try {
      availableAnalyticsBands = await configuredAnalyticsBandIds();
    } catch {
      availableAnalyticsBands = [];
    }
    upgradeCatalog = accountUpgradeCatalogSchema.parse({
      availableAnalyticsBands,
      fixStepsWithoutPayment: catalog.fixStepsWithoutPayment,
      monthlyAvailable: catalog.monthlyAvailable,
      paymentsEnabled: catalog.paymentsEnabled,
      yearlyAvailable: catalog.yearlyAvailable,
    });
  } catch {
    monthlyScansAvailable = false;
  }

  const hasShared = sharedReports.length > 0;
  const siteOrigin = listwellSiteUrl();
  const { paymentsEnabled } = upgradeCatalog;

  return (
    <>
      <AccountCard actions={accountActions} includeHead={false}>
        <BillingNoticeToast notice={billingNote} />
        <AccountOwnedBusinesses
          catalog={upgradeCatalog}
          checkoutReturned={checkoutReturned}
          monthlyScansAvailable={monthlyScansAvailable}
          paymentsEnabled={paymentsEnabled}
          reports={reports}
          siteOrigin={siteOrigin}
        />
      </AccountCard>
      <AccountAgentConnect mcpUrl={`${siteOrigin}/mcp`} />
      {hasShared ? (
        <AccountCard title="Shared with you">
          <p className="listwell-panel__body listwell-panel__note">
            Reports other people invited you to view. Billing and settings stay
            on their account.
          </p>
          <AccountSharedBusinesses
            catalog={upgradeCatalog}
            paymentsEnabled={paymentsEnabled}
            reports={sharedReports}
            siteOrigin={siteOrigin}
          />
        </AccountCard>
      ) : null}
    </>
  );
};

export default AccountPage;
