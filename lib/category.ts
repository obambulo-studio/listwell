import { z } from "zod";

import type { channelIdSchema } from "./channel";
import { normalizeCategoryText } from "./text-normalize";

export const categoryIdSchema = z.enum(["food", "retail", "services", "other"]);
export type CategoryId = z.infer<typeof categoryIdSchema>;

export const CATEGORY_LABEL_MAX_LENGTH = 100;

const customCategoryLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(CATEGORY_LABEL_MAX_LENGTH);

export const categoryLabelInputSchema = customCategoryLabelSchema.nullable();

export const categorySchema = z.object({
  description: z.string(),
  id: categoryIdSchema,
  label: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_CONFIG: Record<CategoryId, Category> = {
  food: {
    description: "Restaurants, cafés, bars",
    id: "food",
    label: "Food and drink",
  },
  other: {
    description: "Anything else",
    id: "other",
    label: "Other",
  },
  retail: {
    description: "Clothing, grocery, florists, and other shops",
    id: "retail",
    label: "Retail",
  },
  services: {
    description: "Trades, clinics, salons, and professional services",
    id: "services",
    label: "Services",
  },
};

export interface BusinessCategoryOption {
  categoryId: CategoryId;
  description: string;
  keywords: readonly string[];
  label: string;
}

/** Customer-facing categories. Each one still scores on a food, retail, services, or other track. */
export const BUSINESS_CATEGORY_OPTIONS: readonly BusinessCategoryOption[] = [
  {
    categoryId: "food",
    description: "Cafés and coffee shops",
    keywords: ["cafe", "coffee", "coffee shop"],
    label: "Café",
  },
  {
    categoryId: "food",
    description: "Restaurants and diners",
    keywords: ["restaurant", "diner", "bistro"],
    label: "Restaurant",
  },
  {
    categoryId: "food",
    description: "Bars, pubs, and wine bars",
    keywords: ["bar", "pub", "wine bar"],
    label: "Bar or pub",
  },
  {
    categoryId: "food",
    description: "Bakeries and cake shops",
    keywords: ["bakery", "cake shop"],
    label: "Bakery",
  },
  {
    categoryId: "food",
    description: "Takeaway and fast food",
    keywords: ["takeaway", "take away", "fast food"],
    label: "Takeaway",
  },
  {
    categoryId: "food",
    description: "Restaurants, cafés, bars, and other food businesses",
    keywords: ["food", "food and drink", "hospitality"],
    label: "Food and drink",
  },
  {
    categoryId: "retail",
    description: "Clothing and shoe shops",
    keywords: ["clothing", "clothes", "apparel", "fashion"],
    label: "Clothing",
  },
  {
    categoryId: "retail",
    description: "Supermarkets and grocery shops",
    keywords: ["grocery", "supermarket", "groceries"],
    label: "Grocery",
  },
  {
    categoryId: "retail",
    description: "Florists and flower shops",
    keywords: ["florist", "flower shop", "flowers"],
    label: "Florist",
  },
  {
    categoryId: "retail",
    description: "Pet shops",
    keywords: ["pet", "pet shop", "pet store"],
    label: "Pet care",
  },
  {
    categoryId: "retail",
    description: "Shops and stores",
    keywords: ["retail", "shop", "store"],
    label: "Retail",
  },
  {
    categoryId: "services",
    description: "Hair salons, barbers, and beauty salons",
    keywords: [
      "hair",
      "hairdresser",
      "hair salon",
      "barber",
      "beauty",
      "beauty salon",
      "nail salon",
      "nails",
      "salon",
      "health and beauty",
    ],
    label: "Hair and beauty",
  },
  {
    categoryId: "services",
    description: "Dentists and dental clinics",
    keywords: ["dental", "dentist"],
    label: "Dental",
  },
  {
    categoryId: "services",
    description: "Doctors, clinics, and allied health",
    keywords: ["medical", "doctor", "clinic", "gp", "physio", "physiotherapy"],
    label: "Medical",
  },
  {
    categoryId: "services",
    description: "Gyms and fitness studios",
    keywords: ["fitness", "gym", "yoga"],
    label: "Fitness",
  },
  {
    categoryId: "services",
    description: "Plumbers, electricians, and other trades",
    keywords: ["trades", "tradie", "plumber", "electrician", "builder"],
    label: "Trades",
  },
  {
    categoryId: "services",
    description: "Mechanics, car repair, and dealers",
    keywords: ["automotive", "mechanic", "car repair"],
    label: "Automotive",
  },
  {
    categoryId: "services",
    description: "Real estate agencies",
    keywords: ["real estate", "realtor", "estate agent"],
    label: "Real estate",
  },
  {
    categoryId: "services",
    description: "Accountants, lawyers, and consultants",
    keywords: [
      "professional services",
      "accountant",
      "lawyer",
      "consulting",
      "consultant",
    ],
    label: "Professional services",
  },
  {
    categoryId: "services",
    description: "Vets and animal clinics",
    keywords: ["veterinary", "vet", "veterinarian"],
    label: "Veterinary",
  },
  {
    categoryId: "services",
    description: "Trades, clinics, salons, and other service businesses",
    keywords: ["services"],
    label: "Services",
  },
  {
    categoryId: "other",
    description: "Hotels, motels, and lodging",
    keywords: ["accommodation", "hotel", "motel"],
    label: "Accommodation",
  },
  {
    categoryId: "other",
    description: "Schools, universities, and training",
    keywords: ["education", "school", "university", "tutoring"],
    label: "Education",
  },
  {
    categoryId: "other",
    description: "Galleries, theatres, and venues",
    keywords: [
      "arts",
      "entertainment",
      "gallery",
      "theatre",
      "theater",
      "museum",
    ],
    label: "Arts and entertainment",
  },
  {
    categoryId: "other",
    description: "Anything else",
    keywords: ["other"],
    label: "Other",
  },
];

export const businessCategoryLabels = (): string[] =>
  BUSINESS_CATEGORY_OPTIONS.map((option) => option.label);

const foodTypes = new Set([
  "acai_shop",
  "bagel_shop",
  "bakery",
  "bar",
  "bar_and_grill",
  "cafe",
  "cafeteria",
  "candy_store",
  "cat_cafe",
  "chocolate_shop",
  "coffee_shop",
  "confectionery",
  "deli",
  "dessert_shop",
  "diner",
  "dog_cafe",
  "donut_shop",
  "food",
  "food_court",
  "ice_cream_shop",
  "juice_shop",
  "meal_delivery",
  "meal_takeaway",
  "pub",
  "sandwich_shop",
  "steak_house",
  "tea_house",
  "wine_bar",
]);

const serviceTypes = new Set([
  "accounting",
  "barber_shop",
  "beautician",
  "beauty_salon",
  "car_dealer",
  "car_rental",
  "car_repair",
  "car_wash",
  "chiropractor",
  "consultant",
  "dental_clinic",
  "dentist",
  "doctor",
  "electrician",
  "fitness_center",
  "gym",
  "hair_care",
  "hair_salon",
  "hospital",
  "insurance_agency",
  "laundry",
  "lawyer",
  "locksmith",
  "massage",
  "moving_company",
  "nail_salon",
  "painter",
  "physiotherapist",
  "plumber",
  "real_estate_agency",
  "roofing_contractor",
  "spa",
  "storage",
  "travel_agency",
  "veterinary_care",
  "yoga_studio",
]);

const retailTypes = new Set([
  "department_store",
  "drugstore",
  "florist",
  "market",
  "pharmacy",
  "shopping_mall",
  "supermarket",
]);

const GENERIC_GOOGLE_PLACE_TYPES = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
  "establishment",
  "finance",
  "food",
  "general_contractor",
  "geocode",
  "health",
  "locality",
  "point_of_interest",
  "political",
  "postal_code",
  "premise",
  "route",
  "service",
  "store",
  "street_address",
  "sublocality",
]);

