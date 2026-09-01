const STORAGE_KEY = "listwell-businesses";

export function getStoredBusinessIds(): string[] {
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
}

export function addBusinessId(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const existing = getStoredBusinessIds();
  if (!existing.includes(id)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, id]));
  }
}

const zStringArray = {
  parse(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new Error("Stored business ids must be an array");
    }
    return value.filter((item): item is string => typeof item === "string");
  },
};
