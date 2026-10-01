import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { getBusiness, getResearchEntitlement } from "@/lib/data";
import {
  ensurePeerAudit,
  googlePlaceIdFromLocations,
  peerAuditJobSchema,
  peerSelectionKeyForAudit,
  readLatestPeerJob,
  readPeerJob,
} from "@/lib/peers";
import { getReportAccess } from "@/lib/polar-server";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const querySchema = z.object({
  jobId: z.string().optional(),
});

const missingBusiness = () =>
  NextResponse.json({ error: "Business not found" }, { status: 404 });

/** Free previews stay nearby-only. Continued reports add the map pack. Pins stay on unlocked reports. */
const comparisonMode = async (
  businessId: string
): Promise<{ includeMapPack: boolean; preview: boolean }> => {
  const [access, entitlement] = await Promise.all([
    getReportAccess(businessId),
    getResearchEntitlement(businessId),
  ]);
  const continued =
    entitlement?.kind === "report_monthly" && entitlement.status === "active";
  return {
    includeMapPack: continued,
    preview: !access.unlocked && !continued,
  };
};

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const business = await getBusiness(id);
    if (!business) {
      return missingBusiness();
    }

    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    const mode = await comparisonMode(business.id);
    const placeId = googlePlaceIdFromLocations(business.locations);
    const selectionKey = await peerSelectionKeyForAudit(business, mode);
    const job = query.jobId
      ? await readPeerJob(query.jobId)
      : await readLatestPeerJob(business.id, placeId, selectionKey);
    const shared = await readLatestPeerJob(business.id, placeId, selectionKey);
    if (!job || (job.businessId !== business.id && shared?.id !== job.id)) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(peerAuditJobSchema.parse(job));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not load the nearby comparison" },
      { status: 500 }
    );
  }
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "peers",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 6,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again soon." },
        { status: 429 }
      );
    }
    const { id } = paramsSchema.parse(await context.params);
    const business = await getBusiness(id);
    if (!business) {
      return missingBusiness();
    }
    const mode = await comparisonMode(business.id);
    const job = await ensurePeerAudit(business, {
      includeMapPack: mode.includeMapPack,
      preview: mode.preview,
    });
    return NextResponse.json(peerAuditJobSchema.parse(job));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not compare nearby businesses" },
      { status: 500 }
    );
  }
};
