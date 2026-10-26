// Storage keys and the chat-session reset, kept free of schema imports so the
// marketing home and the root layout don't pull the chat onboarding code.

export const CHAT_SESSION_STORAGE_KEY = "listwell-chat-session";
/** Set on marketing home before navigating to `/chat` for the crossfade entry. */
export const LISTWELL_PENDING_BUSINESS_KEY = "listwell-pending-business-name";

export const LISTWELL_CHAT_SESSION_EVENT = "listwell:chat-session";

export const clearChatSession = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(LISTWELL_CHAT_SESSION_EVENT));
};

/** Session flag for an audit that keeps running after the account page closes. */
export const LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY =
  "listwell-account-background-scan";

export const LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT =
  "listwell:account-background-scan";

const isRunningBackgroundScan = (
  value: object
): value is { businessName: string; status: "running" } =>
  "businessName" in value &&
  "status" in value &&
  value.status === "running" &&
  typeof value.businessName === "string" &&
  value.businessName.trim().length > 0;

/**
 * Business name for a background scan in this tab.
 * Kept here so the shell can decide whether to load the chat bundle.
 */
export const activeAccountBackgroundScanName = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(
      LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY
    );
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    if (!isRunningBackgroundScan(parsed)) {
      return null;
    }
    return parsed.businessName.trim();
  } catch {
    return null;
  }
};
