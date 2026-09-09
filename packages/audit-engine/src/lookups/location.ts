import type { LocationParts } from "../types";

const STATE_CODES = new Set([
  "QLD",
  "NSW",
  "VIC",
  "ACT",
  "SA",
  "TAS",
  "WA",
  "NT",
]);

const stateCodeFromPart = (part: string): string | null => {
  const tokenUppers = new Set(
    part.split(/\s+/u).map((token) => token.toUpperCase())
  );
  for (const code of STATE_CODES) {
    if (tokenUppers.has(code)) {
      return code;
    }
  }
  return null;
};

const letterParts = (parts: string[]): string[] => {
  const locationParts: string[] = [];
  for (const part of parts) {
    const cleaned = part.replaceAll(/\d+/gu, "").trim();
    if (cleaned.length > 1 && /[a-zA-Z]/u.test(cleaned)) {
      locationParts.push(cleaned);
    }
  }
  return locationParts;
};

export const locationPartsFromAddress = (
  address: string | null | undefined
): LocationParts => {
  if (!address || address.trim().length === 0) {
    return {
      city: null,
      country: null,
      locationParts: [],
      state: null,
      suburb: null,
    };
  }

  const parts: string[] = [];
  for (const part of address.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
  }

  let suburb: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (const [index, part] of parts.entries()) {
    const code = stateCodeFromPart(part);
    if (code && !state) {
      state = code;
    }

    const withoutPostcode = part
      .replaceAll(/\b\d{4}\b/gu, "")
      .replace(/\bAustralia\b/iu, "")
      .trim();
    if (/australia/iu.test(part)) {
      country = "Australia";
    }
    if (!withoutPostcode) {
      continue;
    }

    if (!suburb && index >= 1) {
      suburb =
        withoutPostcode
          .replace(/\b(?<state>QLD|NSW|VIC|ACT|SA|TAS|WA|NT)\b/iu, "")
          .trim() || withoutPostcode;
    } else if (!city && suburb && withoutPostcode !== suburb) {
      city = withoutPostcode;
    }
  }

  if (suburb && /^(?<state>QLD|NSW|VIC|ACT|SA|TAS|WA|NT)$/iu.test(suburb)) {
    state = suburb.toUpperCase();
    suburb = null;
  }

  return { city, country, locationParts: letterParts(parts), state, suburb };
};
