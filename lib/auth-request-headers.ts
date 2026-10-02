import { cookies, headers } from "next/headers";

import { listwellSiteUrl } from "@/lib/site-metadata";

const cookieMapFromHeader = (serialized: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const segment of serialized.split(";")) {
    const part = segment.trim();
    if (!part) {
      continue;
    }
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    map.set(part.slice(0, separator), part.slice(separator + 1));
  }
  return map;
};

const serializeCookieMap = (map: Map<string, string>): string =>
  [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

/** Prefer `cookies()` values; fill gaps from the raw Cookie header. */
const mergeRequestCookies = async (merged: Headers): Promise<void> => {
  const jar = await cookies();
  const jarEntries = jar.getAll();
  const fromHeader = merged.get("cookie")?.trim() ?? "";
  const map = fromHeader
    ? cookieMapFromHeader(fromHeader)
    : new Map<string, string>();

  for (const { name, value } of jarEntries) {
    map.set(name, value);
  }

  const serialized = serializeCookieMap(map);
  if (serialized) {
    merged.set("cookie", serialized);
  }
};

const firstHeaderValue = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const [first] = value.split(",");
  return first?.trim() || null;
};

/** Request headers for Better Auth token exchange during RSC and route handlers. */
export const authRequestHeaders = async (): Promise<Headers> => {
  const incoming = await headers();
  const merged = new Headers(incoming);
  merged.delete("content-length");
  merged.delete("transfer-encoding");
  merged.set("accept-encoding", "identity");

  await mergeRequestCookies(merged);

  const site = new URL(listwellSiteUrl());
  const forwardedHost =
    firstHeaderValue(merged.get("x-better-auth-forwarded-host")) ??
    firstHeaderValue(merged.get("x-forwarded-host")) ??
    firstHeaderValue(merged.get("host")) ??
    site.host;
  const forwardedProto =
    firstHeaderValue(merged.get("x-better-auth-forwarded-proto")) ??
    firstHeaderValue(merged.get("x-forwarded-proto")) ??
    site.protocol.replace(":", "");

  merged.set("x-better-auth-forwarded-host", forwardedHost);
  merged.set("x-better-auth-forwarded-proto", forwardedProto);
  merged.set("x-forwarded-host", forwardedHost);
  merged.set("x-forwarded-proto", forwardedProto);

  return merged;
};
