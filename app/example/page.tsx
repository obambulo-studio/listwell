import type { Metadata } from "next";

import { ReportClient } from "@/components/report-client";
import { SampleReportNotice } from "@/components/sample-report-notice";
import { checksForCategory } from "@/lib/checks/registry";
import {
  sampleReportPreviewAccess,
  uiFixtureBusiness,
  uiFixtureCheckResults,
  uiFixturePeerAudit,
  uiFixtureSummary,
} from "@/lib/sample-report-fixture";
import {
  canonicalFor,
  listwellSocialMetadata,
  withListwellTitle,
} from "@/lib/site-metadata";

const description =
  "See a free sample visibility report for Sample Cafe — scores, checks, and nearby comparison without entering your business details.";
const title = "Sample report";

export const metadata: Metadata = {
  alternates: canonicalFor("/example"),
  description,
  title,
  ...listwellSocialMetadata({
    description,
    pathname: "/example",
    title: withListwellTitle(title),
  }),
};

const SampleReportPage = () => {
  const business = uiFixtureBusiness();
  return (
    <>
      <SampleReportNotice />
      <ReportClient
        staticPreview
        initialBusiness={business}
        checks={checksForCategory(business.category)}
        initialResults={uiFixtureCheckResults()}
        initialSummary={uiFixtureSummary()}
        access={sampleReportPreviewAccess()}
        checkoutReturned={false}
        purchasePending={false}
        showKvExpiryNotice={false}
        kvExpiryDays={7}
        peerAuditOverride={uiFixturePeerAudit()}
        peerComparisonVisible
      />
    </>
  );
};

export default SampleReportPage;
