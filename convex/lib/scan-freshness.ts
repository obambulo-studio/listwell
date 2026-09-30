const PLACE_ID_PREFIX = /^places\//u;
const WWW_PREFIX = /^www\./u;

/** Public check runs for the same place or website are reused inside this window. */
export const SCAN_REUSE_WINDOW_MS = 60 * 60 * 1000;

/** A running claim blocks a second run for a few minutes, then a stuck row can be replaced. */
export const RUNNING_CLAIM_WINDOW_MS = 3 * 60 * 1000;

export type SnapshotStatus = "running" | "complete" | "error";

export interface SnapshotClock {
  finishedAt: string | null;
  startedAt: string;
  status: SnapshotStatus;
}

const elapsedMs = (iso: string | null, now: number): number | null => {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return now - parsed;
};

const isFreshComplete = (row: SnapshotClock, now: number): boolean => {
  if (row.status !== "complete") {
    return false;
  }
  const age = elapsedMs(row.finishedAt, now);
  return age !== null && age >= 0 && age < SCAN_REUSE_WINDOW_MS;
};

const isFreshRunning = (row: SnapshotClock, now: number): boolean => {
  if (row.status !== "running") {
    return false;
  }
  const age = elapsedMs(row.startedAt, now);
  return age !== null && age >= 0 && age < RUNNING_CLAIM_WINDOW_MS;
};

/**
 * Newest rows first. A finished snapshot under an hour old wins.
 * `forceFresh` ignores that snapshot so a paid re-scan can replace it.
 * Errors are not reused.
 */
export const selectReusableSnapshot = <T extends SnapshotClock>(input: {
  forceFresh: boolean;
  now: number;
  rows: readonly T[];
}): T | null => {
  if (input.forceFresh) {
    return null;
  }
  const complete = input.rows.find((row) => isFreshComplete(row, input.now));
  if (complete) {
    return complete;
  }
  return input.rows.find((row) => isFreshRunning(row, input.now)) ?? null;
};

const normalizeWebsiteKey = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(WWW_PREFIX, "");
  if (host.length === 0) {
    return null;
  }
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path === "/") {
    path = "";
  }
  return `${host}${path}`;
};

export const scanFingerprint = (business: {
  locations: readonly { googlePlaceId?: string | null }[];
  websiteUrl?: string | null;
}): string | null => {
  for (const location of business.locations) {
    const placeId = (location.googlePlaceId ?? "")
      .trim()
      .replace(PLACE_ID_PREFIX, "");
    if (placeId.length > 0) {
      return `place:${placeId}`;
    }
  }
  if (!business.websiteUrl) {
    return null;
  }
  const site = normalizeWebsiteKey(business.websiteUrl);
  return site ? `site:${site}` : null;
};
