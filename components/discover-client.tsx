"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingChoices } from "@/components/place-search";
import { type CategoryId } from "@/lib/category";
import {
  discoverResponseSchema,
  filterProfilesForCandidate,
  type DiscoverResponse,
  type PlaceCandidate,
} from "@/lib/discover";
import { businessInputFromDiscovery } from "@/lib/profiles";
import { addBusinessId } from "@/lib/storage";
import { businessSchema } from "@/lib/schema";

async function persistDiscovery(
  name: string,
  nextCategory: CategoryId,
  profiles: DiscoverResponse["profiles"],
  nextAddress?: string,
): Promise<string | null> {
  try {
    const response = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(businessInputFromDiscovery(name, nextCategory, profiles, nextAddress)),
    });
    if (!response.ok) {
      return null;
    }
    const business = businessSchema.parse(await response.json());
    addBusinessId(business.id);
    return business.id;
  } catch {
    return null;
  }
}

async function goToConfirm(
  router: ReturnType<typeof useRouter>,
  name: string,
  discovery: DiscoverResponse,
  candidate: PlaceCandidate | undefined,
  fallbackAddress?: string,
): Promise<void> {
  const profiles = candidate ? filterProfilesForCandidate(discovery.profiles, candidate) : discovery.profiles;
  const nextAddress = discovery.address ?? candidate?.address ?? fallbackAddress;
  const persisted = await persistDiscovery(name, discovery.categoryId, profiles, nextAddress);
  if (persisted) {
    router.replace(`/new?id=${encodeURIComponent(persisted)}`);
    return;
  }
  const params = new URLSearchParams({
    businessName: name,
    categoryId: discovery.categoryId,
    discoveredProfiles: JSON.stringify(profiles),
  });
  if (nextAddress) {
    params.set("address", nextAddress);
  }
  router.replace(`/new?${params.toString()}`);
}

export function DiscoverClient({
  businessName,
  websiteUrl,
  categoryId,
  googlePlaceId,
  appleMapsId,
  listingUrl,
  address,
  facebookUrl,
  instagramUsername,
  near,
}: {
  businessName: string;
  websiteUrl?: string;
  categoryId: CategoryId;
  googlePlaceId?: string;
  appleMapsId?: string;
  listingUrl?: string;
  address?: string;
  facebookUrl?: string;
  instagramUsername?: string;
  near?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Looking for map listings, a website, and social profiles");
  const [result, setResult] = useState<DiscoverResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let holdTimer = 0;
    let releaseHold = () => {};
    const sentenceHold = new Promise<void>((resolve) => {
      releaseHold = resolve;
      holdTimer = window.setTimeout(resolve, 2000);
    });

    async function discover() {
      setStatus("Looking for map listings, a website, and social profiles");
      try {
        const response = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName,
            websiteUrl,
            categoryId,
            googlePlaceId,
            appleMapsId,
            listingUrl,
            address,
            facebookUrl,
            instagramUsername,
            near,
          }),
        });
        if (!response.ok) {
          throw new Error("Could not search listings");
        }
        const parsed = discoverResponseSchema.parse(await response.json());
        if (cancelled) {
          return;
        }
        setResult(parsed);

        const selectedCandidate =
          parsed.candidates.find((candidate) => googlePlaceId && candidate.source === "google" && candidate.id === googlePlaceId) ??
          parsed.candidates.find((candidate) => appleMapsId && candidate.source === "apple" && candidate.id === appleMapsId) ??
          parsed.candidates[0];
        const preselected = Boolean(googlePlaceId || appleMapsId);
        if (parsed.candidates.length > 1 && !preselected) {
          setStatus("Choose the listing that is yours");
          return;
        }

        await sentenceHold;
        if (cancelled) {
          return;
        }
        await goToConfirm(router, selectedCandidate?.name ?? businessName, parsed, selectedCandidate, address);
      } catch {
        if (!cancelled) {
          setStatus("Continuing with the details you entered");
          await sentenceHold;
          if (cancelled) {
            return;
          }
          await goToConfirm(
            router,
            businessName,
            {
              categoryId,
              candidates: [],
              profiles: [
                websiteUrl ? { type: "website" as const, title: websiteUrl } : null,
                listingUrl ? { type: "google-maps" as const, title: listingUrl, googlePlaceId: listingUrl, subtitle: address } : null,
                facebookUrl ? { type: "facebook" as const, title: facebookUrl } : null,
                instagramUsername ? { type: "instagram" as const, title: instagramUsername } : null,
              ].filter((profile): profile is NonNullable<typeof profile> => profile !== null),
              address,
            },
            undefined,
            address,
          );
        }
      }
    }

    void discover();
    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer);
      releaseHold();
    };
  }, [address, appleMapsId, businessName, categoryId, facebookUrl, googlePlaceId, instagramUsername, listingUrl, near, router, websiteUrl]);

  function chooseCandidate(candidate: PlaceCandidate) {
    if (!result) {
      return;
    }
    void goToConfirm(router, candidate.name, result, candidate, address);
  }

  const needsChoice = Boolean(result && result.candidates.length > 1 && !googlePlaceId && !appleMapsId);

  return (
    <div className="vbg-custom-progress">
      <p className="vbg-lede" aria-live="polite">
        {status}.
      </p>
      {needsChoice && result ? <ListingChoices candidates={result.candidates} onSelect={chooseCandidate} /> : null}
    </div>
  );
}
