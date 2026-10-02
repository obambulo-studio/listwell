import { cookies, headers } from "next/headers";

import { listwellSiteUrl } from "@/lib/site-metadata";

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

  if (!merged.get("cookie")?.trim()) {
    const jar = await cookies();
    const serialized = jar
      .getAll()
      .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
    if (serialized) {
      merged.set("cookie", serialized);
    }
  }

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
