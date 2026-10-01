"use client";

import { useState } from "react";

import { Button } from "@/components/atoms/button";
import { PrimaryButton, QuietButton } from "@/components/listwell/actions";
import { Input } from "@/components/ui/input";
import { businessSchema } from "@/lib/schema";
import {
  acceptedPhraseDraft,
  phraseDraftChanged,
  phrasesAreSuggested,
  saveSearchPhraseDraft,
} from "@/lib/search-phrases";
import type { SearchPhrase } from "@/lib/seo-schema";

const savePhrases = async (
  businessId: string,
  current: readonly SearchPhrase[],
  draft: readonly { suggested?: boolean; text: string }[]
): Promise<SearchPhrase[]> => {
  const phrases = saveSearchPhraseDraft(current, draft);
  const response = await fetch(`/api/businesses/${businessId}/search-phrases`, {
    body: JSON.stringify({ phrases }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error("Could not save these phrases");
  }
  return businessSchema.parse(await response.json()).searchPhrases;
};

/** Owner control for the phrases a continued report checks each month. */
export const SearchPhrasesSection = ({
  businessId,
  phrases,
}: {
  businessId: string;
  phrases: SearchPhrase[];
}) => {
  const [current, setCurrent] = useState(phrases);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(phrases.map((phrase) => phrase.text));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (current.length === 0) {
    return null;
  }

  const persist = async (
    next: readonly { suggested?: boolean; text: string }[]
  ) => {
    setPending(true);
    setError(null);
    try {
      const saved = await savePhrases(businessId, current, next);
      setCurrent(saved);
      setDraft(saved.map((phrase) => phrase.text));
      setEditing(false);
      setPending(false);
    } catch (saveError) {
      setPending(false);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save these phrases"
      );
    }
  };

  return (
    <section className="listwell-panel" aria-labelledby="search-phrases">
      <div className="listwell-panel__head">
        <h2 id="search-phrases" className="listwell-panel__title">
          Search phrases
        </h2>
        {editing ? null : (
          <div className="listwell-panel__actions">
            <QuietButton
              disabled={pending}
              type="button"
              onClick={() => {
                setDraft(current.map((phrase) => phrase.text));
                setEditing(true);
              }}
            >
              Edit
            </QuietButton>
          </div>
        )}
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__text">
          We check these searches each month. Research uses them even if you
          leave the suggestions as they are.
        </p>
        {editing ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {draft.map((text, index) => (
              <li key={current[index]?.id ?? `draft-${index}`}>
                <label
                  className="text-ink-2 text-sm"
                  htmlFor={`phrase-${index}`}
                >
                  Phrase {index + 1}
                </label>
                <Input
                  id={`phrase-${index}`}
                  value={text}
                  onChange={(event) => {
                    const { value } = event.target;
                    setDraft((items) =>
                      items.map((item, itemIndex) =>
                        itemIndex === index ? value : item
                      )
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {current.map((phrase) => (
              <li key={phrase.id} className="text-ink text-sm">
                {phrase.text}
                {phrase.suggested ? (
                  <span className="text-ink-2"> · suggested</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p className="listwell-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="listwell-panel__foot">
        {editing ? (
          <>
            <PrimaryButton
              disabled={pending || !phraseDraftChanged(current, draft)}
              type="button"
              onClick={() => {
                void persist(
                  draft.map((text, index) => ({
                    suggested:
                      text.trim().toLowerCase() ===
                      current[index]?.text.trim().toLowerCase()
                        ? current[index]?.suggested
                        : false,
                    text,
                  }))
                );
              }}
            >
              Save phrases
            </PrimaryButton>
            <Button
              disabled={pending}
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft(current.map((phrase) => phrase.text));
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </>
        ) : null}
        {!editing && phrasesAreSuggested(current) ? (
          <PrimaryButton
            disabled={pending}
            type="button"
            onClick={() => {
              void persist(acceptedPhraseDraft(current));
            }}
          >
            Use these
          </PrimaryButton>
        ) : null}
      </div>
    </section>
  );
};
