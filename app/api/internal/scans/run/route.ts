import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { timingSafeEqual } from "@/lib/auth";
import { runDueScans } from "@/lib/scans";

export const dynamic = "force-dynamic";

const optionalSecret = z.string().min(1).optional();

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

  const result = await runDueScans({ limit: 5 });
  return NextResponse.json(result);
};
