import { NextResponse } from "next/server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { claimBusinessesRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = claimBusinessesRequestSchema.parse(body);
  try {
    const claimed = await fetchAuthMutation(api.businesses.claim, {
      externalIds: parsed.ids,
    });
    return NextResponse.json({ claimed });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
};
