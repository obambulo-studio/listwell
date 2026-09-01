import type { CategoryId } from "../category";
import { CHECK_CATALOG } from "./catalog";
import { runners } from "./runners";
import { appliesToCategory, type CheckDefinition } from "./types";

export function checksForCategory(category: CategoryId): CheckDefinition[] {
  return CHECK_CATALOG.filter((definition) => {
    return Boolean(runners[definition.id]) && appliesToCategory(definition, category);
  });
}

export function getCheckDefinition(id: string): CheckDefinition | null {
  return CHECK_CATALOG.find((definition) => definition.id === id) ?? null;
}
