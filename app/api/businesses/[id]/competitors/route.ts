import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import { getSessionUser } from "@/lib/auth";
import {
  getBusiness,
  getBusinessOwnerId,
  setBusinessCompetitors,
} from "@/lib/data";
import {
  googlePlaceIdFromLocations,
  nextCompetitorLists,
  normaliseCompetitorPlaceId,
} from "@/lib/peers";
import { getReportAccess } from "@/lib/polar-server";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const bodySchema = z.object({
  action: z.enum(["hide", "pin", "unpin"]),
  placeId: z.string().trim().min(1),
});

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (error instanceof Error) {
    if (error.message === "Too many pinned competitors") {
      return NextResponse.json(
        {
          error:
            "The competitor set is full. Remove one before adding another.",
        },
        { status: 400 }
      );
    }
    if (error.message === "Too many hidden competitors") {
      return NextResponse.json(
        { error: "Too many hidden competitors" },
        { status: 400 }
      );
    }
    if (error.message === "Missing place") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  }
  return NextResponse.json(
    { error: "Could not update competitors" },
    { status: 500 }
  );
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const allowed = await consumeRateLimit({
      bucket: "competitors",
      env: await getCloudflareEnv(),
      failClosed: false,
      maxRequests: 20,
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
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }

    const access = await getReportAccess(id);
    if (!access.unlocked || access.sessionRequired) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [sessionUser, ownerId] = await Promise.all([
      getSessionUser(),
      getBusinessOwnerId(id),
    ]);
    if (ownerId && sessionUser?.id !== ownerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = bodySchema.parse(await request.json());
    const selfPlaceId = googlePlaceIdFromLocations(business.locations);
    if (
      selfPlaceId &&
      normaliseCompetitorPlaceId(selfPlaceId) ===
        normaliseCompetitorPlaceId(body.placeId)
    ) {
      return NextResponse.json(
        { error: "Choose a different business" },
        { status: 400 }
      );
    }

    const next = nextCompetitorLists({
      action: body.action,
      competitors: business.competitors,
      hiddenCompetitorPlaceIds: business.hiddenCompetitorPlaceIds,
      placeId: body.placeId,
    });
    const updated = await setBusinessCompetitors(id, next);
    return NextResponse.json({
      competitors: updated.competitors,
      hiddenCompetitorPlaceIds: updated.hiddenCompetitorPlaceIds,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
