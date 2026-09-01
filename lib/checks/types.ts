import { z } from "zod";
import type { CategoryId } from "../category";
import type { Business, CheckResult } from "../schema";

export const checkDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  channelCategory: z.string(),
  points: z.object({
    food: z.number(),
    retail: z.number(),
    services: z.number(),
    other: z.number(),
  }),
  businessCategories: z.array(z.enum(["food", "retail", "services", "other"])).nullable(),
  body: z.string(),
});

export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;

export type CheckRunner = (business: Business) => Promise<CheckResult>;

export function appliesToCategory(definition: CheckDefinition, category: CategoryId): boolean {
  if (definition.businessCategories === null) {
    return true;
  }
  return definition.businessCategories.includes(category);
}

export function pointsFor(definition: CheckDefinition, category: CategoryId): number {
  return definition.points[category];
}
