"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import useSWR from "swr";

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

const SENTENCE_HOLD_MS = 2000;

interface DiscoverPayload {
  address?: string;
  appleMapsId?: string;
  businessName: string;
  categoryId: CategoryId;
  facebookUrl?: string;
  googlePlaceId?: string;
  instagramUsername?: string;
  listingUrl?: string;
  near?: string;
  websiteUrl?: string;
}

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

const discoverFetcher = async (
  payload: DiscoverPayload
): Promise<DiscoverResponse> => {
  const response = await fetch("/api/discover", {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Discover failed");
  }
  return discoverResponseSchema.parse(await response.json());
};

const pickCandidate = (
  discovery: DiscoverResponse,
  googlePlaceId?: string,
  appleMapsId?: string
): PlaceCandidate | undefined =>
  discovery.candidates.find(
    (candidate) =>
      googlePlaceId &&
      candidate.source === "google" &&
      candidate.id === googlePlaceId
  ) ??
  discovery.candidates.find(
    (candidate) =>
      appleMapsId &&
      candidate.source === "apple" &&
      candidate.id === appleMapsId
  ) ??
  discovery.candidates[0];

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
  const payload: DiscoverPayload = {
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
  };
  const fallback = buildFallbackDiscovery({
    address,
    categoryId,
    facebookUrl,
    instagramUsername,
    listingUrl,
    websiteUrl,
  });
  const preselected = Boolean(googlePlaceId || appleMapsId);
  const cancelledRef = useRef(false);
  const holdTimerRef = useRef(0);
  const continueAfterHold = (
    discovery: DiscoverResponse,
    candidate?: PlaceCandidate
  ) => {
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      if (cancelledRef.current) {
        return;
      }
      void goToConfirm(replace, businessName, discovery, candidate, address);
    }, SENTENCE_HOLD_MS);
  };

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  const { data, error } = useSWR(
    ["discover", payload],
    ([, body]) => discoverFetcher(body),
    {
      onError: () => {
        continueAfterHold(fallback);
      },
      onSuccess: (parsed) => {
        if (parsed.candidates.length > 1 && !preselected) {
          return;
        }
        continueAfterHold(
          parsed,
          pickCandidate(parsed, googlePlaceId, appleMapsId)
        );
      },
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  const result = error ? fallback : (data ?? null);
  const needsChoice = Boolean(
    result && result.candidates.length > 1 && !preselected
  );
  let status = "Looking for map listings, a website, and social profiles";
  if (needsChoice) {
    status = "Choose the listing that is yours";
  } else if (error) {
    status = "Continuing with the details you entered";
  }

  const chooseCandidate = (candidate: PlaceCandidate) => {
    if (!result) {
      return;
    }
    const typedName = businessName.trim() || candidate.name;
    void goToConfirm(replace, typedName, result, candidate, address);
  };

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
