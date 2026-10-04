/** In-app chat audit flow. */
export const LISTWELL_CHAT_PATH = "/chat" as const;

/** Public demo report (Sample Cafe fixture). */
export const SAMPLE_REPORT_PATH = "/example" as const;

const STATIC_APP_PATHS = new Set([
  "",
  "account",
  "chat",
  "discover",
  "example",
  "gate",
  "new",
  "sign-in",
  "unsubscribe",
  "dev",
  "share",
]);

/** Report pages use a single path segment (business id). */
export const isBusinessReportPath = (pathname: string): boolean => {
  if (!pathname.startsWith("/")) {
    return false;
  }
  const segment = pathname.slice(1).split("/")[0] ?? "";
  if (!segment || segment.includes(".")) {
    return false;
  }
  return !STATIC_APP_PATHS.has(segment);
};

export const isAccountPath = (pathname: string): boolean =>
  pathname === "/account" || pathname.startsWith("/account/");

export const listwellWordmarkHref = (signedIn: boolean): "/" | "/account" =>
  signedIn ? "/account" : "/";

export const listwellChatHref = (businessName?: string): string => {
  const trimmed = businessName?.trim();
  if (!trimmed) {
    return LISTWELL_CHAT_PATH;
  }
  const params = new URLSearchParams({ businessName: trimmed });
  return `${LISTWELL_CHAT_PATH}?${params.toString()}`;
};
