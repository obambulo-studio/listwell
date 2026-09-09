import { fetchErrorResult, noWebsiteResult } from "../context";
import type { CheckContext } from "../context";
import { locationPartsFromPlace } from "../lookups/google-places";
import { locationPartsFromAddress } from "../lookups/location";
import { checkResult } from "../schemas";
import type { CheckResult } from "../types";

const STATE_MAPPING: Record<string, string[]> = {
  ACT: ["australian capital territory", "canberra"],
  NSW: ["new south wales"],
  NT: ["northern territory"],
  QLD: ["queensland"],
  SA: ["south australia"],
  TAS: ["tasmania"],
  VIC: ["victoria"],
  WA: ["western australia"],
};

type LocationParts = ReturnType<typeof locationPartsFromPlace>;

const PUNCTUATION_PATTERN = /[.,/#!$%^&*;:{}=\-_`~()]/gu;
const WHITESPACE_PATTERN = /\s+/gu;
const WORD_SPLIT_PATTERN = /\s+/gu;
const STATE_CODE_PATTERN = /^[A-Z]+$/u;

const containsToken = (haystack: string, needle: string): boolean =>
  needle.length > 0 && haystack.split(needle).length > 1;

interface TitleContext {
  businessName: string;
  normalizedTitle: string;
  title: string;
  titleLower: string;
  titleWordSet: Set<string>;
}

const buildTitleContext = (
  title: string,
  businessName: string
): TitleContext => {
  const titleLower = title.toLowerCase();
  const normalizedTitle = titleLower
    .replaceAll(PUNCTUATION_PATTERN, " ")
    .replaceAll(WHITESPACE_PATTERN, " ")
    .trim();
  return {
    businessName,
    normalizedTitle,
    title,
    titleLower,
    titleWordSet: new Set(
      normalizedTitle
        .split(WORD_SPLIT_PATTERN)
        .filter((word) => word.length > 2)
    ),
  };
};

const matchStateCode = (
  locationValue: string,
  normalizedTitle: string,
  matchedLocations: string[]
): boolean => {
  if (locationValue.length > 3 || !STATE_CODE_PATTERN.test(locationValue)) {
    return false;
  }
  const altNames = STATE_MAPPING[locationValue];
  if (!altNames) {
    return false;
  }
  const altNameSet = new Set(altNames);
  for (const altName of altNameSet) {
    if (!containsToken(normalizedTitle, altName)) {
      continue;
    }
    matchedLocations.push(`${locationValue} (as ${altName})`);
    return true;
  }
  return false;
};

const matchLocationValue = (
  locationValue: string | null,
  titleContext: TitleContext,
  matchedLocations: string[]
): boolean => {
  if (!locationValue) {
    return false;
  }
  const { normalizedTitle, titleWordSet } = titleContext;
  const locLower = locationValue.toLowerCase();
  if (normalizedTitle.includes(locLower)) {
    matchedLocations.push(locationValue);
    return true;
  }

  const locWords = locLower
    .split(WORD_SPLIT_PATTERN)
    .filter((word) => word.length > 2);
  if (locWords.length > 1 && locWords.every((word) => titleWordSet.has(word))) {
    matchedLocations.push(`${locationValue} (word match)`);
    return true;
  }
  if (locWords.length === 1 && locWords[0] && titleWordSet.has(locWords[0])) {
    matchedLocations.push(`${locationValue} (exact word)`);
    return true;
  }

  return matchStateCode(locationValue, normalizedTitle, matchedLocations);
};

const collectLocationWords = (locationInfo: LocationParts): Set<string> => {
  const words = new Set<string>();
  const addWords = (value: string | null) => {
    if (!value) {
      return;
    }
    for (const word of value
      .toLowerCase()
      .split(WORD_SPLIT_PATTERN)
      .filter((part) => part.length > 3)) {
      words.add(word);
    }
  };

  for (const part of locationInfo.locationParts) {
    addWords(part);
  }
  addWords(locationInfo.suburb);
  addWords(locationInfo.city);
  addWords(locationInfo.state);
  return words;
};

const findLocationMatch = (
  locationInfo: LocationParts,
  titleContext: TitleContext
): { containsLocation: boolean; matchedLocations: string[] } => {
  const matchedLocations: string[] = [];
  const check = (value: string | null) =>
    matchLocationValue(value, titleContext, matchedLocations);

  let containsLocation =
    check(locationInfo.suburb) ||
    check(locationInfo.city) ||
    check(locationInfo.state) ||
    check(locationInfo.country);

  if (!containsLocation) {
    for (const part of locationInfo.locationParts) {
      if (check(part)) {
        containsLocation = true;
        break;
      }
    }
  }

  if (!containsLocation && locationInfo.locationParts.length > 0) {
    for (const word of collectLocationWords(locationInfo)) {
      if (titleContext.titleWordSet.has(word)) {
        containsLocation = true;
        matchedLocations.push(`${word} (word match)`);
        break;
      }
    }
  }

  return { containsLocation, matchedLocations };
};

const buildDebugInfo = (
  passesCheck: boolean,
  containsLocation: boolean,
  hasLocationInfo: boolean,
  locationInfo: LocationParts,
  titleWords: Set<string> | string[],
  matchedLocations: string[]
): string => {
  if (!passesCheck && !containsLocation && hasLocationInfo) {
    const locationDetails = [];
    if (locationInfo.suburb) {
      locationDetails.push(`Suburb: ${locationInfo.suburb}`);
    }
    if (locationInfo.city) {
      locationDetails.push(`City: ${locationInfo.city}`);
    }
    if (locationInfo.state) {
      locationDetails.push(`State: ${locationInfo.state}`);
    }
    if (locationInfo.locationParts.length > 0) {
      locationDetails.push(
        `Address parts: ${locationInfo.locationParts.join(", ")}`
      );
    }
    return ` [${locationDetails.join("; ")}] [Title words: ${[...titleWords].join(", ")}]`;
  }
  if (passesCheck && matchedLocations.length > 0) {
    return ` [Matched: ${matchedLocations.join(", ")}]`;
  }
  return "";
};

export const checkWebsiteTitle = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return noWebsiteResult();
  }

  try {
    const document = await ctx.getWebsiteDocument();
    const title = document.querySelector("title")?.textContent?.trim() ?? "";
    if (!title) {
      return checkResult(false, "No title tag found on the website");
    }

    const titleContext = buildTitleContext(
      title,
      ctx.business.name.toLowerCase()
    );
    if (!titleContext.titleLower.includes(titleContext.businessName)) {
      return checkResult(false, `Title missing business name: "${title}"`);
    }

    const place = await ctx.getGooglePlace();
    const storedAddress = ctx.business.locations.find(
      (location) => location.address
    )?.address;
    const locationInfo = place
      ? locationPartsFromPlace(place)
      : locationPartsFromAddress(storedAddress);

    const { containsLocation, matchedLocations } = findLocationMatch(
      locationInfo,
      titleContext
    );
    const hasLocationInfo =
      locationInfo.locationParts.length > 0 ||
      Boolean(locationInfo.suburb) ||
      Boolean(locationInfo.city) ||
      Boolean(locationInfo.state);
    const passesCheck =
      titleContext.titleLower.includes(titleContext.businessName) &&
      (containsLocation || !hasLocationInfo);
    const debugInfo = buildDebugInfo(
      passesCheck,
      containsLocation,
      hasLocationInfo,
      locationInfo,
      titleContext.titleWordSet,
      matchedLocations
    );

    return checkResult(
      passesCheck,
      passesCheck
        ? `Title contains business name and location${debugInfo}`
        : `Title missing location: "${title}"${debugInfo}`
    );
  } catch (error) {
    return fetchErrorResult(error, "Error fetching website");
  }
};
