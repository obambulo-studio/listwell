import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { canManageBusinessGuests } from "@/lib/business-guest-access";
import { api } from "@/lib/convex/server";
import {
  businessGuestInviteRequestSchema,
  businessGuestListSchema,
} from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const revokeBodySchema = z.object({
  email: z.string().min(1),
});

export const GET = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const allowed = await canManageBusinessGuests(id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const guests = await fetchAuthQuery(api.businessGuests.listForBusiness, {
      businessExternalId: id,
    });
    return NextResponse.json(businessGuestListSchema.parse({ guests }));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not load team access" },
      { status: 500 }
    );
  }
};

export const POST = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const allowed = await canManageBusinessGuests(id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const parsed = businessGuestInviteRequestSchema.parse(body);
    await fetchAuthMutation(api.businessGuests.invite, {
      businessExternalId: id,
      email: parsed.email,
    });
    const guests = await fetchAuthQuery(api.businessGuests.listForBusiness, {
      businessExternalId: id,
    });
    return NextResponse.json(businessGuestListSchema.parse({ guests }));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Could not send invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
};

export const DELETE = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const allowed = await canManageBusinessGuests(id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const parsed = revokeBodySchema.parse(body);
    await fetchAuthMutation(api.businessGuests.revoke, {
      businessExternalId: id,
      email: parsed.email,
    });
    const guests = await fetchAuthQuery(api.businessGuests.listForBusiness, {
      businessExternalId: id,
    });
    return NextResponse.json(businessGuestListSchema.parse({ guests }));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Could not remove team member";
    return NextResponse.json({ error: message }, { status: 400 });
  }
};
