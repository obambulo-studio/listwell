import { z } from "zod";

const sleep = async (ms: number): Promise<void> => {
  try {
    await fetch("data:text/plain,", { signal: AbortSignal.timeout(ms) });
  } catch {
    // delay elapsed or aborted
  }
};

export const NOMINATIM_SEARCH_URL =
  "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_REVERSE_URL =
  "https://nominatim.openstreetmap.org/reverse";
export const NOMINATIM_USER_AGENT =
  "Listwell/1.0 (https://listwell.dev; local business audit)";
export const NOMINATIM_MIN_INTERVAL_MS = 1100;

export const BUSINESS_OSM_CLASSES = new Set([
  "amenity",
  "shop",
  "office",
  "craft",
  "tourism",
  "healthcare",
  "leisure",
  "club",
]);

const FOOD_TYPES = new Set([
  "restaurant",
  "cafe",
  "fast_food",
  "bar",
  "pub",
  "food_court",
  "ice_cream",
  "biergarten",
  "canteen",
  "bakery",
  "confectionery",
  "wine",
  "alcohol",
]);

const SERVICE_TYPES = new Set([
  "accountant",
  "lawyer",
  "estate_agent",
  "insurance",
  "company",
  "dentist",
  "doctors",
  "clinic",
  "veterinary",
  "car_repair",
  "hairdresser",
  "beauty",
  "plumber",
  "electrician",
  "carpenter",
  "painter",
  "cleaning",
]);

const nominatimAddressSchema = z.record(z.string(), z.string());

const nominatimItemSchema = z.object({
  address: nominatimAddressSchema.optional(),
  category: z.string().optional(),
  class: z.string().optional(),
  display_name: z.string(),
  extratags: nominatimAddressSchema.optional(),
  importance: z.number().optional(),
  lat: z.string().optional(),
  lon: z.string().optional(),
  name: z.string().optional(),
  osm_id: z.union([z.number(), z.string()]).optional(),
  osm_type: z.string().optional(),
  place_id: z.union([z.number(), z.string()]),
  type: z.string().optional(),
});

const nominatimSearchSchema = z.array(nominatimItemSchema);

const nominatimReverseSchema = nominatimItemSchema;

export type NominatimItem = z.infer<typeof nominatimItemSchema>;
export type OsmCategoryId = "food" | "retail" | "services" | "other";

export interface NominatimMatch {
  id: string;
  name: string;
  address: string;
  suburb?: string;
  city?: string;
  state?: string;
  websiteUrl?: string;
  phone?: string;
  hours?: string;
  osmClass: string;
  osmType: string;
  categoryId: OsmCategoryId;
  score: number;
}

export interface NominatimSearchOptions {
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  countryCodes?: string;
  limit?: number;
}

export interface NominatimLocality {
  locality: string;
  suburb?: string;
  city?: string;
  state?: string;
}

let lastNominatimAt = 0;

export const resetNominatimThrottle = (): void => {
  lastNominatimAt = 0;
};

const throttle = async (minIntervalMs: number): Promise<void> => {
  if (minIntervalMs <= 0) {
    return;
  }
  const wait = minIntervalMs - (Date.now() - lastNominatimAt);
  if (wait > 0) {
    await sleep(wait);
  }
  lastNominatimAt = Date.now();
};

const nominatimHeaders = (): HeadersInit => ({
  Accept: "application/json",
  "Accept-Language": "en-AU",
  "User-Agent": NOMINATIM_USER_AGENT,
});

export const normalizeName = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .trim();

export const namesOverlap = (search: string, candidate: string): boolean => {
  const needle = normalizeName(search);
  const haystack = normalizeName(candidate);
  if (!needle || !haystack) {
    return false;
  }
  return haystack.includes(needle) || needle.includes(haystack);
};

export const osmClassOf = (item: NominatimItem): string =>
  item.category ?? item.class ?? "";

export const isBusinessOsmClass = (osmClass: string): boolean =>
  BUSINESS_OSM_CLASSES.has(osmClass);

export const categoryFromOsm = (
  osmClass: string,
  osmType: string
): OsmCategoryId => {
  if (FOOD_TYPES.has(osmType) || osmType === "food") {
    return "food";
  }
  if (osmClass === "shop" || osmType === "marketplace") {
    return "retail";
  }
  if (
    osmClass === "office" ||
    osmClass === "craft" ||
    osmClass === "healthcare" ||
    SERVICE_TYPES.has(osmType)
  ) {
    return "services";
  }
  if (osmClass === "amenity" && FOOD_TYPES.has(osmType)) {
    return "food";
  }
  return "other";
};

export const localityFromAddress = (
  address: Record<string, string> | undefined
): NominatimLocality => {
  const suburb = address?.suburb ?? address?.hamlet ?? address?.neighbourhood;
  const city =
    address?.city ?? address?.town ?? address?.municipality ?? address?.village;
  const state = address?.state;
  const parts = [suburb, city].filter((part): part is string => Boolean(part));
  return {
    city,
    locality: parts.join(", ") || city || suburb || address?.state || "",
    state,
    suburb,
  };
};

export const formatNominatimAddress = (item: NominatimItem): string => {
  const { address } = item;
  if (!address) {
    return item.display_name;
  }
  const line = [
    [address.house_number, address.road].filter(Boolean).join(" "),
    address.suburb ?? address.hamlet,
    address.city ?? address.town ?? address.village,
    address.state,
    address.postcode,
  ].filter((part) => part && part.length > 0);
  return line.length > 0 ? line.join(", ") : item.display_name;
};

