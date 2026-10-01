import { categoryDisplayLabel } from "./category";
import { getBusiness, setBusinessSearchPhrases } from "./data";
import { suburbFromBusiness } from "./persist-place-pin";
import { templateSearchPhrases } from "./search-phrases";
import { reviseSearchPhrases } from "./seo-schema";
import type { SearchPhrase } from "./seo-schema";
import { getTypeSafeConfig, parseChoiceAnswer, systemOne } from "./typesafe";
import type { TypeSafeConfig } from "./typesafe";

const TIDY_CONFIDENCE_MIN = 0.55;

const tidyCandidates = (phrase: string, suburb: string): string[] => {
  const place = suburb.trim();
  const nearMe = " near me";
  if (phrase.endsWith(nearMe)) {
    const label = phrase.slice(0, -nearMe.length);
    return [phrase, `${label}s near me`];
  }
  const suffix = ` ${place}`;
  if (place && phrase.toLowerCase().endsWith(suffix.toLowerCase())) {
    const label = phrase.slice(0, -suffix.length);
    return [phrase, `${label} in ${place}`, `${label} near ${place}`];
  }
  return [phrase];
};

const tidyPhrase = async (
  phrase: string,
  suburb: string,
  config: TypeSafeConfig,
  fetchImpl?: typeof fetch
): Promise<string> => {
  const candidates = tidyCandidates(phrase, suburb);
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) {
    criteria[candidate] = candidate;
  }
  const response = await systemOne({
    config,
    fetchImpl,
    questions: {
      search_phrase: {
        criteria,
        instructions:
          "Which wording would a customer in Australia type into Google for this local business? Keep the suburb when it is part of the phrase.",
        type: "choice",
      },
    },
    state: { phrase, suburb },
  });
  if (!response) {
    return phrase;
  }
  const choice = parseChoiceAnswer(response, "search_phrase");
  if (!choice || choice.confidence < TIDY_CONFIDENCE_MIN) {
    return phrase;
  }
  return criteria[choice.choice] ? choice.choice : phrase;
};

/** Template phrases, with Jev tidying each one when a TypeSafe key is set. */
export const suggestSearchPhrases = async (input: {
  categoryLabel: string;
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
  suburb: string;
}): Promise<SearchPhrase[]> => {
  const template = templateSearchPhrases(input.categoryLabel, input.suburb);
  const config =
    input.config === undefined ? await getTypeSafeConfig() : input.config;
  const texts = await Promise.all(
    template.map((phrase) =>
      config
        ? tidyPhrase(phrase, input.suburb, config, input.fetchImpl)
        : Promise.resolve(phrase)
    )
  );
  return reviseSearchPhrases(
    [],
    texts.map((text) => ({ suggested: true, text }))
  );
};

/** Saves suggestions once, after monthly or yearly checkout. Owner edits win. */
export const ensureSuggestedSearchPhrases = async (
  businessId: string
): Promise<void> => {
  const business = await getBusiness(businessId);
  if (!business || business.searchPhrases.length > 0) {
    return;
  }
  const suburb = suburbFromBusiness(business);
  if (!suburb) {
    return;
  }
  const phrases = await suggestSearchPhrases({
    categoryLabel: categoryDisplayLabel(
      business.category,
      business.categoryLabel
    ),
    suburb,
  });
  if (phrases.length === 0) {
    return;
  }
  await setBusinessSearchPhrases(businessId, phrases);
};
