import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  canRemoveOwnedBusiness,
  otherAccountsStillHaveAccessMessage,
} from "@/lib/account-business-remove";
import { getSessionUser } from "@/lib/auth";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { getBusinessOwnerId, purgeStoredBusiness } from "@/lib/data";
import {
  revokeSubscriptionsForBusinessRemoval,
  SubscriptionRevokeError,
} from "@/lib/polar-server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const DELETE = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerId = await getBusinessOwnerId(id);
    if (!ownerId) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    if (
      !canRemoveOwnedBusiness({
        ownerId,
        sessionUserId: sessionUser.id,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const preview = await fetchAuthQuery(api.businesses.removalPreview, {
      externalId: id,
    });
    if (preview.blocked) {
      return NextResponse.json(
        { error: otherAccountsStillHaveAccessMessage },
        { status: 409 }
      );
    }

    // react-doctor-disable-next-line react-doctor/async-parallel
    await revokeSubscriptionsForBusinessRemoval(preview.subscriptionIds);
    await fetchAuthMutation(api.businesses.removeOwned, { externalId: id });
    await purgeStoredBusiness(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof SubscriptionRevokeError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof Error && error.message === "Business not found") {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      error instanceof Error &&
      error.message.includes(otherAccountsStillHaveAccessMessage)
    ) {
      return NextResponse.json(
        { error: otherAccountsStillHaveAccessMessage },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Could not remove this business" },
      { status: 500 }
    );
  }
};
