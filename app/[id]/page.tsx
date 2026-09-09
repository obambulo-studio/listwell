import { notFound } from "next/navigation";
import { z } from "zod";

import { CheckoutReturnRedirect } from "@/components/checkout-return-redirect";
import { ReportClient } from "@/components/report-client";
import { runBusinessCheckBatch } from "@/lib/audit-jobs";
import { checksForCategory } from "@/lib/checks/registry";
import { pointsFor } from "@/lib/checks/types";
import { getBusiness } from "@/lib/data";
import { getReportAccess } from "@/lib/polar-server";
import { buildFallbackSummary, completedCheckSchema } from "@/lib/summaries";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const searchParamsSchema = z.object({
  checkout_id: z.union([z.string(), z.array(z.string())]).optional(),
});

const checkoutIdFromSearch = (
  value: string | string[] | undefined
): string | undefined => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return undefined;
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

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ id: string }>;
}) => {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  return {
    title: business ? `${business.name} report` : "Report",
  };
};

const ReportPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const { id } = paramsSchema.parse(await params);
  const business = await getBusiness(id);
  if (!business) {
    notFound();
  }

  const search = searchParamsSchema.parse(await searchParams);
  const checkoutId = checkoutIdFromSearch(search.checkout_id);
  if (checkoutId) {
    return <CheckoutReturnRedirect checkoutId={checkoutId} businessId={id} />;
  }

  const access = await getReportAccess(id);
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

  return (
    <ReportClient
      initialBusiness={business}
      checks={checks}
      initialResults={batch.results}
      initialSummary={summary}
      access={access}
      checkoutReturned={Boolean(checkoutId)}
      checkJobId={batch.pending.length > 0 ? batch.jobId : undefined}
    />
  );
};

export default ReportPage;
