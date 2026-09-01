"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type CategoryId } from "@/lib/category";
import {
  discoverResponseSchema,
  filterProfilesForCandidate,
  type DiscoverResponse,
  type PlaceCandidate,
} from "@/lib/discover";

export function DiscoverClient({
  businessName,
  websiteUrl,
  categoryId,
  googlePlaceId,
  appleMapsId,
}: {
  businessName: string;
  websiteUrl?: string;
  categoryId: CategoryId;
  googlePlaceId?: string;
  appleMapsId?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("Looking for map listings, a website, and social profiles");
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    async function holdSentence() {
      const wait = 700 - (Date.now() - started);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }

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

        await holdSentence();
        if (cancelled) {
          return;
        }
        continueToConfirm(parsed, selectedCandidate);
      } catch {
        if (!cancelled) {
          setError("Search skipped. You can add listings on the next screen.");
          setStatus("Opening the confirm screen");
          await holdSentence();
          if (cancelled) {
            return;
          }
          continueToConfirm(
            {
              categoryId,
              candidates: [],
              profiles: websiteUrl ? [{ type: "website", title: websiteUrl }] : [],
            },
            undefined,
          );
        }
      }
    }

    function continueToConfirm(discovery: DiscoverResponse, candidate: PlaceCandidate | undefined) {
      const profiles = candidate ? filterProfilesForCandidate(discovery.profiles, candidate) : discovery.profiles;
      setStatus("Opening what we found");
      const params = new URLSearchParams({
        businessName,
        categoryId: discovery.categoryId,
        discoveredProfiles: JSON.stringify(profiles),
      });
      router.replace(`/new?${params.toString()}`);
    }

    void discover();
    return () => {
      cancelled = true;
    };
  }, [appleMapsId, businessName, categoryId, googlePlaceId, router, websiteUrl]);

  function chooseCandidate(candidate: PlaceCandidate) {
    if (!result) {
      return;
    }
    const profiles = filterProfilesForCandidate(result.profiles, candidate);
    setStatus("Opening what we found");
    const params = new URLSearchParams({
      businessName: candidate.name,
      categoryId: result.categoryId,
      discoveredProfiles: JSON.stringify(profiles),
    });
    router.replace(`/new?${params.toString()}`);
  }

  const needsChoice = Boolean(result && result.candidates.length > 1 && !googlePlaceId && !appleMapsId);

  return (
    <div className="vbg-custom-progress">
      <p className="vbg-lede" aria-live="polite">
        {status}.
      </p>
      {error ? <p className="vbg-error">{error}</p> : null}
      {needsChoice && result ? (
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-visually-hidden">Map listings to choose from</caption>
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col">Source</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((candidate) => (
                <tr key={`${candidate.source}-${candidate.id}`}>
                  <th scope="row">
                    {candidate.name}
                    {candidate.address ? <div className="vbg-meta">{candidate.address}</div> : null}
                  </th>
                  <td>{candidate.source === "google" ? "Google Maps" : "Apple Maps"}</td>
                  <td>
                    <button className="vbg-button vbg-button-quiet" type="button" onClick={() => chooseCandidate(candidate)}>
                      This one
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
