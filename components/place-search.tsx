"use client";

import { useEffect, useState } from "react";
import { lookupResponseSchema, type PlaceCandidate } from "@/lib/discover";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      setStatus(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("Searching");
      void fetch(`/api/lookups?source=${source}&q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Search failed");
          }
          const parsed = lookupResponseSchema.parse(await response.json());
          setCandidates(parsed.candidates);
          setStatus(parsed.candidates.length === 0 ? "No listings found" : null);
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
      {candidates.length > 0 ? (
        <ul className="vbg-custom-choices">
          {candidates.map((candidate) => (
            <li key={`${candidate.source}-${candidate.id}`}>
              <button
                className="vbg-custom-choice"
                type="button"
                aria-pressed={selectedId === candidate.id}
                onClick={() => {
                  setSelectedId(candidate.id);
                  onSelect(candidate);
                }}
              >
                <span>{candidate.name}</span>
                {candidate.address ? <span className="vbg-meta">{candidate.address}</span> : null}
                <span className="vbg-meta">{candidate.source === "google" ? "Google Maps" : "Apple Maps"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