export const nameScore = (search: string, candidate: string): number => {
  const needle = normalizeName(search);
  const haystack = normalizeName(candidate);
  if (!needle || !haystack) {
    return 0;
  }
  if (haystack === needle) {
    return 1;
  }
  if (haystack.startsWith(needle) || haystack.endsWith(needle)) {
    return 0.92;
  }
  if (haystack.includes(needle)) {
    return 0.85;
  }

  const queryWords = needle.split(/\s+/u).filter((word) => word.length > 1);
  if (queryWords.length === 0) {
    return 0;
  }
  const haystackWords = new Set(haystack.split(/\s+/u));
  const hits = queryWords.filter(
    (word) => haystackWords.has(word) || haystack.includes(word)
  ).length;
  return (hits / queryWords.length) * 0.7;
};

export const locationScore = (near: string, item: NominatimItem): number => {
  const needle = normalizeName(near);
  if (!needle) {
    return 0.4;
  }
  const haystack = normalizeName(
    [
      item.display_name,
      item.address?.suburb,
      item.address?.city,
      item.address?.town,
      item.address?.state,
    ]
      .filter(Boolean)
      .join(" ")
  );
  if (haystack.includes(needle)) {
    return 1;
  }
  const words = needle.split(/\s+/u).filter((word) => word.length > 2);
  if (words.length === 0) {
    return 0.4;
  }
  const hits = words.filter((word) => haystack.includes(word)).length;
  return hits / words.length;
};

export const scoreNominatimItem = (
  query: string,
  near: string,
  item: NominatimItem
): number => {
  const name = item.name || item.address?.amenity || item.address?.shop || "";
  const scoredName =
    nameScore(query, name) || nameScore(query, item.display_name);
  const nearby = locationScore(near, item);
  const businessBonus = isBusinessOsmClass(osmClassOf(item)) ? 0.12 : -0.35;
  const importance = Math.min(item.importance ?? 0, 0.15);
  return scoredName * 0.62 + nearby * 0.22 + businessBonus + importance;
};

const nominatimDisplayName = (item: NominatimItem): string | undefined => {
  const trimmedName = item.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  return item.address?.amenity ?? item.address?.shop ?? item.address?.office;
};

const extratag = (
  item: NominatimItem,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = item.extratags?.[key];
    if (value) {
      return value;
    }
  }
  return undefined;
};

export const matchFromNominatim = (
  item: NominatimItem,
  score: number
): NominatimMatch | null => {
  const osmClass = osmClassOf(item);
  if (!isBusinessOsmClass(osmClass)) {
    return null;
  }
  const name = nominatimDisplayName(item);
  if (!name) {
    return null;
  }

  const locality = localityFromAddress(item.address);
  const website = extratag(item, "website", "contact:website");
  const phone = extratag(item, "phone", "contact:phone");
  const hours = item.extratags?.opening_hours;

  return {
    address: formatNominatimAddress(item),
    categoryId: categoryFromOsm(osmClass, item.type ?? ""),
    city: locality.city,
    hours,
    id: `osm:${item.osm_type ?? "node"}:${item.osm_id ?? item.place_id}`,
    name,
    osmClass,
    osmType: item.type ?? "",
    phone,
    score,
    state: locality.state,
    suburb: locality.suburb,
    websiteUrl: website && /^https?:\/\//u.test(website) ? website : undefined,
  };
};

export const rankNominatimMatches = (
  query: string,
  near: string,
  items: NominatimItem[]
): NominatimMatch[] => {
  const ranked = items
    .flatMap((item) => {
      const score = scoreNominatimItem(query, near, item);
      const match = matchFromNominatim(item, score);
      return match !== null && match.score >= 0.45 ? [match] : [];
    })
    .toSorted((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const unique: NominatimMatch[] = [];
  for (const match of ranked) {
    const key = `${normalizeName(match.name)}|${normalizeName(match.suburb ?? match.city ?? match.address)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(match);
  }
  return unique.slice(0, 8);
};

export const pickStrongMatch = (
  matches: NominatimMatch[]
): NominatimMatch | null => {
  const [top, second] = matches;
  if (!top || top.score < 0.8) {
    return null;
  }
  if (!second) {
    return top;
  }
  if (top.score - second.score >= 0.12) {
    return top;
  }
  return null;
};

export const parseNominatimSearch = (value: unknown): NominatimItem[] => {
  const parsed = nominatimSearchSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

export const parseNominatimReverse = (value: unknown): NominatimItem | null => {
  const parsed = nominatimReverseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export const searchNominatim = async (
  query: string,
  near: string,
  options: NominatimSearchOptions = {}
): Promise<NominatimMatch[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  await throttle(options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS);

  const params = new URLSearchParams({
    addressdetails: "1",
    countrycodes: options.countryCodes ?? "au",
    extratags: "1",
    format: "jsonv2",
    limit: String(options.limit ?? 8),
    q: near.trim() ? `${trimmed}, ${near.trim()}` : trimmed,
  });

  const response = await fetchImpl(`${NOMINATIM_SEARCH_URL}?${params}`, {
    headers: nominatimHeaders(),
  });
  if (!response.ok) {
    return [];
  }
  return rankNominatimMatches(
    trimmed,
    near,
    parseNominatimSearch(await response.json())
  );
};

export const reverseNominatim = async (
  latitude: number,
  longitude: number,
  options: NominatimSearchOptions = {}
): Promise<NominatimLocality | null> => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  await throttle(options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS);

  const params = new URLSearchParams({
    addressdetails: "1",
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "14",
  });

  const response = await fetchImpl(`${NOMINATIM_REVERSE_URL}?${params}`, {
    headers: nominatimHeaders(),
  });
  if (!response.ok) {
    return null;
  }
  const item = parseNominatimReverse(await response.json());
  if (!item) {
    return null;
  }
  const locality = localityFromAddress(item.address);
  return locality.locality ? locality : null;
};
