import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  token: z.string().min(16),
});

export const POST = async (
  _request: Request,
  context: { params: Promise<{ token: string }> }
) => {
  try {
    const { token } = paramsSchema.parse(await context.params);
    const result = await fetchAuthMutation(api.businessGuests.acceptByToken, {
      token,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Could not accept invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
};
