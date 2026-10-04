import { z } from "zod";

export const normalizeInviteEmail = (value: string): string | null => {
  const parsed = z.string().email().safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
};
