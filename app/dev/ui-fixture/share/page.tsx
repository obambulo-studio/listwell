import { ReportClient } from "@/components/report-client";
import { businessForPublicView } from "@/lib/business-public";
import { checksForCategory } from "@/lib/checks/registry";
import {
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixtureSharedAccess,
  uiFixtureSummary,
} from "@/lib/dev-ui-fixture";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { follow: false, index: false },
  title: "UI fixture shared report",
};

const UI_FIXTURE_SHARE_EXPIRES_AT = "2026-10-04T00:00:00.000Z";

const DevUiFixtureSharePage = () => {
  const business = uiFixtureBusiness();
  return (
    <ReportClient
      variant="shared"
      initialBusiness={businessForPublicView(business)}
      checks={checksForCategory(business.category)}
      initialResults={uiFixtureCheckResults()}
      initialSummary={uiFixtureSummary()}
      access={uiFixtureSharedAccess()}
      checkoutReturned={false}
      purchasePending={false}
      showKvExpiryNotice={false}
      kvExpiryDays={7}
      shareExpiresAt={UI_FIXTURE_SHARE_EXPIRES_AT}
    />
  );
};

export default DevUiFixtureSharePage;
