import type {
  GoogleSearchResult,
  SocialSearchHit,
} from "@listwell/audit-engine";
import { z } from "zod";

import { CATEGORY_CONFIG } from "./category";
import type { CategoryId } from "./category";
import type { ChatDraft, ChatPhase } from "./chat-onboarding";
import type { PlaceCandidate } from "./discover";
import {
  getTypeSafeConfig,
  parseChoiceAnswer,
  parseNoulAnswer,
  parseScoreAnswer,
  systemOne,
} from "./typesafe";
import type {
  SystemOneResponse,
  TypeSafeConfig,
  TypeSafeQuestion,
} from "./typesafe";

const LISTING_CHOICE_CONFIDENCE_MIN = 0.65;
const LISTING_NONE_NOUL_MAX = 0.45;
const LISTING_SAME_SCORE_MIN = 1.5;
const SOCIAL_SCORE_MIN = 1.5;
const SOCIAL_CONFIDENCE_MIN = 0.6;
const INTERPRET_CONFIDENCE_MIN = 0.55;
const CATEGORY_CONFIDENCE_MIN = 0.55;

export const listingOptionLabel = (candidate: PlaceCandidate): string => {
  const locality =
    candidate.suburb ??
    candidate.address?.split(",")[0]?.trim() ??
    candidate.source;
  return `${candidate.name} (${locality})`;
};

export const findListingCandidateByOption = (
  candidates: PlaceCandidate[],
  optionLabel: string
): PlaceCandidate | null => {
  if (optionLabel === "None of these") {
    return null;
  }
  const shortlist = candidates.slice(0, 4);
  return (
    shortlist.find((item) => listingOptionLabel(item) === optionLabel) ?? null
  );
};

