"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingChoices } from "@/components/place-search";
import { CATEGORY_CONFIG, categoryIdSchema, type CategoryId } from "@/lib/category";
import { lookupResponseSchema, type PlaceCandidate } from "@/lib/discover";

export function HomeForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [locationStatus, setLocationStatus] = useState("Finding your suburb");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [address, setAddress] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [category, setCategory] = useState<CategoryId>("other");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [strongMatchId, setStrongMatchId] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [rejected, setRejected] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Type your suburb or city");
      return;
    }

    const controller = new AbortController();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void fetch(
          `/api/lookups?source=nominatim-reverse&lat=${encodeURIComponent(String(position.coords.latitude))}&lon=${encodeURIComponent(String(position.coords.longitude))}`,
          { signal: controller.signal },
        )
          .then(async (response) => {
            if (!response.ok) throw new Error("Reverse lookup failed");
            const parsed = lookupResponseSchema.parse(await response.json());
            if (parsed.locality) {
              setLocation(parsed.locality);
              setLocationStatus("Change this if the suburb is wrong");
            } else {
              setLocationStatus("Type your suburb or city");
            }
          })
          .catch((lookupError: unknown) => {
            if (lookupError instanceof DOMException && lookupError.name === "AbortError") return;
            setLocationStatus("Type your suburb or city");
          });
      },
      () => {
        setLocationStatus("Location blocked. Type your suburb or city.");
      },
    );

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const trimmed = businessName.trim();
    if (trimmed.length < 2 || rejected) {
      if (!rejected) {
        setCandidates([]);
        setStrongMatchId(null);
        setSearchStatus(null);
      }
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchStatus("Looking up nearby businesses");
      const params = new URLSearchParams({
        source: "places",
        q: trimmed,
      });
      if (location.trim()) params.set("near", location.trim());
      void fetch(`/api/lookups?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search failed");
          const parsed = lookupResponseSchema.parse(await response.json());
          setCandidates(parsed.candidates);
          setStrongMatchId(parsed.strongMatchId ?? null);
          if (parsed.candidates.length === 0) {
            setSearchStatus("No confident match yet");
          } else if (parsed.strongMatchId) {
            setSearchStatus("Is this your business?");
          } else {
            setSearchStatus("Choose the listing that is yours");
          }
        })
        .catch((searchError: unknown) => {
          if (searchError instanceof DOMException && searchError.name === "AbortError") return;
          setCandidates([]);
          setStrongMatchId(null);
          setSearchStatus("Lookup skipped. Add the details you have.");
        });
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [businessName, location, rejected]);

  const showDetails = rejected || (businessName.trim().length >= 2 && searchStatus !== null && candidates.length === 0);
  const strongMatch = strongMatchId ? candidates.find((candidate) => candidate.id === strongMatchId) ?? null : null;
  const showPicker = !rejected && !strongMatch && candidates.length > 1;
  const showSingle = !rejected && Boolean(strongMatch);

  function continueWith(candidate: PlaceCandidate | null, extras?: { websiteUrl?: string; listingUrl?: string; address?: string }) {
    const name = (candidate?.name ?? businessName).trim();
    if (!name) {
      setError("Enter your business name");
      return;
    }
    const params = new URLSearchParams({
      businessName: name,
      categoryId: candidate?.categoryId ?? category,
    });
    const website = extras?.websiteUrl ?? candidate?.websiteUrl ?? websiteUrl.trim();
    if (website) params.set("websiteUrl", website);
    if (candidate?.source === "google") params.set("googlePlaceId", candidate.id);
    if (candidate?.source === "apple") params.set("appleMapsId", candidate.id);
    const listing = extras?.listingUrl ?? listingUrl.trim();
    if (listing) params.set("listingUrl", listing);
    const nextAddress = extras?.address ?? candidate?.address ?? address.trim();
    if (nextAddress) params.set("address", nextAddress);
    if (location.trim()) params.set("near", location.trim());
    if (facebookUrl.trim()) params.set("facebookUrl", facebookUrl.trim());
    if (instagramUsername.trim()) params.set("instagramUsername", instagramUsername.trim());
    router.push(`/discover?${params.toString()}`);
  }

  return (
    <form
      className="vbg-custom-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) {
          continueWith(selected);
          return;
        }
        if (strongMatch && !rejected) {
          continueWith(strongMatch);
          return;
        }
        continueWith(null, {
          websiteUrl: websiteUrl.trim() || undefined,
          listingUrl: listingUrl.trim() || undefined,
          address: address.trim() || undefined,
        });
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
            setRejected(false);
          }}
          autoComplete="organization"
          required
        />
      </div>
      <div className="vbg-field">
        <label className="vbg-label" htmlFor="location">
          Suburb or city
        </label>
        <input
          id="location"
          name="location"
          value={location}
          onChange={(event) => {
            setLocation(event.target.value);
            setSelected(null);
            setRejected(false);
          }}
          autoComplete="address-level2"
          placeholder="South Brisbane"
        />
        <p className="vbg-helper">{locationStatus}</p>
      </div>
      {searchStatus ? (
        <p className="vbg-helper" aria-live="polite">
          {searchStatus}
        </p>
      ) : null}

      {showSingle && strongMatch ? (
        <div className="vbg-custom-choices">
          <ListingChoices
            candidates={[strongMatch]}
            selected={selected ?? strongMatch}
            onSelect={(candidate) => {
              setSelected(candidate);
              if (candidate.websiteUrl && !websiteUrl.trim()) setWebsiteUrl(candidate.websiteUrl);
              if (candidate.address && !address.trim()) setAddress(candidate.address);
              if (candidate.categoryId) setCategory(candidate.categoryId);
            }}
          />
          <div className="vbg-custom-actions">
            <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setRejected(true)}>
              Not this
            </button>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <>
          <ListingChoices
            candidates={candidates}
            selected={selected}
            onSelect={(candidate) => {
              setSelected(candidate);
              if (candidate.websiteUrl && !websiteUrl.trim()) setWebsiteUrl(candidate.websiteUrl);
              if (candidate.address && !address.trim()) setAddress(candidate.address);
              if (candidate.categoryId) setCategory(candidate.categoryId);
            }}
          />
          <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setRejected(true)}>
            None of these
          </button>
        </>
      ) : null}

      {showDetails ? (
        <>
          <p className="vbg-helper">Add the details you have. We will not invent a business listing.</p>
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
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="listingUrl">
              Google listing URL
            </label>
            <input
              id="listingUrl"
              name="listingUrl"
              type="url"
              value={listingUrl}
              onChange={(event) => setListingUrl(event.target.value)}
              placeholder="https://maps.google.com/..."
            />
            <p className="vbg-helper">Optional. Paste the public listing page if you have it.</p>
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="address">
              Address
            </label>
            <input
              id="address"
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="street-address"
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="facebookUrl">
              Facebook page
            </label>
            <input
              id="facebookUrl"
              name="facebookUrl"
              value={facebookUrl}
              onChange={(event) => setFacebookUrl(event.target.value)}
              placeholder="https://facebook.com/..."
            />
          </div>
          <div className="vbg-field">
            <label className="vbg-label" htmlFor="instagramUsername">
              Instagram
            </label>
            <input
              id="instagramUsername"
              name="instagramUsername"
              value={instagramUsername}
              onChange={(event) => setInstagramUsername(event.target.value)}
              placeholder="username"
            />
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
        </>
      ) : null}

      {error ? <p className="vbg-error">{error}</p> : null}
      <div className="vbg-custom-actions">
        <button className="vbg-button" type="submit">
          Continue
        </button>
      </div>
    </form>
  );
}
