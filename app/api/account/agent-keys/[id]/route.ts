import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { revokeAgentApiKeyForUser } from "@/lib/agent-api-keys";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const DELETE = async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = paramsSchema.parse(await context.params);
    await revokeAgentApiKeyForUser({ keyId: id, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Key not found") {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Could not revoke key" },
      { status: 500 }
    );
  }
};
