import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { accountWebAnalyticsStateSchema } from "@/lib/account-web-analytics-state";
import { getSessionUser } from "@/lib/auth";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id: businessId } = paramsSchema.parse(await context.params);
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await fetchAuthQuery(api.webAnalytics.getAccountState, {
    businessExternalId: businessId,
  });
  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(accountWebAnalyticsStateSchema.parse(state));
};

const enabledBodySchema = z.object({
  enabled: z.boolean(),
});

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id: businessId } = paramsSchema.parse(await context.params);
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body: unknown = await request.json();
    const { enabled } = enabledBodySchema.parse(body);
    const state = await fetchAuthMutation(api.webAnalytics.setSiteEnabled, {
      businessExternalId: businessId,
      enabled,
    });
    if (!state) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(accountWebAnalyticsStateSchema.parse(state));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not update analytics" },
      { status: 500 }
    );
  }
};
