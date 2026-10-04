import { z } from "zod";

import { chatSessionSnapshotSchema } from "./chat-onboarding";
import type { ChatSessionSnapshot } from "./chat-onboarding";

const STORAGE_KEY = "listwell-businesses";
export const CHAT_SESSION_STORAGE_KEY = "listwell-chat-session";
/** Set on marketing home before navigating to `/chat` for the crossfade entry. */
export const LISTWELL_PENDING_BUSINESS_KEY = "listwell-pending-business-name";

export const LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY =
  "listwell-account-background-scan";

export const LISTWELL_CHAT_SESSION_EVENT = "listwell:chat-session";

export interface AccountBackgroundScanState {
  businessId?: string;
  businessName: string;
  status: "running";
}

const accountBackgroundScanSchema = z.object({
  businessId: z.string().min(1).optional(),
  businessName: z.string().min(1),
  status: z.literal("running"),
});

const zStringArray = {
  parse(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new TypeError("Stored business ids must be an array");
    }
    return value.filter((item): item is string => typeof item === "string");
  },
};

const readLocalJson = (key: string): unknown | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return null;
    }
    return JSON.parse(stored) as unknown;
  } catch {
    return null;
  }
};

export const getStoredBusinessIds = (): string[] => {
  const parsed = readLocalJson(STORAGE_KEY);
  if (!parsed) {
    return [];
  }
  try {
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
  const parsed = readLocalJson(CHAT_SESSION_STORAGE_KEY);
  if (!parsed) {
    return null;
  }
  const result = chatSessionSnapshotSchema.safeParse(parsed);
  return result.success ? result.data : null;
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
    window.dispatchEvent(new Event(LISTWELL_CHAT_SESSION_EVENT));
  } catch {
    // Ignore quota or privacy mode errors.
  }
};

export const clearChatSession = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(LISTWELL_CHAT_SESSION_EVENT));
};

export const takePendingBusinessName = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(LISTWELL_PENDING_BUSINESS_KEY);
  if (!raw) {
    return null;
  }
  window.sessionStorage.removeItem(LISTWELL_PENDING_BUSINESS_KEY);
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const hasPendingBusinessName = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    window.sessionStorage.getItem(LISTWELL_PENDING_BUSINESS_KEY)?.trim()
  );
};

/** True when a saved chat has progress worth restoring on `/chat`. */
export const isRestorableChatSession = (
  snapshot: Pick<ChatSessionSnapshot, "phase" | "messages">
): boolean =>
  snapshot.phase !== "business_name" ||
  snapshot.messages.length > 1 ||
  Boolean(snapshot.messages[0]?.userAnswer);

export const LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT =
  "listwell:account-background-scan";

export const LISTWELL_ACCOUNT_SCAN_COMPLETE_EVENT =
  "listwell:account-scan-complete";

const accountScanCompleteDetailSchema = z.object({
  businessId: z.string().min(1),
});

export const notifyAccountScanComplete = (businessId: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = businessId.trim();
  if (!trimmed) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(LISTWELL_ACCOUNT_SCAN_COMPLETE_EVENT, {
      detail: accountScanCompleteDetailSchema.parse({ businessId: trimmed }),
    })
  );
};

export const parseAccountScanCompleteDetail = (
  detail: unknown
): { businessId: string } | null => {
  const parsed = accountScanCompleteDetailSchema.safeParse(detail);
  return parsed.success ? parsed.data : null;
};

export const readAccountBackgroundScan =
  (): AccountBackgroundScanState | null => {
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
      const parsed = accountBackgroundScanSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

export const startAccountBackgroundScan = (businessName: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = businessName.trim();
  if (!trimmed) {
    return;
  }
  clearChatSession();
  const state: AccountBackgroundScanState = {
    businessName: trimmed,
    status: "running",
  };
  window.sessionStorage.setItem(
    LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY,
    JSON.stringify(state)
  );
  window.dispatchEvent(new Event(LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT));
};

export const noteAccountBackgroundScanBusiness = (businessId: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const current = readAccountBackgroundScan();
  const trimmed = businessId.trim();
  if (!current || !trimmed || current.businessId === trimmed) {
    return;
  }
  const next: AccountBackgroundScanState = {
    ...current,
    businessId: trimmed,
  };
  window.sessionStorage.setItem(
    LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY,
    JSON.stringify(next)
  );
  window.dispatchEvent(new Event(LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT));
};

export const clearAccountBackgroundScan = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(LISTWELL_ACCOUNT_BACKGROUND_SCAN_KEY);
  window.dispatchEvent(new Event(LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT));
};
