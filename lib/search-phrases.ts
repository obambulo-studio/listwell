import { z } from "zod";

import {
  MAX_SEARCH_PHRASES,
  normalisePhrase,
  reviseSearchPhrases,
} from "./seo-schema";
import type { SearchPhrase } from "./seo-schema";

const WHITESPACE_RUN = /\s+/gu;

const phraseTextSchema = z.string().trim().min(1);

/**
 * Two phrases from the category label and suburb, plus a shorter near-me
 * phrase when the label has more than one word. Wording stays as typed
 * until Jev tidies it on the server.
 */
export const templateSearchPhrases = (
  categoryLabel: string,
  suburb: string
): string[] => {
  const label = categoryLabel.trim().toLowerCase().replace(WHITESPACE_RUN, " ");
  const place = suburb.trim().replace(WHITESPACE_RUN, " ");
  if (!label || !place) {
    return [];
  }
  const phrases = [`${label} ${place}`, `${label} near me`];
  const [head, ...rest] = label.split(" ");
  if (head && rest.length > 0) {
    phrases.push(`${head} near me`);
  }
  return phrases.slice(0, MAX_SEARCH_PHRASES);
};

/** Same words keep the phrase id. A new wording gets a new id. */
export const saveSearchPhraseDraft = (
  current: readonly SearchPhrase[],
  draft: readonly { suggested?: boolean; text: string }[]
): SearchPhrase[] => {
  const next = draft.flatMap((entry) => {
    const parsed = phraseTextSchema.safeParse(entry.text);
    if (!parsed.success) {
      return [];
    }
    return [{ suggested: entry.suggested, text: parsed.data }];
  });
  return reviseSearchPhrases(current, next);
};

export const phrasesAreSuggested = (
  phrases: readonly SearchPhrase[]
): boolean => phrases.some((phrase) => phrase.suggested);

export const acceptedPhraseDraft = (
  phrases: readonly SearchPhrase[]
): { suggested: false; text: string }[] =>
  phrases.map((phrase) => ({
    suggested: false,
    text: phrase.text,
  }));

export const phraseDraftChanged = (
  current: readonly SearchPhrase[],
  draft: readonly string[]
): boolean => {
  if (draft.length !== current.length) {
    return true;
  }
  return draft.some(
    (text, index) =>
      normalisePhrase(text) !== normalisePhrase(current[index]?.text ?? "")
  );
};
