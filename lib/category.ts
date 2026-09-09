import { z } from "zod";

import type { channelIdSchema } from "./channel";

export const categoryIdSchema = z.enum(["food", "retail", "services", "other"]);
export type CategoryId = z.infer<typeof categoryIdSchema>;

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

export const recommendedSocialMedia: Record<
  CategoryId,
  z.infer<typeof channelIdSchema>[]
> = {
  food: ["facebook", "instagram", "tiktok"],
  other: ["facebook", "instagram"],
  retail: ["facebook", "instagram", "tiktok", "youtube"],
  services: ["facebook"],
};
