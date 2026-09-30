"use client";

import { useRef, useState } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CATEGORY_CONFIG } from "@/lib/category";
import { lookupResponseSchema } from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";

const SEARCH_DEBOUNCE_MS = 300;

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
    <ul className="listwell-panel__rows" aria-label="Matching listings">
      {candidates.map((candidate) => {
        const pressed =
          selected?.id === candidate.id && selected.source === candidate.source;
        const categoryLabel = candidate.categoryId
          ? CATEGORY_CONFIG[candidate.categoryId].label
          : null;
        return (
          <li key={`${candidate.source}-${candidate.id}`}>
            <button
              type="button"
              className="listwell-panel__row listwell-panel__row--top"
              aria-pressed={pressed}
              onClick={() => onSelect(candidate)}
            >
              <span className="listwell-panel__row-main">
                <span className="listwell-panel__row-title">
                  {candidate.name}
                </span>
                {candidate.address ? (
                  <span className="listwell-panel__row-meta">
                    {candidate.address}
                  </span>
                ) : null}
                <span className="listwell-panel__fine">
                  {[
                    candidate.suburb,
                    categoryLabel,
                    sourceLabel(candidate.source),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {pressed ? (
                <span className="bg-green flex size-5.5 shrink-0 items-center justify-center rounded-full text-white">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              ) : null}
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
  const debounceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      setStatus(null);
      return;
    }

    debounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
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
      void runSearch();
    }, SEARCH_DEBOUNCE_MS);
  };

  return (
    <Field>
      <FieldLabel htmlFor={`${source}-search`}>{label}</FieldLabel>
      <Input
        id={`${source}-search`}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        autoComplete="off"
        placeholder="Search by name"
      />
      {status ? <FieldDescription>{status}</FieldDescription> : null}
      {candidates.length > 0 ? (
        <div className="listwell-panel">
          <ListingChoices
            candidates={candidates}
            selected={selected}
            onSelect={(candidate) => {
              setSelected(candidate);
              onSelect(candidate);
            }}
          />
        </div>
      ) : null}
    </Field>
  );
};
