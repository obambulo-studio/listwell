import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import {
  agentKeyLabelSchema,
  createAgentApiKeyForUser,
  listAgentApiKeysForUser,
} from "@/lib/agent-api-keys";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const createBodySchema = z.object({
  label: agentKeyLabelSchema,
});

export const GET = async () => {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const keys = await listAgentApiKeysForUser(user.id);
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json({ error: "Could not load keys" }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body: unknown = await request.json();
    const { label } = createBodySchema.parse(body);
    const created = await createAgentApiKeyForUser({
      label,
      userId: user.id,
    });
    return NextResponse.json({
      id: created.id,
      key: created.key,
      prefix: created.prefix,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "Too many active keys") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Could not create key" },
      { status: 500 }
    );
  }
};
