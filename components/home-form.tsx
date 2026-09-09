"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ListingChoices } from "@/components/place-search";
import { CATEGORY_CONFIG, categoryIdSchema } from "@/lib/category";
import type { CategoryId } from "@/lib/category";
import { lookupResponseSchema } from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";

const initialLocationStatus = (): string => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "Type your suburb or city";
  }
  return "Finding your suburb";
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const appendCandidateParams = (
  params: URLSearchParams,
  candidate: PlaceCandidate | null,
  extras?: { websiteUrl?: string; listingUrl?: string; address?: string }
) => {
  const website = extras?.websiteUrl ?? candidate?.websiteUrl ?? undefined;
  if (website) {
    params.set("websiteUrl", website);
  }
  if (candidate?.source === "google") {
    params.set("googlePlaceId", candidate.id);
  }
  if (candidate?.source === "apple") {
    params.set("appleMapsId", candidate.id);
  }
  const listing = extras?.listingUrl ?? undefined;
  if (listing) {
    params.set("listingUrl", listing);
  }
  const nextAddress = extras?.address ?? candidate?.address ?? undefined;
  if (nextAddress) {
    params.set("address", nextAddress);
  }
};

export const HomeForm = () => {
  const { push } = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [location, setLocation] = useState("");
  const [locationStatus, setLocationStatus] = useState(initialLocationStatus);
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
      return;
    }

    const controller = new AbortController();

    const loadLocality = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(
          `/api/lookups?source=nominatim-reverse&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setLocationStatus("Type your suburb or city");
          return;
        }
        const parsed = lookupResponseSchema.parse(await response.json());
        if (parsed.locality) {
          setLocation(parsed.locality);
          setLocationStatus("Change this if the suburb is wrong");
          return;
        }
        setLocationStatus("Type your suburb or city");
      } catch (lookupError: unknown) {
        if (isAbortError(lookupError)) {
          return;
        }
        setLocationStatus("Type your suburb or city");
      }
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadLocality(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationStatus("Location blocked. Type your suburb or city.");
      }
    );

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const trimmed = businessName.trim();
    if (trimmed.length < 2 || rejected) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const searchBusinesses = async () => {
        setSearchStatus("Looking up nearby businesses");
        const params = new URLSearchParams({
          q: trimmed,
          source: "places",
        });
        if (location.trim()) {
          params.set("near", location.trim());
        }
        try {
          const response = await fetch(`/api/lookups?${params}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            setCandidates([]);
            setStrongMatchId(null);
            setSearchStatus("Lookup skipped. Add the details you have.");
            return;
          }
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
        } catch (searchError: unknown) {
          if (isAbortError(searchError)) {
            return;
          }
          setCandidates([]);
          setStrongMatchId(null);
          setSearchStatus("Lookup skipped. Add the details you have.");
        }
      };
      searchBusinesses();
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [businessName, location, rejected]);

  const resetLookupState = () => {
    setCandidates([]);
    setStrongMatchId(null);
    setSearchStatus(null);
  };

  const showDetails =
    rejected ||
    (businessName.trim().length >= 2 &&
      searchStatus !== null &&
      candidates.length === 0);
  const strongMatch = strongMatchId
    ? (candidates.find((candidate) => candidate.id === strongMatchId) ?? null)
    : null;
  const showPicker = !rejected && !strongMatch && candidates.length > 1;
  const showSingle = !rejected && Boolean(strongMatch);

  const continueWith = (
    candidate: PlaceCandidate | null,
    extras?: { websiteUrl?: string; listingUrl?: string; address?: string }
  ) => {
    const typedName = businessName.trim();
    const name = typedName || (candidate?.name ?? "").trim();
    if (!name) {
      setError("Enter your business name");
      return;
    }
    const params = new URLSearchParams({
      businessName: name,
      categoryId: candidate?.categoryId ?? category,
    });
    appendCandidateParams(params, candidate, extras);
    if (location.trim()) {
      params.set("near", location.trim());
    }
    if (facebookUrl.trim()) {
      params.set("facebookUrl", facebookUrl.trim());
    }
    if (instagramUsername.trim()) {
      params.set("instagramUsername", instagramUsername.trim());
    }
    push(`/discover?${params.toString()}`);
  };

  const applyCandidateSelection = (candidate: PlaceCandidate) => {
    setSelected(candidate);
    if (candidate.websiteUrl && !websiteUrl.trim()) {
      setWebsiteUrl(candidate.websiteUrl);
    }
    if (candidate.address && !address.trim()) {
      setAddress(candidate.address);
    }
    if (candidate.categoryId) {
      setCategory(candidate.categoryId);
    }
  };

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
          address: address.trim() || undefined,
          listingUrl: listingUrl.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
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
            const next = event.target.value;
            setBusinessName(next);
            setSelected(null);
            setRejected(false);
            if (next.trim().length < 2) {
              resetLookupState();
            }
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
            onSelect={applyCandidateSelection}
          />
          <div className="vbg-custom-actions">
            <button
              className="vbg-button vbg-button-quiet"
              type="button"
              onClick={() => setRejected(true)}
            >
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
            onSelect={applyCandidateSelection}
          />
          <button
            className="vbg-button vbg-button-quiet"
            type="button"
            onClick={() => setRejected(true)}
          >
            None of these
          </button>
        </>
      ) : null}

      {showDetails ? (
        <>
          <p className="vbg-helper">
            Add the details you have. We will not invent a business listing.
          </p>
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
            <p className="vbg-helper">
              Optional. Paste the public listing page if you have it.
            </p>
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
              onChange={(event) =>
                setCategory(categoryIdSchema.parse(event.target.value))
              }
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
          Find this business
        </button>
      </div>
    </form>
  );
};
