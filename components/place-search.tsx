"use client";

import { CATEGORY_CONFIG } from "@/lib/category";
import type { PlaceCandidate } from "@/lib/discover";

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
