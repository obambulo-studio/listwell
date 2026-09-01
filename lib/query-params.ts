import { z } from "zod";
import { categoryIdSchema, type CategoryId } from "./category";
import { discoveredProfileSchema, type DiscoveredProfile } from "./channel";

export function parseCategoryParam(value: string | undefined): CategoryId {
  const parsed = categoryIdSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
}

export function parseProfilesParam(value: string | undefined): DiscoveredProfile[] {
  if (!value) {
    return [];
  }
  try {
    return z.array(discoveredProfileSchema).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
