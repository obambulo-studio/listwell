import { NextResponse } from "next/server";
import { z } from "zod";

import { chatDraftSchema, chatPhaseSchema } from "@/lib/chat-onboarding";
import {
  interpretChatInputWithJev,
  interpretResponseSchema,
} from "@/lib/jev-decisions";

export const dynamic = "force-dynamic";

const interpretRequestSchema = z.object({
  draft: chatDraftSchema,
  phase: chatPhaseSchema,
  text: z.string().min(1),
});

export const POST = async (request: Request) => {
  try {
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
