import { z } from "zod";

/**
 * Enforced page policy.
 *
 * Scripts and styles stay on this origin, plus the inline scripts and style
 * attributes Next, the theme bootstrap, and the session restore script emit.
 * next/font self-hosts Geist, so fonts are not loaded from a third party.
 * The browser opens the Convex deployment over HTTPS and WebSocket, loads
 * uploaded profile photos from that deployment, and may load a Gravatar.
 * Polar checkout replaces the page; it is not embedded.
 */
export const CONTENT_SECURITY_POLICY_HEADER = "Content-Security-Policy";

const GRAVATAR_ORIGINS = [
  "https://www.gravatar.com",
  "https://secure.gravatar.com",
  "https://i.gravatar.com",
  "https://s.gravatar.com",
] as const;

const httpUrlSchema = z.url();

export interface ContentSecurityPolicyInput {
  convexSiteUrl: string;
  convexUrl: string;
  development: boolean;
}

const parsedHttpUrl = (value: string): URL | null => {
  const parsed = httpUrlSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const url = new URL(parsed.data);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  return url;
};

const socketOrigin = (url: URL): string | null => {
  if (url.protocol === "https:") {
    return `wss://${url.host}`;
  }
  if (url.protocol === "http:") {
    return `ws://${url.host}`;
  }
  return null;
};

const uniqueSources = (sources: readonly string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const source of sources) {
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    unique.push(source);
  }
  return unique;
};

const deploymentOrigins = (
  convexUrl: string,
  convexSiteUrl: string
): { connect: string[]; image: string[] } => {
  const connect: string[] = [];
  const image: string[] = [];
  for (const value of [convexUrl, convexSiteUrl]) {
    const url = parsedHttpUrl(value);
    if (!url) {
      continue;
    }
    connect.push(url.origin);
    image.push(url.origin);
    const socket = socketOrigin(url);
    if (socket) {
      connect.push(socket);
    }
  }
  return { connect: uniqueSources(connect), image: uniqueSources(image) };
};

export const contentSecurityPolicy = (
  input: ContentSecurityPolicyInput
): string => {
  const { connect, image } = deploymentOrigins(
    input.convexUrl,
    input.convexSiteUrl
  );
  const scriptSources = input.development
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", "'unsafe-inline'"];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${[...GRAVATAR_ORIGINS, ...image].join(" ")}`,
    "font-src 'self' data:",
    `connect-src 'self' ${connect.join(" ")}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];
  if (!input.development) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
};

export const contentSecurityPolicyFromEnv = (): string =>
  contentSecurityPolicy({
    convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
    development: process.env.NODE_ENV === "development",
  });
