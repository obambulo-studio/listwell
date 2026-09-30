import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { getSessionUser } from "@/lib/auth";
import {
  getBusiness,
  getBusinessOwnerId,
  tryConsumeOnceRescan,
} from "@/lib/data";
import { getReportAccess } from "@/lib/polar-server";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import { runScanForBusiness } from "@/lib/scans";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = paramsSchema.parse(await context.params);
  const env = await getCloudflareEnv();
  const allowed = await consumeRateLimit({
    bucket: "once-rescan",
    env,
    failClosed: false,
    maxRequests: 5,
    request,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const business = await getBusiness(id);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const access = await getReportAccess(id);
  if (!access.unlocked || access.sessionRequired) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (access.kind !== "report_once") {
    return NextResponse.json(
      { error: "Re-scan is only available for one-off reports" },
      { status: 400 }
    );
  }

  const [sessionUser, ownerId] = await Promise.all([
    getSessionUser(),
    getBusinessOwnerId(id),
  ]);
  if (ownerId && sessionUser?.id !== ownerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  let consumed: Awaited<ReturnType<typeof tryConsumeOnceRescan>>;
  try {
    consumed = await tryConsumeOnceRescan(id, now);
  } catch (error) {
    console.error("rescan: entitlement check failed", error);
    return NextResponse.json(
      { error: "Could not verify re-scan eligibility" },
      { status: 503 }
    );
  }

  if (!consumed.allowed) {
    let message = "Re-scan is not available for this report";
    if (consumed.reason === "window_expired") {
      message = "The free re-scan window has ended";
    } else if (consumed.reason === "limit_reached") {
      message = "You have already used your free re-scan";
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const scan = await runScanForBusiness(id, "rescan");
    return NextResponse.json({
      ok: true,
      scan: {
        finishedAt: scan.finishedAt,
        id: scan.id,
        score: scan.score,
        status: scan.status,
      },
    });
  } catch (error) {
    console.error("rescan: scan failed", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
};
