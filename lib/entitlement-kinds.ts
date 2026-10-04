import { z } from "zod";

import {
  analyticsEntitlementKindSchema,
  isAnalyticsEntitlementKind,
} from "./analytics-pricing";
import { entitlementKindSchema } from "./schema";
import type { EntitlementKind } from "./schema";

export { isAnalyticsEntitlementKind };

export const reportEntitlementKindSchema = z.enum([
  "report_once",
  "report_monthly",
]);
export type ReportEntitlementKind = z.infer<typeof reportEntitlementKindSchema>;

export const isReportEntitlementKind = (
  kind: string
): kind is ReportEntitlementKind =>
  reportEntitlementKindSchema.safeParse(kind).success;

export type AnalyticsEntitlementKind = z.infer<
  typeof analyticsEntitlementKindSchema
>;

export const parseEntitlementKind = (kind: string): EntitlementKind =>
  entitlementKindSchema.parse(kind);
