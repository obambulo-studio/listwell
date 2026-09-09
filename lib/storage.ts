import { chatSessionSnapshotSchema } from "./chat-onboarding";
import type { ChatSessionSnapshot } from "./chat-onboarding";

const STORAGE_KEY = "listwell-businesses";
export const CHAT_SESSION_STORAGE_KEY = "listwell-chat-session";

const zStringArray = {
  parse(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new TypeError("Stored business ids must be an array");
    }
    return value.filter((item): item is string => typeof item === "string");
  },
};

export const getStoredBusinessIds = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed: unknown = JSON.parse(stored);
    return zStringArray.parse(parsed);
  } catch {
    return [];
  }
};

export const addBusinessId = (id: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const existing = getStoredBusinessIds();
  if (!existing.includes(id)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, id]));
  }
};

export const loadChatSession = (): ChatSessionSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed: unknown = JSON.parse(stored);
    const result = chatSessionSnapshotSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

export const saveChatSession = (snapshot: ChatSessionSnapshot): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      CHAT_SESSION_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore quota or privacy mode errors.
  }
};

export const clearChatSession = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
};
