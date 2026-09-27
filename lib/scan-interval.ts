import { SCAN_INTERVAL_MS } from "./scan-config";

export const nextScanAtFrom = (date: Date): string =>
  new Date(date.getTime() + SCAN_INTERVAL_MS).toISOString();
