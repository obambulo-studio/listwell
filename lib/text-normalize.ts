import type { ChatPhase } from "./chat-onboarding";

const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "for",
  "to",
]);

export const isSkipCommand = (text: string): boolean =>
  text.trim().toLowerCase() === "skip";

const capitalizeSegment = (segment: string): string => {
  if (!segment) {
    return segment;
  }
  const lower = segment.toLowerCase();
  if (lower.startsWith("mc") && lower.length > 2) {
    return `Mc${lower.charAt(2).toUpperCase()}${lower.slice(3)}`;
  }
  if (lower.startsWith("mac") && lower.length > 3) {
    return `Mac${lower.charAt(3).toUpperCase()}${lower.slice(4)}`;
  }
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const capitalizeToken = (token: string): string => {
  const apostropheIndex = token.indexOf("'");
  if (apostropheIndex !== -1) {
    const before = token.slice(0, apostropheIndex);
    const after = token.slice(apostropheIndex);
    return `${capitalizeSegment(before)}${after.toLowerCase()}`;
  }

  if (token.includes("-")) {
    return token
      .split("-")
      .map((part) => capitalizeSegment(part))
      .join("-");
  }

  return capitalizeSegment(token);
};

export const normalizeTitleCase = (
  text: string,
  options?: { smallWords?: boolean }
): string => {
  const smallWords = options?.smallWords ?? false;
  const trimmed = text.trim().replaceAll(/\s+/gu, " ");
  if (!trimmed) {
    return trimmed;
  }

  const words = trimmed.split(" ");
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (smallWords && index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      return capitalizeToken(word);
    })
    .join(" ");
};

export const normalizeLocation = (text: string): string =>
  normalizeTitleCase(text, { smallWords: false });

export const normalizeBusinessName = (text: string): string =>
  normalizeTitleCase(text, { smallWords: true });

export const normalizeCategoryText = (text: string): string =>
  normalizeBusinessName(text);

export const normalizeWebsiteInput = (text: string): string => text.trim();

export type NormalizedChatInput =
  | { kind: "skip"; display: "Skip" }
  | { kind: "text"; value: string };

export const normalizeChatInput = (
  phase: ChatPhase,
  text: string
): NormalizedChatInput | null => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (phase === "website" && isSkipCommand(trimmed)) {
    return { display: "Skip", kind: "skip" };
  }

  switch (phase) {
    case "business_name": {
      return { kind: "text", value: normalizeBusinessName(trimmed) };
    }
    case "location": {
      return { kind: "text", value: normalizeLocation(trimmed) };
    }
    case "category": {
      return { kind: "text", value: normalizeCategoryText(trimmed) };
    }
    case "website": {
      return { kind: "text", value: normalizeWebsiteInput(trimmed) };
    }
    default: {
      return { kind: "text", value: trimmed };
    }
  }
};
