import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAuditEngineEnv, getFetchWebsiteOptions } from "@/lib/audit-env";
import { discoverBusiness, discoverRequestSchema } from "@/lib/discover";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = discoverRequestSchema.parse(body);
    const env = await getAuditEngineEnv();
    const options = await getFetchWebsiteOptions();
    const result = await discoverBusiness(parsed, env, options);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid discover request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not search listings" }, { status: 500 });
  }
}
