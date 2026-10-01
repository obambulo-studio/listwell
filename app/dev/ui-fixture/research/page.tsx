import { z } from "zod";

import { ReportClient } from "@/components/report-client";
import { checksForCategory } from "@/lib/checks/registry";
import {
  uiFixtureCheckResults,
  uiFixtureListingReview,
  uiFixtureMonthlyAccess,
  uiFixtureMonthlyBusiness,
  uiFixturePeerAudit,
  uiFixtureResearchView,
  uiFixtureScanHistory,
  uiFixtureSummary,
} from "@/lib/dev-ui-fixture";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { follow: false, index: false },
  title: "UI fixture research",
};

const periodsSchema = z.object({
  periods: z.enum(["1", "2"]).optional(),
});

const DevUiFixtureResearchPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const raw = await searchParams;
  const periodValue = Array.isArray(raw.periods) ? raw.periods[0] : raw.periods;
  const search = periodsSchema.parse({ periods: periodValue });
  const business = uiFixtureMonthlyBusiness();
  const periodCount = search.periods === "1" ? 1 : 2;
  return (
    <ReportClient
      access={uiFixtureMonthlyAccess()}
      checkoutReturned={false}
      checks={checksForCategory(business.category)}
      initialBusiness={business}
      initialResults={uiFixtureCheckResults()}
      initialSummary={uiFixtureSummary()}
      kvExpiryDays={7}
      listingReviewOverride={uiFixtureListingReview()}
      peerAuditOverride={uiFixturePeerAudit()}
      purchasePending={false}
      research={uiFixtureResearchView(periodCount)}
      researchVisible
      scanHistoryOverride={uiFixtureScanHistory()}
      showKvExpiryNotice={false}
    />
  );
};

export default DevUiFixtureResearchPage;
