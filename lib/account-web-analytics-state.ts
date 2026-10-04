import { z } from "zod";

import { analyticsEntitlementKindSchema } from "./analytics-pricing";

export const accountWebAnalyticsStateSchema = z.object({
  activeKind: analyticsEntitlementKindSchema.nullable(),
  allowance: z.number(),
  enabled: z.boolean(),
  eventsThisMonth: z.number(),
  ingestKey: z.string().nullable(),
  month: z.string(),
});
export type AccountWebAnalyticsState = z.infer<
  typeof accountWebAnalyticsStateSchema
>;

export const fetchAccountWebAnalyticsState = async (
  businessId: string
): Promise<AccountWebAnalyticsState> => {
  const response = await fetch(
    `/api/account/analytics/${encodeURIComponent(businessId)}/state`,
    { credentials: "same-origin" }
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorSchema = z.object({ error: z.string() });
    const parsedError = errorSchema.safeParse(payload);
    throw new Error(
      parsedError.success ? parsedError.data.error : "Could not load analytics"
    );
  }
  return accountWebAnalyticsStateSchema.parse(payload);
};

export const setAccountWebAnalyticsEnabled = async (
  businessId: string,
  enabled: boolean
): Promise<AccountWebAnalyticsState> => {
  const response = await fetch(
    `/api/account/analytics/${encodeURIComponent(businessId)}/state`,
    {
      body: JSON.stringify({ enabled }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  const payload: unknown = await response.json();
  if (!response.ok) {
    const errorSchema = z.object({ error: z.string() });
    const parsedError = errorSchema.safeParse(payload);
    throw new Error(
      parsedError.success
        ? parsedError.data.error
        : "Could not update analytics"
    );
  }
  return accountWebAnalyticsStateSchema.parse(payload);
};
