import { z } from "zod";
import { channelIdSchema } from "./channel";

export const categoryIdSchema = z.enum(["food", "retail", "services", "other"]);
export type CategoryId = z.infer<typeof categoryIdSchema>;

export const categorySchema = z.object({
  id: categoryIdSchema,
  label: z.string(),
  description: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const CATEGORY_CONFIG: Record<CategoryId, Category> = {
  food: {
    id: "food",
    label: "Food and drink",
    description: "Restaurants, cafés, bars",
  },
  retail: {
    id: "retail",
    label: "Retail",
    description: "Clothing, electronics, home goods",
  },
  services: {
    id: "services",
    label: "Services",
    description: "Plumbers, electricians, and similar trades",
  },
  other: {
    id: "other",
    label: "Other",
    description: "Anything else",
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

export function getCategoryIdFromGooglePlaceTypes(data: string[]): CategoryId {
  for (const type of data) {
    if (foodTypes.has(type) || type.includes("restaurant")) {
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
}

export const recommendedSocialMedia: Record<CategoryId, z.infer<typeof channelIdSchema>[]> = {
  food: ["facebook", "instagram", "tiktok"],
  retail: ["facebook", "instagram", "tiktok", "youtube"],
  services: ["facebook"],
  other: ["facebook", "instagram"],
};
