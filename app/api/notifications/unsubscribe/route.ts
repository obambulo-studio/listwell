import { NextResponse } from "next/server";
import { z } from "zod";

import { api, getConvexClient } from "@/lib/convex/server";

export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  token: z.string().min(8),
});

const unsubscribeByToken = async (
  token: string
): Promise<
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "error" }
> => {
  const parsed = tokenSchema.safeParse({ token });
  if (!parsed.success) {
    return { kind: "invalid" };
  }

  try {
    const result = await getConvexClient().mutation(
      api["notification-preferences"].unsubscribeByToken,
      { token: parsed.data.token }
    );
    if (!result.ok) {
      return { kind: "not-found" };
    }
    return { kind: "ok" };
  } catch (error) {
    console.error("unsubscribe: failed", error);
    return { kind: "error" };
  }
};

const readTokenFromPost = async (request: Request): Promise<string> => {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) {
    return fromQuery;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    const fromForm = form.get("token");
    if (typeof fromForm === "string") {
      return fromForm;
    }
  }
  return "";
};

export const POST = async (request: Request) => {
  const token = await readTokenFromPost(request);
  const outcome = await unsubscribeByToken(token);

  if (outcome.kind === "invalid") {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }
  if (outcome.kind === "not-found") {
    return new NextResponse("This unsubscribe link is not valid.", {
      status: 404,
    });
  }
  if (outcome.kind === "error") {
    return new NextResponse(
      "We could not update your preferences right now. Try again later.",
      { status: 503 }
    );
  }

  return new NextResponse(
    "You are unsubscribed from Listwell monthly scan emails. You can still sign in to view reports.",
    {
      headers: { "content-type": "text/plain; charset=utf-8" },
      status: 200,
    }
  );
};
