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