const GOOGLE_TYPE_LABEL: Record<string, string> = {
  cafe: "Café",
  cat_cafe: "Café",
  coffee_shop: "Café",
  meal_delivery: "Takeaway",
  meal_takeaway: "Takeaway",
};

const foldCategoryText = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replaceAll(/\p{M}/gu, "")
    .replaceAll("&", " and ")
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();

const formatGooglePlaceType = (type: string): string => {
  let label = "";
  for (const part of type.split("_")) {
    if (!part) {
      continue;
    }
    const word = part.charAt(0).toUpperCase() + part.slice(1);
    label = label ? `${label} ${word}` : word;
  }
  return label;
};

export const primaryGooglePlaceTypeLabel = (
  types: string[] | undefined
): string | null => {
  if (!types?.length) {
    return null;
  }
  for (const type of types) {
    if (GENERIC_GOOGLE_PLACE_TYPES.has(type)) {
      continue;
    }
    const override = GOOGLE_TYPE_LABEL[type];
    if (override) {
      return override;
    }
    const label = formatGooglePlaceType(type);
    if (label) {
      return label;
    }
  }
  return null;
};

export const categoryLabelFromGooglePlaceTypes = (
  types: string[] | undefined
): string | null => primaryGooglePlaceTypeLabel(types);

