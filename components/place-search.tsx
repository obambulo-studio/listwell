"use client";

import { useEffect, useState } from "react";

import { CATEGORY_CONFIG } from "@/lib/category";
import { lookupResponseSchema } from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";

const sourceLabel = (source: PlaceCandidate["source"]): string => {
  if (source === "osm") {
    return "OpenStreetMap";
  }
  if (source === "google") {
    return "Google Maps";
  }
  return "Apple Maps";
};

export const ListingChoices = ({
  candidates,
  selected,
  onSelect,
}: {
  candidates: PlaceCandidate[];
  selected?: PlaceCandidate | null;
  onSelect: (candidate: PlaceCandidate) => void;
}) => {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <ul className="vbg-custom-choices">
      {candidates.map((candidate) => {
        const pressed =
          selected?.id === candidate.id && selected.source === candidate.source;
        const categoryLabel = candidate.categoryId
          ? CATEGORY_CONFIG[candidate.categoryId].label
          : null;
        return (
          <li key={`${candidate.source}-${candidate.id}`}>
            <button
              className="vbg-custom-choice"
              type="button"
              aria-pressed={pressed}
              onClick={() => onSelect(candidate)}
            >
              <span>{candidate.name}</span>
              {candidate.address ? (
                <span className="vbg-meta">{candidate.address}</span>
              ) : null}
              <span className="vbg-meta">
                {[
                  candidate.suburb,
                  categoryLabel,
                  sourceLabel(candidate.source),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export const PlaceSearch = ({
  source,
  label,
  onSelect,
}: {
  source: "google-search" | "apple-search" | "places";
  label: string;
  onSelect: (candidate: PlaceCandidate) => void;
}) => {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setCandidates([]);
      setStatus(null);
    }
  };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const runSearch = async () => {
        setStatus("Searching listings");
        try {
          const response = await fetch(
            `/api/lookups?source=${source}&q=${encodeURIComponent(trimmed)}`,
            {
              signal: controller.signal,
            }
          );
          if (!response.ok) {
            setCandidates([]);
            setStatus("Search skipped");
            return;
          }
          const parsed = lookupResponseSchema.parse(await response.json());
          setCandidates(parsed.candidates);
          setStatus(
            parsed.candidates.length === 0 ? "No listings found yet" : null
          );
        } catch (searchError: unknown) {
          if (
            searchError instanceof DOMException &&
            searchError.name === "AbortError"
          ) {
            return;
          }
          setCandidates([]);
          setStatus("Search skipped");
        }
      };
      runSearch();
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, source]);

  return (
    <div className="vbg-field">
      <label className="vbg-label" htmlFor={`${source}-search`}>
        {label}
      </label>
      <input
        id={`${source}-search`}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        autoComplete="off"
        placeholder="Search by name"
      />
      {status ? <p className="vbg-helper">{status}</p> : null}
      <ListingChoices
        candidates={candidates}
        selected={selected}
        onSelect={(candidate) => {
          setSelected(candidate);
          onSelect(candidate);
        }}
      />
    </div>
  );
};
