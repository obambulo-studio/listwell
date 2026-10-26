import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReportClient } from "@/components/report-client";
import { runBusinessCheckBatch } from "@/lib/audit-jobs";
import { businessForPublicView } from "@/lib/business-public";
import { checksForCategory } from "@/lib/checks/registry";
import { pointsFor } from "@/lib/checks/types";
import { getBusiness, getResearchEntitlement } from "@/lib/data";
import {
  monthlyResearchVisible,
  storedPeerComparisonVisible,
} from "@/lib/entitlements-access";
import { getSharedReportViewerAccess } from "@/lib/polar-server";
import {
  getReportShareByToken,
  parseReportShareRouteParams,
} from "@/lib/report-share";
import { loadResearchView } from "@/lib/research-load";
import { listwellSocialMetadata, withListwellTitle } from "@/lib/site-metadata";
import { buildFallbackSummary, completedCheckSchema } from "@/lib/summaries";

export const dynamic = "force-dynamic";

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> => {
  const parsedParams = parseReportShareRouteParams(await params);
  const missing = "Shared report";
  const missingDescription = "This shared Listwell report could not be found.";
  if (!parsedParams) {
    return {
      description: missingDescription,
      robots: { follow: false, index: false },
      title: missing,
      ...listwellSocialMetadata({
        description: missingDescription,
        pathname: "/share",
        title: withListwellTitle(missing),
      }),
    };
  }
  const { token } = parsedParams;
  const share = await getReportShareByToken(token);
  if (!share) {
    return {
      description: missingDescription,
      robots: { follow: false, index: false },
      title: missing,
      ...listwellSocialMetadata({
        description: missingDescription,
        pathname: `/share/${token}`,
        title: withListwellTitle(missing),
      }),
    };
  }
  const business = await getBusiness(share.businessId);
  const pageTitle = business
    ? `${business.name} · shared report`
    : "Shared report";
  const description = business
    ? `Shared visibility report for ${business.name}.`
    : "Shared Listwell visibility report.";
  return {
    description,
    robots: { follow: false, index: false },
    title: pageTitle,
    ...listwellSocialMetadata({
      description,
      pathname: `/share/${token}`,
      title: withListwellTitle(pageTitle),
    }),
  };
};

const checkStatus = (value: boolean | null): "pass" | "fail" | "error" => {
  if (value === true) {
    return "pass";
  }
  if (value === false) {
    return "fail";
  }
  return "error";
};

const SharedReportPage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const parsedParams = parseReportShareRouteParams(await params);
  if (!parsedParams) {
    notFound();
  }
  const { token } = parsedParams;
  const share = await getReportShareByToken(token);
  if (!share) {
    notFound();
  }

  const business = await getBusiness(share.businessId);
  if (!business) {
    notFound();
  }

  const access = await getSharedReportViewerAccess();
  const checks = checksForCategory(business.category);
  const batch = await runBusinessCheckBatch(business, {
    reuseStoredQueued: true,
  });
  const completedChecks = checks.flatMap((definition) => {
    const result = batch.results[definition.id];
    if (!result || result.queued) {
      return [];
    }
    return [
      completedCheckSchema.parse({
        channelCategory: definition.channelCategory,
        id: definition.id,
        points: pointsFor(definition, business.category),
        status: checkStatus(result.value),
        title: definition.title,
        ...(result.label ? { label: result.label } : {}),
      }),
    ];
  });
  const summary = buildFallbackSummary(
    completedChecks,
    completedChecks.length === 0 ? "no_completed_checks" : "ai_binding_missing"
  );
  const entitlement = await getResearchEntitlement(share.businessId);
  const monthlyResearchStored = monthlyResearchVisible(entitlement);
  const researchVisible = monthlyResearchStored;
  const research = researchVisible ? await loadResearchView(business) : null;
  const peerComparisonVisible = storedPeerComparisonVisible(entitlement);

  return (
    <ReportClient
      variant="shared"
      initialBusiness={businessForPublicView(business)}
      checks={checks}
      initialResults={batch.results}
      initialSummary={summary}
      access={access}
      checkoutReturned={false}
      purchasePending={false}
      showKvExpiryNotice={false}
      kvExpiryDays={7}
      checkJobId={batch.pending.length > 0 ? batch.jobId : undefined}
      shareExpiresAt={share.expiresAt}
      research={research}
      researchVisible={researchVisible}
      monthlyResearchStored={monthlyResearchStored}
      peerComparisonVisible={peerComparisonVisible}
    />
  );
};

export default SharedReportPage;
