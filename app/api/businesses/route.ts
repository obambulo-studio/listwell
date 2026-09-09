import { NextResponse } from "next/server";

import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { api } from "@/lib/convex/server";
import { createBusiness, idListQuerySchema, listBusinesses } from "@/lib/data";
import { businessSchema, createBusinessRequestSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
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
};

export const POST = async (request: Request) => {
  const body: unknown = await request.json();
  const parsed = createBusinessRequestSchema.parse(body);

  if (await isAuthenticated()) {
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
    return NextResponse.json(businessSchema.parse(created));
  }

  const business = await createBusiness(parsed);
  return NextResponse.json(business);
};
