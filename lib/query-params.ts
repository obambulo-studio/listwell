import { z } from "zod";

import { categoryIdSchema } from "./category";
import type { CategoryId } from "./category";
import { discoveredProfileSchema } from "./channel";
import type { DiscoveredProfile } from "./channel";

export const parseCategoryParam = (value: string | undefined): CategoryId => {
  const parsed = categoryIdSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
};

export const parseProfilesParam = (
  value: string | undefined
): DiscoveredProfile[] => {
  if (!value) {
    return [];
  }
  try {
    return z.array(discoveredProfileSchema).parse(JSON.parse(value));
  } catch {
    return [];
  }
};

export const firstSearchParam = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const appPathSchema = z.string().regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/u);

export const safeAppPath = (
  value: string | undefined,
  fallback = "/account"
): string => {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  const parsed = appPathSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
};
