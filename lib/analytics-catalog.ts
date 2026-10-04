import type { AnalyticsBandId } from "./analytics-pricing";
import { getPolarConfig } from "./polar-server";

export const configuredAnalyticsBandIds = async (): Promise<AnalyticsBandId[]> => {
  const config = await getPolarConfig();
  if (!config) {
    return [];
  }
  const bands: AnalyticsBandId[] = [];
  if (config.productAnalytics10k) {
    bands.push("10k");
  }
  if (config.productAnalytics100k) {
    bands.push("100k");
  }
  if (config.productAnalytics1m) {
    bands.push("1m");
  }
  return bands;
};