export const getCategoryIdFromGooglePlaceTypes = (
  data: string[]
): CategoryId => {
  for (const type of data) {
    if (foodTypes.has(type) || /restaurant/u.test(type)) {
      return "food";
    }
  }
  for (const type of data) {
    if (serviceTypes.has(type)) {
      return "services";
    }
  }
  for (const type of data) {
    if (
      retailTypes.has(type) ||
      type.endsWith("_store") ||
      type.endsWith("_shop")
    ) {
      return "retail";
    }
  }
  return "other";
};

export const categoryDisplayLabel = (
  categoryId: CategoryId,
  categoryLabel: string | null | undefined
): string => {
  const custom = categoryLabel?.trim();
  if (custom) {
    return custom;
  }
  return CATEGORY_CONFIG[categoryId].label;
};

export const matchBusinessCategory = (
  text: string
): { categoryId: CategoryId; label: string } | null => {
  const folded = foldCategoryText(text);
  if (!folded) {
    return null;
  }
  const parsedId = categoryIdSchema.safeParse(folded);
  if (parsedId.success) {
    return {
      categoryId: parsedId.data,
      label: CATEGORY_CONFIG[parsedId.data].label,
    };
  }
  for (const option of BUSINESS_CATEGORY_OPTIONS) {
    if (foldCategoryText(option.label) === folded) {
      return { categoryId: option.categoryId, label: option.label };
    }
  }
  for (const option of BUSINESS_CATEGORY_OPTIONS) {
    for (const keyword of option.keywords) {
      if (foldCategoryText(keyword) === folded) {
        return { categoryId: option.categoryId, label: option.label };
      }
    }
  }
  return null;
};

export const resolveTypedCategory = (
  text: string
): { categoryId: CategoryId; label: string } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { categoryId: "other", label: CATEGORY_CONFIG.other.label };
  }
  const matched = matchBusinessCategory(trimmed);
  if (matched) {
    return matched;
  }
  const parsed = customCategoryLabelSchema.safeParse(
    normalizeCategoryText(trimmed)
  );
  if (!parsed.success) {
    throw new Error("Invalid category");
  }
  return { categoryId: "other", label: parsed.data };
};

export const persistedCategoryLabel = (choice: {
  categoryId: CategoryId;
  label: string;
}): string | null =>
  choice.label === CATEGORY_CONFIG[choice.categoryId].label
    ? null
    : choice.label;

const MAX_INCLUDED_PLACE_TYPES = 50;

const TIGHT_PLACE_GROUPS: readonly (readonly string[])[] = [
  ["cafe", "coffee_shop"],
  ["bar", "pub", "wine_bar"],
  ["bakery", "bagel_shop", "donut_shop"],
  ["pizza_restaurant", "italian_restaurant"],
  ["chinese_restaurant"],
  ["japanese_restaurant", "ramen_restaurant", "sushi_restaurant"],
  ["thai_restaurant"],
  ["indian_restaurant"],
  ["mexican_restaurant"],
  ["american_restaurant", "fast_food_restaurant", "hamburger_restaurant"],
  ["seafood_restaurant"],
  ["meal_delivery", "meal_takeaway", "sandwich_shop"],
  ["barber_shop", "hair_care", "hair_salon"],
  ["beauty_salon", "nail_salon", "spa"],
  ["dental_clinic", "dentist"],
  ["chiropractor", "doctor", "physiotherapist"],
  ["fitness_center", "gym", "yoga_studio"],
  ["grocery_store", "supermarket"],
  ["convenience_store"],
  ["clothing_store", "shoe_store"],
  ["florist"],
  ["car_repair"],
  ["car_dealer"],
  ["plumber"],
  ["electrician"],
  ["locksmith"],
  ["painter"],
  ["roofing_contractor"],
  ["real_estate_agency"],
  ["accounting"],
  ["lawyer"],
  ["veterinary_care"],
  ["guest_house", "hostel", "hotel", "lodging", "motel"],
  ["pet_store"],
];

