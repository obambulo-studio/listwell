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
    description: "Clothing, electronics, home goods",
    id: "retail",
    label: "Retail",
  },
  services: {
    description: "Plumbers, electricians, and similar trades",
    id: "services",
    label: "Services",
  },
};

const foodTypes = new Set([
  "bakery",
  "bar",
  "cafe",
  "meal_delivery",
  "meal_takeaway",
  "restaurant",
  "food",
  "liquor_store",
  "wine_shop",
]);

const retailTypes = new Set([
  "store",
  "shopping_mall",
  "department_store",
  "supermarket",
  "grocery_store",
  "convenience_store",
  "clothing_store",
]);

const serviceTypes = new Set([
  "accounting",
  "bank",
  "beauty_salon",
  "dentist",
  "doctor",
  "electrician",
  "lawyer",
  "plumber",
  "real_estate_agency",
  "spa",
]);

const GENERIC_GOOGLE_PLACE_TYPES = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
  "establishment",
  "geocode",
  "locality",
  "point_of_interest",
  "political",
  "postal_code",
  "premise",
  "route",
  "street_address",
  "sublocality",
]);

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
    const label = formatGooglePlaceType(type);
    if (label) {
      return label;
    }
  }
  return null;
};

export const getCategoryIdFromGooglePlaceTypes = (
  data: string[]
): CategoryId => {
  for (const type of data) {
    if (foodTypes.has(type) || /restaurant/u.test(type)) {
      return "food";
    }
  }
  for (const type of data) {
    if (retailTypes.has(type) || type.endsWith("_store")) {
      return "retail";
    }
  }
  for (const type of data) {
    if (serviceTypes.has(type)) {
      return "services";
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

export const resolveTypedCategory = (
  text: string
): { categoryId: CategoryId; label: string } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { categoryId: "other", label: CATEGORY_CONFIG.other.label };
  }
  const lowered = trimmed.toLocaleLowerCase();
  const preset = Object.values(CATEGORY_CONFIG).find(
    (item) => item.label.toLocaleLowerCase() === lowered || item.id === lowered
  );
  if (preset) {
    return { categoryId: preset.id, label: preset.label };
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

export const recommendedSocialMedia: Record<
  CategoryId,
  z.infer<typeof channelIdSchema>[]
> = {
  food: ["facebook", "instagram", "tiktok"],
  other: ["facebook", "instagram", "tiktok"],
  retail: ["facebook", "instagram", "tiktok", "youtube"],
  services: ["facebook"],
};
