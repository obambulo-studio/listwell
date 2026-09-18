import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import {
  createBusiness,
  idListQuerySchema,
  listBusinesses,
  writeStoredBusiness,
} from "@/lib/data";
import { businessSchema, createBusinessRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const isAuthed = async (): Promise<boolean> => {
  try {
    return await isAuthenticated();
  } catch {
    return false;
  }
};

export const GET = async (request: Request) => {
  try {
    const url = new URL(request.url);
    const query = idListQuerySchema.parse({
      ids: url.searchParams.get("ids") ?? undefined,
    });
    if (!query.ids) {
      return NextResponse.json([]);
    }
    const ids = query.ids.split(",").flatMap((id) => {
      const trimmed = id.trim();
      return trimmed ? [trimmed] : [];
    });
    const businesses = await listBusinesses(ids);
    return NextResponse.json(businesses);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not load audits" },
      { status: 500 }
    );
  }
};

export const POST = async (request: Request) => {
  try {
    const body: unknown = await request.json();
    const parsed = createBusinessRequestSchema.parse(body);

    if (await isAuthed()) {
      try {
        const created = await fetchAuthMutation(api.businesses.create, {
          category: parsed.category,
          deliverooUrl: parsed.deliverooUrl,
          doorDashUrl: parsed.doorDashUrl,
          externalId: parsed.id,
          facebookUsername: parsed.facebookUsername,
          instagramUsername: parsed.instagramUsername,
          linkedinUrl: parsed.linkedinUrl,
          locations: parsed.locations.map((location) => ({
            address: location.address,
            appleMapsId: location.appleMapsId,
            googlePlaceId: location.googlePlaceId,
            name: location.name,
          })),
          menulogUrl: parsed.menulogUrl,
          name: parsed.name,
          tiktokUsername: parsed.tiktokUsername,
          uberEatsUrl: parsed.uberEatsUrl,
          websiteUrl: parsed.websiteUrl,
          xUsername: parsed.xUsername,
          youtubeUrl: parsed.youtubeUrl,
        });
        try {
          await fetchAuthMutation(api.claims.claim, {
            externalIds: [created.id],
          });
        } catch {
          // Claim is best-effort after a signed-in create.
        }
        return NextResponse.json(
          await writeStoredBusiness(businessSchema.parse(created))
        );
      } catch {
        // Auth create is best-effort. Anonymous KV/Convex create still runs.
      }
    }

    const business = await createBusiness(parsed);
    return NextResponse.json(business);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid business" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Could not save this audit" },
      { status: 500 }
    );
  }
};
