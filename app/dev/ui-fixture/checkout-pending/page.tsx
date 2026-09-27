import { ReportClient } from "@/components/report-client";
import { checksForCategory } from "@/lib/checks/registry";
import {
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixtureOwnerAccess,
  uiFixtureSummary,
} from "@/lib/dev-ui-fixture";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { follow: false, index: false },
  title: "UI fixture checkout pending",
};

const DevUiFixtureCheckoutPendingPage = () => (
  <ReportClient
    initialBusiness={uiFixtureBusiness()}
    checks={checksForCategory("food")}
    initialResults={uiFixtureCheckResults()}
    initialSummary={uiFixtureSummary()}
    access={uiFixtureOwnerAccess()}
    checkoutReturned={false}
    purchasePending
    showKvExpiryNotice={false}
    kvExpiryDays={7}
  />
);

export default DevUiFixtureCheckoutPendingPage;
