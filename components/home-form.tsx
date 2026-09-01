"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingChoices } from "@/components/place-search";
import { CATEGORY_CONFIG, categoryIdSchema, getCategoryIdFromGooglePlaceTypes, type CategoryId } from "@/lib/category";
import { lookupResponseSchema, type PlaceCandidate } from "@/lib/discover";

export function HomeForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [category, setCategory] = useState<CategoryId>("other");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = businessName.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      setSearchStatus(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchStatus("Searching listings");
      void fetch(`/api/lookups?source=places&q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Search failed");
          }
          const parsed = lookupResponseSchema.parse(await response.json());
          setCandidates(parsed.candidates);
          setSearchStatus(parsed.candidates.length === 0 ? "No listings found yet" : null);
        })
        .catch((searchError: unknown) => {
          if (searchError instanceof DOMException && searchError.name === "AbortError") {
            return;
          }
          setCandidates([]);
          setSearchStatus("Search skipped");
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [businessName]);

  function selectCandidate(candidate: PlaceCandidate) {
    setSelected(candidate);
    setBusinessName(candidate.name);
    if (candidate.websiteUrl && !websiteUrl.trim()) {
      setWebsiteUrl(candidate.websiteUrl);
    }
    if (candidate.types) {
      setCategory(getCategoryIdFromGooglePlaceTypes(candidate.types));
    }
  }

  return (
    <form
      className="vbg-custom-form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = businessName.trim();
        if (!name) {
          setError("Enter your business name");
          return;
        }
        const params = new URLSearchParams({
          businessName: name,
          categoryId: category,
        });
        if (websiteUrl.trim()) {
          params.set("websiteUrl", websiteUrl.trim());
        }
        if (selected?.source === "google") {
          params.set("googlePlaceId", selected.id);
        }
        if (selected?.source === "apple") {
          params.set("appleMapsId", selected.id);
        }
        router.push(`/discover?${params.toString()}`);
      }}
    >
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="businessName">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          value={businessName}
          onChange={(event) => {
            setBusinessName(event.target.value);
            setSelected(null);
          }}
          autoComplete="organization"
          required
        />
        <p className="vbg-helper">Search Google Maps and Apple Maps, then choose the listing that is yours.</p>
      </div>
      {searchStatus ? <p className="vbg-helper">{searchStatus}</p> : null}
      <ListingChoices candidates={candidates} selected={selected} onSelect={selectCandidate} />
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="websiteUrl">
          Website URL
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://"
        />
        <p className="vbg-helper">Optional. Add it now or on the next screen.</p>
      </div>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="categoryId">
          Business category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          value={category}
          onChange={(event) => setCategory(categoryIdSchema.parse(event.target.value))}
        >
          {Object.values(CATEGORY_CONFIG).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="vbg-error">{error}</p> : null}
      <div className="vbg-custom-actions">
        <button className="vbg-button" type="submit">
          Continue
        </button>
      </div>
    </form>
  );
}
