"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCategoryIdFromGooglePlaceTypes, type CategoryId } from "@/lib/category";
import { type DiscoveredProfile } from "@/lib/channel";
import { z } from "zod";

const googlePlacesSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.object({ text: z.string() }),
        websiteUri: z.string().optional(),
        formattedAddress: z.string().optional(),
        types: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export function DiscoverClient({
  businessName,
  websiteUrl,
  categoryId,
}: {
  businessName: string;
  websiteUrl?: string;
  categoryId: CategoryId;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Looking for map listings");
  const [profiles, setProfiles] = useState<DiscoveredProfile[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function discover() {
      const found: DiscoveredProfile[] = [];
      let nextCategory = categoryId;

      if (websiteUrl) {
        found.push({ type: "website", title: websiteUrl });
      }

      const googleKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
      if (googleKey) {
        setStatus("Looking for map listings");
        try {
          const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": googleKey,
              "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.formattedAddress,places.types",
            },
            body: JSON.stringify({
              textQuery: businessName,
              includePureServiceAreaBusinesses: true,
              locationRestriction: {
                rectangle: {
                  low: { latitude: -44.0, longitude: 112.0 },
                  high: { latitude: -10.0, longitude: 154.0 },
                },
              },
            }),
          });
          const parsed = googlePlacesSchema.parse(await response.json());
          const normalizedSearch = businessName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          for (const place of parsed.places ?? []) {
            const normalizedName = place.displayName.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (!normalizedName.includes(normalizedSearch)) {
              continue;
            }
            found.push({
              type: "google-maps",
              title: place.displayName.text,
              subtitle: place.formattedAddress,
              googlePlaceId: place.id,
            });
            if (place.websiteUri && !found.some((profile) => profile.type === "website")) {
              found.push({ type: "website", title: place.websiteUri });
            }
            if (place.types) {
              nextCategory = getCategoryIdFromGooglePlaceTypes(place.types);
            }
          }
        } catch {
          setStatus("Map search skipped");
        }
      }

      if (cancelled) {
        return;
      }

      setProfiles(found);
      setStatus("Opening what we found");
      const params = new URLSearchParams({
        businessName,
        categoryId: nextCategory,
        discoveredProfiles: JSON.stringify(found),
      });
      router.replace(`/new?${params.toString()}`);
    }

    void discover();
    return () => {
      cancelled = true;
    };
  }, [businessName, categoryId, router, websiteUrl]);

  return (
    <div className="vbg-custom-progress">
      <p className="vbg-lede">{status}.</p>
      <ul>
        {profiles.map((profile) => (
          <li key={`${profile.type}-${profile.title}`}>
            <span className="vbg-label">{profile.type}</span> {profile.title}
            {profile.subtitle ? <div className="vbg-meta">{profile.subtitle}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