const RELATED_PLACE_TYPES: Record<string, readonly string[]> = {
  bakery: ["cafe", "coffee_shop"],
  bar: ["restaurant"],
  barber_shop: ["beauty_salon"],
  beauty_salon: ["hair_salon"],
  cafe: ["bakery", "breakfast_restaurant", "brunch_restaurant", "tea_house"],
  car_repair: ["car_wash"],
  chinese_restaurant: ["restaurant"],
  clothing_store: ["department_store", "shoe_store"],
  coffee_shop: [
    "bakery",
    "breakfast_restaurant",
    "brunch_restaurant",
    "tea_house",
  ],
  convenience_store: ["grocery_store", "supermarket"],
  fast_food_restaurant: ["meal_takeaway", "restaurant"],
  florist: ["gift_shop"],
  grocery_store: ["convenience_store", "supermarket"],
  gym: ["fitness_center", "yoga_studio"],
  hair_salon: ["beauty_salon"],
  hamburger_restaurant: ["meal_takeaway", "restaurant"],
  hotel: ["lodging", "motel"],
  indian_restaurant: ["restaurant"],
  italian_restaurant: ["restaurant"],
  japanese_restaurant: ["restaurant"],
  meal_takeaway: ["fast_food_restaurant", "restaurant"],
  mexican_restaurant: ["restaurant"],
  motel: ["hotel", "lodging"],
  nail_salon: ["beauty_salon"],
  pet_store: ["veterinary_care"],
  pizza_restaurant: ["meal_takeaway", "restaurant"],
  pub: ["restaurant"],
  seafood_restaurant: ["restaurant"],
  shoe_store: ["clothing_store"],
  supermarket: ["convenience_store", "grocery_store"],
  sushi_restaurant: ["restaurant"],
  thai_restaurant: ["restaurant"],
  veterinary_care: ["pet_store"],
  wine_bar: ["bar", "restaurant"],
};

const RESTAURANT_NEIGHBOURS = [
  "restaurant",
  "american_restaurant",
  "bar_and_grill",
  "barbecue_restaurant",
  "brazilian_restaurant",
  "breakfast_restaurant",
  "brunch_restaurant",
  "buffet_restaurant",
  "chinese_restaurant",
  "diner",
  "fast_food_restaurant",
  "fine_dining_restaurant",
  "french_restaurant",
  "greek_restaurant",
  "hamburger_restaurant",
  "indian_restaurant",
  "indonesian_restaurant",
  "italian_restaurant",
  "japanese_restaurant",
  "korean_restaurant",
  "lebanese_restaurant",
  "mediterranean_restaurant",
  "mexican_restaurant",
  "middle_eastern_restaurant",
  "pizza_restaurant",
  "ramen_restaurant",
  "sandwich_shop",
  "seafood_restaurant",
  "spanish_restaurant",
  "steak_house",
  "sushi_restaurant",
  "thai_restaurant",
  "turkish_restaurant",
  "vegan_restaurant",
  "vegetarian_restaurant",
  "vietnamese_restaurant",
] as const;

const EXTRA_RESTAURANT_TYPES = new Set([
  "bar_and_grill",
  "diner",
  "steak_house",
]);

export interface CompetitorTypeQuery {
  direct: string[];
  related: string[];
}

const uniquePlaceTypes = (types: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const type of types) {
    if (!type || seen.has(type)) {
      continue;
    }
    seen.add(type);
    result.push(type);
    if (result.length >= MAX_INCLUDED_PLACE_TYPES) {
      break;
    }
  }
  return result;
};

const isBroadRestaurant = (type: string): boolean =>
  type === "restaurant" ||
  EXTRA_RESTAURANT_TYPES.has(type) ||
  type.endsWith("_restaurant");

/** Place types that compete with this one. Direct types are the same kind of business. */
export const competitorTypesFor = (
  primaryType: string
): CompetitorTypeQuery => {
  const tight = TIGHT_PLACE_GROUPS.find((group) => group.includes(primaryType));
  if (tight) {
    const direct = uniquePlaceTypes([primaryType, ...tight]);
    const directSet = new Set(direct);
    const related = uniquePlaceTypes(
      (RELATED_PLACE_TYPES[primaryType] ?? []).filter(
        (type) => !directSet.has(type)
      )
    );
    return { direct, related };
  }
  if (isBroadRestaurant(primaryType)) {
    return {
      direct: uniquePlaceTypes([primaryType, ...RESTAURANT_NEIGHBOURS]),
      related: [],
    };
  }
  return {
    direct: uniquePlaceTypes([primaryType]),
    related: uniquePlaceTypes(RELATED_PLACE_TYPES[primaryType] ?? []),
  };
};

export const recommendedSocialMedia: Record<
  CategoryId,
  z.infer<typeof channelIdSchema>[]
> = {
  food: ["facebook", "instagram", "tiktok"],
  other: ["facebook", "instagram", "tiktok"],
  retail: ["facebook", "instagram", "tiktok", "youtube"],
  services: ["facebook"],
};
