import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { consumeRateLimit } from "@/lib/rate-limit-kv";
import {
  createReportShare,
  reportShareStateForBusiness,
  revokeReportShare,
} from "@/lib/report-share";
import { canManageReportShare } from "@/lib/report-share-auth";
import { createReportShareRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const originFromRequest = (request: Request): string => {
  const url = new URL(request.url);
  return url.origin;
};

export const GET = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const access = await canManageReportShare(id);
    if (access.reason === "not_found") {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    if (!access.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const state = await reportShareStateForBusiness(
      id,
      originFromRequest(request)
    );
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not load share link" },
      { status: 500 }
    );
  }
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const env = await getCloudflareEnv();
    const allowed = await consumeRateLimit({
      bucket: "report-share-create",
      env,
      failClosed: Boolean(env?.AUDIT_KV),
      maxRequests: 10,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again soon." },
        { status: 429 }
      );
    }

    const { id } = paramsSchema.parse(await context.params);
    const manage = await canManageReportShare(id);
    if (manage.reason === "not_found") {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    if (!manage.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createReportShareRequestSchema.parse(body);
    const state = await createReportShare({
      businessId: id,
      expiresInDays: parsed.expiresInDays,
      origin: originFromRequest(request),
    });
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not create share link" },
      { status: 500 }
    );
  }
};

export const DELETE = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const manage = await canManageReportShare(id);
    if (manage.reason === "not_found") {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    if (!manage.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const state = await revokeReportShare(id);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not revoke share link" },
      { status: 500 }
    );
  }
};
