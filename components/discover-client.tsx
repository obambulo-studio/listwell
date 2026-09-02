"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type CategoryId } from "@/lib/category";
import { discoverResponseSchema } from "@/lib/discover";

export function DiscoverClient({
  businessName,
  websiteUrl,
  categoryId,
  listingUrl,
  address,
  facebookUrl,
  instagramUsername,
}: {
  businessName: string;
  websiteUrl?: string;
  categoryId: CategoryId;
  listingUrl?: string;
  address?: string;
  facebookUrl?: string;
  instagramUsername?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Checking the website for social profiles");

  useEffect(() => {
    let cancelled = false;
    let holdTimer = 0;
    let releaseHold = () => {};
    const sentenceHold = new Promise<void>((resolve) => {
      releaseHold = resolve;
      holdTimer = window.setTimeout(resolve, 1600);
    });

    async function discover() {
      setStatus(websiteUrl ? "Checking the website for social profiles" : "Preparing your audit");
      try {
        const response = await fetch("/api/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName,
            websiteUrl,
            categoryId,
            listingUrl,
            address,
            facebookUrl,
            instagramUsername,
          }),
        });
        if (!response.ok) {
          throw new Error("Could not prepare listings");
        }
        const parsed = discoverResponseSchema.parse(await response.json());
        if (cancelled) return;
        await sentenceHold;
        if (cancelled) return;
        const params = new URLSearchParams({
          businessName,
          categoryId: parsed.categoryId,
          discoveredProfiles: JSON.stringify(parsed.profiles),
        });
        if (parsed.address ?? address) {
          params.set("address", parsed.address ?? address ?? "");
        }
        router.replace(`/new?${params.toString()}`);
      } catch {
        if (!cancelled) {
          setStatus("Continuing with the details you entered");
          await sentenceHold;
          if (cancelled) return;
          const params = new URLSearchParams({
            businessName,
            categoryId,
            discoveredProfiles: JSON.stringify(
              [
                websiteUrl ? { type: "website", title: websiteUrl } : null,
                listingUrl ? { type: "google-maps", title: listingUrl, googlePlaceId: listingUrl, subtitle: address } : null,
                facebookUrl ? { type: "facebook", title: facebookUrl } : null,
                instagramUsername ? { type: "instagram", title: instagramUsername } : null,
              ].filter(Boolean),
            ),
          });
          if (address) params.set("address", address);
          router.replace(`/new?${params.toString()}`);
        }
      }
    }

    void discover();
    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer);
      releaseHold();
    };
  }, [address, businessName, categoryId, facebookUrl, instagramUsername, listingUrl, router, websiteUrl]);

  return (
    <div className="vbg-custom-progress">
      <p className="vbg-lede" aria-live="polite">
        {status}.
      </p>
    </div>
  );
}
