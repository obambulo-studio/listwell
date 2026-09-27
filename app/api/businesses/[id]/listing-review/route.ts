import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getFetchWebsiteOptions,
  toBusinessSnapshot,
} from "@/lib/audit-env";
import { getBusiness } from "@/lib/data";
import { gatherListingReviewInput } from "@/lib/listing-review-context";
import {
  generateListingReview,
  listingReviewCacheKey,
  listingReviewResultSchema,
  readListingReviewCache,
  resolveWorkersAiBinding,
  writeListingReviewCache,
} from "@/lib/listing-review";
import { reportShowsFixSteps } from "@/lib/entitlements-access";
import { getReportAccess } from "@/lib/polar-server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const POST = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = paramsSchema.parse(await context.params);
  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const access = await getReportAccess(id);
  if (!reportShowsFixSteps(access)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [engineEnv, fetchOptions, env] = await Promise.all([
    getAuditEngineEnv(),
    getFetchWebsiteOptions(),
    getCloudflareEnv(),
  ]);

  const reviewInput = await gatherListingReviewInput({
    business: toBusinessSnapshot(business),
    engineEnv,
    fetchOptions,
  });

  const cacheKey = listingReviewCacheKey(
    business.id,
    business.updatedAt,
    reviewInput.fingerprint
  );
  const cached = await readListingReviewCache(cacheKey, env?.AUDIT_KV);
  if (cached) {
    return NextResponse.json(listingReviewResultSchema.parse(cached));
  }

  const result = await generateListingReview({
    ai: resolveWorkersAiBinding(env?.AI),
    reviewInput,
  });

  if (result.available) {
    await writeListingReviewCache(cacheKey, result, env?.AUDIT_KV);
  }

  return NextResponse.json(listingReviewResultSchema.parse(result));
};
