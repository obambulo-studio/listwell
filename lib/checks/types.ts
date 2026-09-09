import { z } from "zod";

import type { CategoryId } from "../category";
import type { Business, CheckResult } from "../schema";

export const checkDefinitionSchema = z.object({
  body: z.string(),
  businessCategories: z
    .array(z.enum(["food", "retail", "services", "other"]))
    .nullable(),
  channelCategory: z.string(),
  id: z.string(),
  points: z.object({
    food: z.number(),
    other: z.number(),
    retail: z.number(),
    services: z.number(),
  }),
  title: z.string(),
});

export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;

export type CheckRunner = (business: Business) => Promise<CheckResult>;

export const appliesToCategory = (
  definition: CheckDefinition,
  category: CategoryId
): boolean => {
  if (definition.businessCategories === null) {
    return true;
  }
  return definition.businessCategories.includes(category);
};

export const pointsFor = (
  definition: CheckDefinition,
  category: CategoryId
): number => definition.points[category];
