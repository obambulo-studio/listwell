import { ReportClient } from "@/components/report-client";
import { checksForCategory } from "@/lib/checks/registry";
import {
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixtureListingReview,
  uiFixtureUnlockedAccess,
  uiFixtureScanHistory,
  uiFixtureSummary,
} from "@/lib/dev-ui-fixture";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { follow: false, index: false },
  title: "UI fixture report",
};

const DevUiFixtureReportPage = () => {
  const business = uiFixtureBusiness();
  return (
    <ReportClient
      initialBusiness={business}
      checks={checksForCategory(business.category)}
      initialResults={uiFixtureCheckResults()}
      initialSummary={uiFixtureSummary()}
      access={uiFixtureUnlockedAccess()}
      checkoutReturned={false}
      purchasePending={false}
      showKvExpiryNotice={false}
      kvExpiryDays={7}
      listingReviewOverride={uiFixtureListingReview()}
      scanHistoryOverride={uiFixtureScanHistory()}
    />
  );
};

export default DevUiFixtureReportPage;
