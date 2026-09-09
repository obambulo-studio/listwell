"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ListingChoices } from "@/components/place-search";
import type { CategoryId } from "@/lib/category";
import {
  discoverResponseSchema,
  filterProfilesForCandidate,
} from "@/lib/discover";
import type { DiscoverResponse, PlaceCandidate } from "@/lib/discover";
import { businessInputFromDiscovery } from "@/lib/profiles";
import { businessSchema } from "@/lib/schema";
import { addBusinessId } from "@/lib/storage";
import { waitForMs } from "@/lib/wait";

const SENTENCE_HOLD_MS = 2000;

const persistDiscovery = async (
  name: string,
  nextCategory: CategoryId,
  profiles: DiscoverResponse["profiles"],
  nextAddress?: string
): Promise<string | null> => {
  try {
    const response = await fetch("/api/businesses", {
      body: JSON.stringify(
        businessInputFromDiscovery(name, nextCategory, profiles, nextAddress)
      ),
      headers: { "Content-Type": "application/json" },
      method: "POST",
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
};

const goToConfirm = async (
  replace: ReturnType<typeof useRouter>["replace"],
  name: string,
  discovery: DiscoverResponse,
  candidate: PlaceCandidate | undefined,
  fallbackAddress?: string
): Promise<void> => {
  const profiles = candidate
    ? filterProfilesForCandidate(discovery.profiles, candidate)
    : discovery.profiles;
  const nextAddress =
    discovery.address ?? candidate?.address ?? fallbackAddress;
  const persisted = await persistDiscovery(
    name,
    discovery.categoryId,
    profiles,
    nextAddress
  );
  if (persisted) {
    replace(`/new?id=${encodeURIComponent(persisted)}`);
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
  replace(`/new?${params.toString()}`);
};

const buildFallbackDiscovery = ({
  address,
  categoryId,
  websiteUrl,
  listingUrl,
  facebookUrl,
  instagramUsername,
}: {
  address?: string;
  categoryId: CategoryId;
  websiteUrl?: string;
  listingUrl?: string;
  facebookUrl?: string;
  instagramUsername?: string;
}): DiscoverResponse => ({
  address,
  candidates: [],
  categoryId,
  profiles: [
    websiteUrl ? { title: websiteUrl, type: "website" as const } : null,
    listingUrl
      ? {
          googlePlaceId: listingUrl,
          subtitle: address,
          title: listingUrl,
          type: "google-maps" as const,
        }
      : null,
    facebookUrl ? { title: facebookUrl, type: "facebook" as const } : null,
    instagramUsername
      ? { title: instagramUsername, type: "instagram" as const }
      : null,
  ].filter(
    (profile): profile is NonNullable<typeof profile> => profile !== null
  ),
});

export const DiscoverClient = ({
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
}) => {
  const { replace } = useRouter();
  const [status, setStatus] = useState(
    "Looking for map listings, a website, and social profiles"
  );
  const [result, setResult] = useState<DiscoverResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const discover = async () => {
      setStatus("Looking for map listings, a website, and social profiles");
      try {
        const response = await fetch("/api/discover", {
          body: JSON.stringify({
            address,
            appleMapsId,
            businessName,
            categoryId,
            facebookUrl,
            googlePlaceId,
            instagramUsername,
            listingUrl,
            near,
            websiteUrl,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          if (!cancelled) {
            setStatus("Continuing with the details you entered");
            await waitForMs(SENTENCE_HOLD_MS);
            if (cancelled) {
              return;
            }
            await goToConfirm(
              replace,
              businessName,
              buildFallbackDiscovery({
                address,
                categoryId,
                facebookUrl,
                instagramUsername,
                listingUrl,
                websiteUrl,
              }),
              undefined,
              address
            );
          }
          return;
        }
        const parsed = discoverResponseSchema.parse(await response.json());
        if (cancelled) {
          return;
        }
        setResult(parsed);

        const selectedCandidate =
          parsed.candidates.find(
            (candidate) =>
              googlePlaceId &&
              candidate.source === "google" &&
              candidate.id === googlePlaceId
          ) ??
          parsed.candidates.find(
            (candidate) =>
              appleMapsId &&
              candidate.source === "apple" &&
              candidate.id === appleMapsId
          ) ??
          parsed.candidates[0];
        const preselected = Boolean(googlePlaceId || appleMapsId);
        if (parsed.candidates.length > 1 && !preselected) {
          setStatus("Choose the listing that is yours");
          return;
        }

        await waitForMs(SENTENCE_HOLD_MS);
        if (cancelled) {
          return;
        }
        await goToConfirm(
          replace,
          businessName,
          parsed,
          selectedCandidate,
          address
        );
      } catch {
        if (!cancelled) {
          setStatus("Continuing with the details you entered");
          await waitForMs(SENTENCE_HOLD_MS);
          if (cancelled) {
            return;
          }
          await goToConfirm(
            replace,
            businessName,
            buildFallbackDiscovery({
              address,
              categoryId,
              facebookUrl,
              instagramUsername,
              listingUrl,
              websiteUrl,
            }),
            undefined,
            address
          );
        }
      }
    };

    const runDiscover = async () => {
      await discover();
    };
    runDiscover();
    return () => {
      cancelled = true;
    };
  }, [
    address,
    appleMapsId,
    businessName,
    categoryId,
    facebookUrl,
    googlePlaceId,
    instagramUsername,
    listingUrl,
    near,
    replace,
    websiteUrl,
  ]);

  const chooseCandidate = (candidate: PlaceCandidate) => {
    if (!result) {
      return;
    }
    const typedName = businessName.trim() || candidate.name;
    void goToConfirm(replace, typedName, result, candidate, address);
  };

  const needsChoice = Boolean(
    result && result.candidates.length > 1 && !googlePlaceId && !appleMapsId
  );

  return (
    <div className="vbg-custom-progress">
      <p className="vbg-lede" aria-live="polite">
        {status}.
      </p>
      {needsChoice && result ? (
        <ListingChoices
          candidates={result.candidates}
          onSelect={chooseCandidate}
        />
      ) : null}
    </div>
  );
};
