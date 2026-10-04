import { notFound, redirect } from "next/navigation";

import { AccountWebAnalytics } from "@/components/account-web-analytics";
import { getSessionUser } from "@/lib/auth";
import { fetchAuthQuery } from "@/lib/auth-server";
import { configuredAnalyticsBandIds } from "@/lib/analytics-catalog";
import { api } from "@/lib/convex/server";
import { getPolarConfig } from "@/lib/polar-server";
import { listwellSiteUrl } from "@/lib/site-metadata";
import { firstSearchParam } from "@/lib/query-params";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Web analytics",
};

const AccountAnalyticsPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const { id: businessId } = await params;
  const query = await searchParams;
  const checkoutReturned =
    firstSearchParam(query.checkout_returned) === "1";

  const user = await getSessionUser();
  if (!user) {
    redirect(
      `/sign-in?return=${encodeURIComponent(`/account/analytics/${businessId}`)}`
    );
  }

  const state = await fetchAuthQuery(api.webAnalytics.getAccountState, {
    businessExternalId: businessId,
  });
  if (!state) {
    notFound();
  }

  const businesses = await fetchAuthQuery(api.account.listReports);
  const business = businesses.find((row) => row.id === businessId);
  if (!business?.owned) {
    notFound();
  }

  const [availableBands, polarConfig] = await Promise.all([
    configuredAnalyticsBandIds(),
    getPolarConfig(),
  ]);

  const siteOrigin = listwellSiteUrl();

  return (
    <AccountWebAnalytics
      availableBands={availableBands}
      businessId={businessId}
      businessName={business.name}
      checkoutReturned={checkoutReturned}
      paymentsEnabled={Boolean(polarConfig)}
      siteOrigin={siteOrigin}
      state={state}
    />
  );
};

export default AccountAnalyticsPage;