const listingChoiceCriteria = (
  candidates: PlaceCandidate[]
): Record<string, string | null> => {
  const criteria: Record<string, string | null> = {
    none: "No candidate matches",
  };
  for (const candidate of candidates) {
    criteria[candidate.id] = [
      candidate.name,
      candidate.address,
      candidate.source,
      candidate.websiteUrl,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return criteria;
};

const listingStrongMatchFromResponse = (
  response: SystemOneResponse,
  candidateIds: Set<string>
): string | undefined => {
  const choice = parseChoiceAnswer(response, "listing_match");
  const noneOfThese = parseNoulAnswer(response, "none_of_these");
  const samePlace = parseScoreAnswer(response, "same_place");
  if (!choice || !noneOfThese || !samePlace) {
    return undefined;
  }
  if (choice.choice === "none" || !candidateIds.has(choice.choice)) {
    return undefined;
  }
  if (choice.confidence < LISTING_CHOICE_CONFIDENCE_MIN) {
    return undefined;
  }
  if (noneOfThese.noul > LISTING_NONE_NOUL_MAX) {
    return undefined;
  }
  if (samePlace.score < LISTING_SAME_SCORE_MIN) {
    return undefined;
  }
  return choice.choice;
};

export const jevRefineListingCandidates = async (input: {
  businessName: string;
  near?: string;
  candidates: PlaceCandidate[];
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<{ candidates: PlaceCandidate[]; strongMatchId?: string }> => {
  const shortlist = input.candidates.slice(0, 4);
  if (shortlist.length === 0) {
    return { candidates: input.candidates };
  }

  const config = input.config ?? (await getTypeSafeConfig());
  if (!config) {
    return { candidates: input.candidates };
  }

  const questions: TypeSafeQuestion = {
    listing_match: {
      criteria: listingChoiceCriteria(shortlist),
      instructions:
        "Which listing is the business the user searched for? Use `query.name` and `query.near`.",
      type: "choice",
    },
    none_of_these: {
      instructions:
        "Is it true that none of the candidates in `candidates` is the searched business?",
      type: "noul",
    },
    same_place: {
      criteria: [
        "Different business or wrong area",
        "Related chain or ambiguous match",
        "Same business at the queried location",
      ],
      instructions:
        "How well does the highest-confidence listing candidate match the query?",
      type: "score",
    },
  };

  const response = await systemOne({
    config,
    fetchImpl: input.fetchImpl,
    questions,
    state: {
      candidates: shortlist.map((item) => ({
        address: item.address,
        id: item.id,
        name: item.name,
        source: item.source,
        websiteUrl: item.websiteUrl,
      })),
      query: { name: input.businessName, near: input.near ?? "" },
    },
  });

  if (!response) {
    return { candidates: input.candidates };
  }

  const candidateIds = new Set(shortlist.map((item) => item.id));
  const strongMatchId = listingStrongMatchFromResponse(response, candidateIds);
  if (!strongMatchId) {
    return { candidates: input.candidates };
  }

  const winner = shortlist.find((item) => item.id === strongMatchId);
  if (!winner) {
    return { candidates: input.candidates };
  }

  const rest = input.candidates.filter((item) => item.id !== strongMatchId);
  return {
    candidates: [winner, ...rest],
    strongMatchId,
  };
};

export const jevPickSocialHit = async (input: {
  businessName: string;
  near?: string;
  platform: string;
  hits: SocialSearchHit[];
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<SocialSearchHit | null> => {
  const shortlist = input.hits.filter((hit) => hit.score >= 0.7).slice(0, 5);
  if (shortlist.length === 0) {
    return null;
  }

  const config = input.config ?? (await getTypeSafeConfig());
  if (!config) {
    return shortlist[0] ?? null;
  }

  const criteria: Record<string, string | null> = {
    none: "No hit is official",
  };
  for (const [index, hit] of shortlist.entries()) {
    criteria[`hit_${index}`] = [hit.title, hit.url, hit.username]
      .filter(Boolean)
      .join(" · ");
  }

  const response = await systemOne({
    config,
    fetchImpl: input.fetchImpl,
    questions: {
      official_profile: {
        criteria,
        instructions: `Which search hit is the official ${input.platform} profile for the business in query?`,
        type: "choice",
      },
      profile_fit: {
        criteria: [
          "Unrelated or wrong business",
          "Same name elsewhere",
          "Official profile for this business",
        ],
        instructions: "How well does the best hit match the queried business?",
        type: "score",
      },
      refers_to_business: {
        instructions:
          "Does the chosen profile title or username refer to this business name and area?",
        type: "noul",
      },
    },
    state: {
      hits: shortlist,
      platform: input.platform,
      query: { name: input.businessName, near: input.near ?? "" },
    },
  });

  if (!response) {
    return shortlist[0] ?? null;
  }

  const choice = parseChoiceAnswer(response, "official_profile");
  const fit = parseScoreAnswer(response, "profile_fit");
  if (!choice || !fit) {
    return shortlist[0] ?? null;
  }
  if (choice.choice === "none" || choice.confidence < SOCIAL_CONFIDENCE_MIN) {
    return null;
  }
  if (fit.score < SOCIAL_SCORE_MIN) {
    return null;
  }

  const indexMatch = /^hit_(?<index>\d+)$/u.exec(choice.choice);
  if (!indexMatch) {
    return null;
  }
  const index = Number(indexMatch.groups?.index);
  return shortlist[index] ?? null;
};

export const jevPickWebsiteFromSearch = async (input: {
  businessName: string;
  near?: string;
  results: GoogleSearchResult[];
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> => {
  const shortlist = input.results.slice(0, 5);
  if (shortlist.length === 0) {
    return undefined;
  }

  const config = input.config ?? (await getTypeSafeConfig());
  if (!config) {
    const fallback = shortlist.find((result) =>
      result.title.toLowerCase().includes(input.businessName.toLowerCase())
    );
    return fallback?.link;
  }

  const criteria: Record<string, string | null> = {
    none: "No result is the site",
  };
  for (const [index, result] of shortlist.entries()) {
    criteria[`result_${index}`] = `${result.title} · ${result.link}`;
  }

  const response = await systemOne({
    config,
    fetchImpl: input.fetchImpl,
    questions: {
      website_fit: {
        criteria: [
          "Unrelated site",
          "Directory or social page",
          "Official business website",
        ],
        instructions:
          "How well does the best result match the business website?",
        type: "score",
      },
      website_result: {
        criteria,
        instructions:
          "Which search result is the business's official website for query?",
        type: "choice",
      },
    },
    state: {
      query: { name: input.businessName, near: input.near ?? "" },
      results: shortlist,
    },
  });

  if (!response) {
    return undefined;
  }

  const choice = parseChoiceAnswer(response, "website_result");
  const fit = parseScoreAnswer(response, "website_fit");
  if (!choice || !fit || choice.choice === "none") {
    return undefined;
  }
  if (
    choice.confidence < SOCIAL_CONFIDENCE_MIN ||
    fit.score < SOCIAL_SCORE_MIN
  ) {
    return undefined;
  }
  const indexMatch = /^result_(?<index>\d+)$/u.exec(choice.choice);
  if (!indexMatch) {
    return undefined;
  }
  const index = Number(indexMatch.groups?.index);
  return shortlist[index]?.link;
};

export const chatInterpretIntentSchema = z.enum([
  "business_name",
  "location",
  "name_and_location",
  "website_url",
  "skip",
  "category",
  "other",
]);

export type ChatInterpretIntent = z.infer<typeof chatInterpretIntentSchema>;

export const interpretResponseSchema = z.object({
  businessName: z.string().optional(),
  categoryText: z.string().optional(),
  intent: chatInterpretIntentSchema.or(z.literal("other")),
  location: z.string().optional(),
  skipWebsite: z.boolean(),
  websiteUrl: z.string().optional(),
});

export interface ChatInterpretResult {
  intent: ChatInterpretIntent;
  businessName?: string;
  location?: string;
  websiteUrl?: string;
  categoryText?: string;
  skipWebsite: boolean;
}

const splitNameAndLocation = (
  text: string
): { businessName: string; location: string } | null => {
  const commaParts = text.split(",").map((part) => part.trim());
  if (commaParts.length >= 2 && commaParts[0] && commaParts[1]) {
    return {
      businessName: commaParts[0],
      location: commaParts.slice(1).join(", "),
    };
  }
  const inMatch = /\s+in\s+/iu.exec(text);
  if (inMatch && inMatch.index > 0) {
    const businessName = text.slice(0, inMatch.index).trim();
    const location = text.slice(inMatch.index + inMatch[0].length).trim();
    if (businessName && location) {
      return { businessName, location };
    }
  }
  return null;
};

export const interpretChatInputWithJev = async (input: {
  phase: ChatPhase;
  text: string;
  draft: ChatDraft;
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<ChatInterpretResult | null> => {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return null;
  }

  const config = input.config ?? (await getTypeSafeConfig());
  if (!config) {
    return null;
  }

  const response = await systemOne({
    config,
    fetchImpl: input.fetchImpl,
    questions: {
      intent: {
        criteria: {
          business_name: "User gave only a business name",
          category: "User describes business type or category",
          location: "User gave only a suburb or city",
          name_and_location: "User gave business name and location together",
          other: "Does not fit onboarding fields",
          skip: "User wants to skip the current step",
          website_url: "User pasted a website URL",
        },
        instructions: `What did the user mean in phase \`${input.phase}\`?`,
        type: "choice",
      },
      skip_website: {
        instructions:
          "Does the user want to skip providing a website (e.g. skip, no website)?",
        type: "noul",
      },
    },
    state: {
      draft: {
        businessName: input.draft.businessName,
        categoryId: input.draft.categoryId,
        location: input.draft.location,
      },
      phase: input.phase,
      text: trimmed,
    },
  });

  if (!response) {
    return null;
  }

  const intentAnswer = parseChoiceAnswer(response, "intent");
  const skipAnswer = parseNoulAnswer(response, "skip_website");
  if (!intentAnswer) {
    return null;
  }
  if (intentAnswer.confidence < INTERPRET_CONFIDENCE_MIN) {
    return null;
  }

  const intentParsed = chatInterpretIntentSchema.safeParse(intentAnswer.choice);
  if (!intentParsed.success) {
    return null;
  }

  const skipWebsite = (skipAnswer?.noul ?? 0) >= 0.55;
  const result: ChatInterpretResult = {
    intent: intentParsed.data,
    skipWebsite,
  };

  switch (intentParsed.data) {
    case "business_name": {
      result.businessName = trimmed;
      break;
    }
    case "location": {
      result.location = trimmed;
      break;
    }
    case "name_and_location": {
      const split = splitNameAndLocation(trimmed);
      if (split) {
        result.businessName = split.businessName;
        result.location = split.location;
      }
      break;
    }
    case "website_url": {
      result.websiteUrl = trimmed;
      break;
    }
    case "category": {
      result.categoryText = trimmed;
      break;
    }
    default: {
      break;
    }
  }

  return result;
};

export const categoryFromInputWithJev = async (input: {
  text: string;
  config?: TypeSafeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<{ categoryId: CategoryId; displayLabel: string } | null> => {
  const trimmed = input.text.trim();
  if (!trimmed) {
    return null;
  }

  const config = input.config ?? (await getTypeSafeConfig());
  if (!config) {
    return null;
  }

  const criteria: Record<string, string | null> = {};
  for (const [id, entry] of Object.entries(CATEGORY_CONFIG)) {
    criteria[id] = entry.description;
  }

  const response = await systemOne({
    config,
    fetchImpl: input.fetchImpl,
    questions: {
      category: {
        criteria,
        instructions: `Which Listwell category best describes: ${trimmed}`,
        type: "choice",
      },
    },
    state: { text: trimmed },
  });

  if (!response) {
    return null;
  }

  const choice = parseChoiceAnswer(response, "category");
  if (!choice || choice.confidence < CATEGORY_CONFIDENCE_MIN) {
    return null;
  }

  const categoryParsed = z
    .enum(["food", "retail", "services", "other"])
    .safeParse(choice.choice);
  if (!categoryParsed.success) {
    return null;
  }

  return {
    categoryId: categoryParsed.data,
    displayLabel: CATEGORY_CONFIG[categoryParsed.data].label,
  };
};
