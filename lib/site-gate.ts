import { z } from "zod";

import { timingSafeEqual } from "@/lib/auth";

export const SITE_GATE_COOKIE = "listwell_site_access";
const GATE_TOKEN_MESSAGE = "listwell-site-access-v1";
const GATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const optionalSecret = z.string().min(1).optional();

export const readSitePassword = (
  env: CloudflareEnv | null
): string | undefined => {
  const parsed = optionalSecret.safeParse(env?.SITE_PASSWORD);
  if (parsed.success) {
    return parsed.data;
  }
  const fromProcess = optionalSecret.safeParse(process.env.SITE_PASSWORD);
  return fromProcess.success ? fromProcess.data : undefined;
};

export const isSiteGateEnabled = (env: CloudflareEnv | null): boolean =>
  Boolean(readSitePassword(env));

const bytesToHex = (bytes: Uint8Array): string => {
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return hex.join("");
};

const importGateKey = (password: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );

export const createSiteGateCookieValue = async (
  password: string
): Promise<string> => {
  const key = await importGateKey(password);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(GATE_TOKEN_MESSAGE)
  );
  return bytesToHex(new Uint8Array(signature));
};

export const verifySiteGateCookieValue = async (
  cookieValue: string,
  password: string
): Promise<boolean> => {
  if (!/^[0-9a-f]{64}$/u.test(cookieValue)) {
    return false;
  }
  const expected = await createSiteGateCookieValue(password);
  return timingSafeEqual(cookieValue, expected);
};

export const readSiteGateCookie = (request: Request): string | undefined => {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SITE_GATE_COOKIE}=`)) {
      const value = trimmed.slice(SITE_GATE_COOKIE.length + 1);
      return value.length > 0 ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
};

export const hasSiteGateAccess = (
  request: Request,
  password: string
): Promise<boolean> => {
  const cookie = readSiteGateCookie(request);
  if (!cookie) {
    return Promise.resolve(false);
  }
  return verifySiteGateCookieValue(cookie, password);
};

export const siteGateCookieHeader = (
  value: string,
  secure: boolean
): string => {
  const parts = [
    `${SITE_GATE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${GATE_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const healthPath = "/api/health";

export const isSiteGateExemptPath = (pathname: string): boolean => {
  if (pathname === healthPath) {
    return true;
  }
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return true;
  }
  if (pathname === "/gate") {
    return true;
  }
  if (pathname === "/llms.txt" || pathname === "/auth.md") {
    return true;
  }
  if (pathname.startsWith("/.well-known/")) {
    return true;
  }
  if (pathname.startsWith("/api/site-gate/")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/")) {
    return true;
  }
  if (pathname.startsWith("/api/agent/")) {
    return true;
  }
  if (pathname.startsWith("/share/")) {
    return true;
  }
  if (pathname === "/api/webhook/polar") {
    return true;
  }
  if (pathname === "/api/analytics/collect") {
    return true;
  }
  if (pathname === "/lw-analytics.js") {
    return true;
  }
  if (pathname === "/api/internal/dataforseo/postback") {
    return true;
  }
  return false;
};

export const siteGateSecureCookies = (request: Request): boolean => {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded === "https") {
    return true;
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
};
