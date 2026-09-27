import { ReportClient } from "@/components/report-client";
import { checksForCategory } from "@/lib/checks/registry";
import {
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixtureCheckoutReturnedAccess,
  uiFixtureSummary,
} from "@/lib/dev-ui-fixture";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { follow: false, index: false },
  title: "UI fixture checkout success",
};

const DevUiFixtureCheckoutSuccessPage = () => (
  <ReportClient
    initialBusiness={uiFixtureBusiness()}
    checks={checksForCategory("food")}
    initialResults={uiFixtureCheckResults()}
    initialSummary={uiFixtureSummary()}
    access={uiFixtureCheckoutReturnedAccess()}
    checkoutReturned
    purchasePending={false}
    showKvExpiryNotice={false}
    kvExpiryDays={7}
  />
);

export default DevUiFixtureCheckoutSuccessPage;
