"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/atoms/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CATEGORY_CONFIG } from "@/lib/category";
import { lookupResponseSchema } from "@/lib/discover";
import type { PlaceCandidate } from "@/lib/discover";
import { cn } from "@/lib/utils";

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
    <ul className="mt-2 flex flex-col gap-2">
      {candidates.map((candidate) => {
        const pressed =
          selected?.id === candidate.id && selected.source === candidate.source;
        const categoryLabel = candidate.categoryId
          ? CATEGORY_CONFIG[candidate.categoryId].label
          : null;
        return (
          <li key={`${candidate.source}-${candidate.id}`}>
            <Button
              type="button"
              variant={pressed ? "primary" : "secondary"}
              className={cn(
                "h-auto w-full flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal"
              )}
              aria-pressed={pressed}
              onClick={() => onSelect(candidate)}
            >
              <span className="font-medium">{candidate.name}</span>
              {candidate.address ? (
                <span className="text-muted-foreground text-sm font-normal">
                  {candidate.address}
                </span>
              ) : null}
              <span className="text-muted-foreground text-xs font-normal">
                {[
                  candidate.suburb,
                  categoryLabel,
                  sourceLabel(candidate.source),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Button>
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
      <ListingChoices
        candidates={candidates}
        selected={selected}
        onSelect={(candidate) => {
          setSelected(candidate);
          onSelect(candidate);
        }}
      />
    </Field>
  );
};
