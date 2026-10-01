import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { getSessionUser } from "@/lib/auth";
import {
  getBusiness,
  getBusinessOwnerId,
  setBusinessSearchPhrases,
} from "@/lib/data";
import { saveSearchPhraseDraft } from "@/lib/search-phrases";
import { MAX_SEARCH_PHRASES } from "@/lib/seo-schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string(),
});

const bodySchema = z.object({
  phrases: z
    .array(
      z.object({
        suggested: z.boolean().optional(),
        text: z.string(),
      })
    )
    .max(MAX_SEARCH_PHRASES),
});

export const PUT = async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const business = await getBusiness(id);
    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }
    const [sessionUser, ownerId] = await Promise.all([
      getSessionUser(),
      getBusinessOwnerId(id),
    ]);
    if (!sessionUser || (ownerId && sessionUser.id !== ownerId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const parsed = bodySchema.parse(body);
    const phrases = saveSearchPhraseDraft(
      business.searchPhrases,
      parsed.phrases
    );
    const updated = await setBusinessSearchPhrases(id, phrases);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid phrases" }, { status: 400 });
    }
    console.error("Could not save search phrases", error);
    return NextResponse.json(
      { error: "Could not save these phrases" },
      { status: 500 }
    );
  }
};
