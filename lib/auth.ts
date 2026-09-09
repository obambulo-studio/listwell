import { z } from "zod";

import { fetchAuthQuery } from "./auth-server";
import { api } from "./convex/server";
import { accountReportSchema } from "./schema";
import type { AccountReport, UserRow } from "./schema";

const authUserSchema = z.object({
  _id: z.string(),
  createdAt: z.union([z.number(), z.string()]),
  email: z.string(),
});

export const maskEmail = (email: string): string => {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local.charAt(0);
  return `${first}***@${domain}`;
};

export const normalizeEmail = (value: string): string | undefined => {
  const parsed = z.string().email().safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : undefined;
};

export const timingSafeEqual = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  for (let index = 0; index < leftBytes.length; index += 1) {
    if ((leftBytes[index] ?? 0) !== (rightBytes[index] ?? 0)) {
      return false;
    }
  }
  return true;
};

export const isAuthEnabled = (): Promise<boolean> =>
  Promise.resolve(
    Boolean(
      process.env.NEXT_PUBLIC_CONVEX_URL &&
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL
    )
  );

export const cookiesFromAuthResponse = (response: Response): string[] => {
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    return cookies;
  }
  const header = response.headers.get("set-cookie");
  return header ? [header] : [];
};

export const copyAuthCookies = (cookies: string[], headers: Headers): void => {
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
};

export const getSessionUser = async (): Promise<UserRow | null> => {
  try {
    const user = await fetchAuthQuery(api.auth.getAuthUser);
    const parsed = authUserSchema.safeParse(user);
    if (!parsed.success) {
      return null;
    }
    return {
      createdAt: new Date(parsed.data.createdAt).toISOString(),
      email: parsed.data.email,
      id: parsed.data._id,
    };
  } catch {
    return null;
  }
};

export const listReportsForUser = async (
  _userId: string
): Promise<AccountReport[]> => {
  const reports = await fetchAuthQuery(api.account.listReports);
  return z.array(accountReportSchema).parse(reports);
};
