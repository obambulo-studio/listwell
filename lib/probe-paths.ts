// Bot probes such as `/xmlrpc.php`, `/.env` and `/wp-login.php` would
// otherwise reach the dynamic `/[id]` report route and throw NEXT_NOT_FOUND,
// which Workers observability logs as an unhandled exception. The proxy
// answers them with a plain 404 before routing instead.

// Top-level paths with a dot that the app or `public/` serves on purpose.
// `lib/probe-paths.test.ts` checks this list against `app/` and `public/`.
const servedDottedSegments = new Set([
  ".well-known",
  "1.icon.png",
  "2.icon.png",
  "3.icon.png",
  "4.icon.png",
  "apple-touch-icon.png",
  "apple-touch-icon.svg",
  "auth.md",
  "favicon.ico",
  "favicon.svg",
  "llms.txt",
  "logo.png",
  "og.png",
  "lw-analytics.js",
  "robots.txt",
  "sitemap.xml",
]);

// Common scanner targets without a file extension.
const probeSegments = new Set([
  "cgi-bin",
  "phpmyadmin",
  "wordpress",
  "wp",
  "wp-admin",
  "wp-content",
  "wp-includes",
  "wp-json",
  "wp-login",
  "xmlrpc",
]);

const firstPathSegment = (pathname: string): string | null => {
  const segment = pathname.split("/").find(Boolean);
  if (!segment) {
    return null;
  }
  try {
    return decodeURIComponent(segment).toLowerCase();
  } catch {
    return segment.toLowerCase();
  }
};

/**
 * True when the first path segment looks like a file or scanner target rather
 * than a report id. Report ids are UUIDs, so they never contain a dot.
 */
export const isProbePath = (pathname: string): boolean => {
  const segment = firstPathSegment(pathname);
  if (!segment) {
    return false;
  }
  if (servedDottedSegments.has(segment)) {
    return false;
  }
  return segment.includes(".") || probeSegments.has(segment);
};

export const probeNotFoundResponse = (method: string): Response =>
  new Response(method.toUpperCase() === "HEAD" ? null : "Not found", {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
    status: 404,
  });
