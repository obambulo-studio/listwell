/** Rolling interval between scheduled monthly scans (matches billing cadence). */
export const SCAN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Score drop (percentage points) that triggers a stronger alert email. */
export const SCORE_DROP_ALERT_POINTS = 10;

/** Organic rank fall, in places, that triggers the same alert. */
export const ORGANIC_RANK_DROP_ALERT_PLACES = 5;

/** One-off purchasers may re-run their report this many times within the window. */
export const ONCE_RESCAN_FREE_LIMIT = 1;

/** Days after purchase during which the free one-off re-scan is available. */
export const ONCE_RESCAN_WINDOW_DAYS = 30;

export const onceRescanWindowMs = (): number =>
  ONCE_RESCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
