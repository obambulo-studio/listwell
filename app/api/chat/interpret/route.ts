import { NextResponse } from "next/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";
import {
  CHAT_INTERPRET_TEXT_MAX,
  chatDraftSchema,
  chatPhaseSchema,
} from "@/lib/chat-onboarding";
import {
  interpretChatInputWithJev,
  interpretResponseSchema,
} from "@/lib/jev-decisions";
import { consumeRateLimit } from "@/lib/rate-limit-kv";

export const dynamic = "force-dynamic";

const interpretRequestSchema = z.object({
  draft: chatDraftSchema,
  phase: chatPhaseSchema,
  text: z.string().min(1).max(CHAT_INTERPRET_TEXT_MAX),
});

export const POST = async (request: Request) => {
  try {
    const env = await getCloudflareEnv();
    const allowed = await consumeRateLimit({
      bucket: "chat-interpret",
      env,
      request,
    });
    if (!allowed) {
      return NextResponse.json(
        { intent: "other", skipWebsite: false },
        { status: 429 }
      );
    }

    const body: unknown = await request.json();
    const parsed = interpretRequestSchema.parse(body);
    const result = await interpretChatInputWithJev({
      draft: parsed.draft,
      phase: parsed.phase,
      text: parsed.text,
    });
    if (!result) {
      return NextResponse.json({ intent: "other", skipWebsite: false });
    }
    return NextResponse.json(
      interpretResponseSchema.parse({
        businessName: result.businessName,
        categoryText: result.categoryText,
        intent: result.intent,
        location: result.location,
        skipWebsite: result.skipWebsite,
        websiteUrl: result.websiteUrl,
      })
    );
  } catch {
    return NextResponse.json({ intent: "other", skipWebsite: false });
  }
};
