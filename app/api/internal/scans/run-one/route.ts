import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { timingSafeEqual } from "@/lib/auth";
import { setNextScanAt } from "@/lib/data";
import { runScanForBusiness } from "@/lib/scans";
import { nextScanAtFrom } from "@/lib/schema";

export const dynamic = "force-dynamic";

const optionalSecret = z.string().min(1).optional();

const runOneBodySchema = z.object({
  businessId: z.string().min(1),
  entitlementId: z.string().min(1),
});

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalSecret.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const getInternalSecret = async (): Promise<string | undefined> => {
  const workerEnv = await getCloudflareEnv();
  return (
    readSecret(workerEnv?.INTERNAL_API_SECRET) ??
    readSecret(process.env.INTERNAL_API_SECRET)
  );
};

const bearerToken = (request: Request): string | undefined => {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
};

export const POST = async (request: Request) => {
  const secret = await getInternalSecret();
  const token = bearerToken(request);
  if (!secret || !token || !timingSafeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = runOneBodySchema.parse(body);
  const now = new Date();

  try {
    await runScanForBusiness(parsed.businessId, "schedule");
  } catch (error) {
    await setNextScanAt(parsed.entitlementId, nextScanAtFrom(now));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Scan failed",
        ok: false,
      },
      { status: 500 }
    );
  }

  await setNextScanAt(parsed.entitlementId, nextScanAtFrom(now));
  return NextResponse.json({ ok: true });
};
