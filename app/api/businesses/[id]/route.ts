import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getSessionUser } from "@/lib/auth";
import {
  claimBusinesses,
  getActiveEntitlementOwner,
  getBusiness,
  getBusinessOwnerId,
  updateBusiness,
} from "@/lib/data";
import { updateBusinessRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const business = await getBusiness(id);
    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(business);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not load this audit" },
      { status: 500 }
    );
  }
};

export const PUT = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = paramsSchema.parse(await context.params);
  const existing = await getBusiness(id);
  if (!existing) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const [sessionUser, ownerId, entitlement] = await Promise.all([
    getSessionUser(),
    getBusinessOwnerId(id),
    getActiveEntitlementOwner(id),
  ]);
  if (ownerId && ownerId !== sessionUser?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const paidOwnedBySomeoneElse =
    entitlement.unlocked && entitlement.ownerUserId !== sessionUser?.id;
  if (!ownerId && paidOwnedBySomeoneElse) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json();
  const parsed = updateBusinessRequestSchema.parse(body);
  const business = await updateBusiness(id, parsed);

  if (sessionUser && !ownerId) {
    try {
      await claimBusinesses([id], sessionUser.id);
    } catch {
      // Claim is best-effort when Convex is down. The audit is still saved.
    }
  }

  return NextResponse.json(business);
};
