import { NextResponse } from "next/server";
import { z } from "zod";

import { getConvexClient } from "@/lib/convex/server";
import { api } from "@/lib/convex/server";

export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  token: z.string().min(8),
});

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const parsed = tokenSchema.safeParse({
    token: url.searchParams.get("token") ?? "",
  });
  if (!parsed.success) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  try {
    const result = await getConvexClient().mutation(
      api.notificationPreferences.unsubscribeByToken,
      { token: parsed.data.token }
    );
    if (!result.ok) {
      return new NextResponse("This unsubscribe link is not valid.", {
        status: 404,
      });
    }
    return new NextResponse(
      "You are unsubscribed from Listwell monthly scan emails. You can still sign in to view reports.",
      {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("unsubscribe: failed", error);
    return new NextResponse(
      "We could not update your preferences right now. Try again later.",
      { status: 503 }
    );
  }
};
