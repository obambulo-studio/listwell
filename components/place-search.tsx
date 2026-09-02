"use client";

import { useEffect, useState } from "react";
import { CATEGORY_CONFIG } from "@/lib/category";
import { lookupResponseSchema, type PlaceCandidate } from "@/lib/discover";

function sourceLabel(source: PlaceCandidate["source"]): string {
  if (source === "osm") return "OpenStreetMap";
  if (source === "google") return "Google Maps";
  return "Apple Maps";
}

export function ListingChoices({
  candidates,
  selected,
  onSelect,
}: {
  candidates: PlaceCandidate[];
  selected?: PlaceCandidate | null;
  onSelect: (candidate: PlaceCandidate) => void;
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <ul className="vbg-custom-choices">
      {candidates.map((candidate) => {
        const pressed = selected?.id === candidate.id && selected.source === candidate.source;
        const categoryLabel = candidate.categoryId ? CATEGORY_CONFIG[candidate.categoryId].label : null;
        return (
          <li key={`${candidate.source}-${candidate.id}`}>
            <button className="vbg-custom-choice" type="button" aria-pressed={pressed} onClick={() => onSelect(candidate)}>
              <span>{candidate.name}</span>
              {candidate.address ? <span className="vbg-meta">{candidate.address}</span> : null}
              <span className="vbg-meta">
                {[candidate.suburb, categoryLabel, sourceLabel(candidate.source)].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PlaceSearch({
  source,
  label,
  onSelect,
}: {
  source: "google-search" | "apple-search" | "places";
  label: string;
  onSelect: (candidate: PlaceCandidate) => void;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      setStatus(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("Searching listings");
      void fetch(`/api/lookups?source=${source}&q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Search failed");
          }
          const parsed = lookupResponseSchema.parse(await response.json());
          setCandidates(parsed.candidates);
          setStatus(parsed.candidates.length === 0 ? "No listings found yet" : null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setCandidates([]);
          setStatus("Search skipped");
        });
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
        onChange={(event) => setQuery(event.target.value)}
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
}
