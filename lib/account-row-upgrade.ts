import { z } from "zod";

import { analyticsBandIdSchema } from "./analytics-pricing";
import type { AnalyticsBandId } from "./analytics-pricing";
import {
  accountPlanSchema,
  accountReportSchema,
  checkoutPlanSchema,
} from "./schema";
import type { CheckoutPlan, EntitlementState } from "./schema";

export const accountUpgradeCatalogSchema = z.object({
  availableAnalyticsBands: z.array(analyticsBandIdSchema),
  fixStepsWithoutPayment: z.boolean(),
  monthlyAvailable: z.boolean(),
  paymentsEnabled: z.boolean(),
  yearlyAvailable: z.boolean(),
});
export type AccountUpgradeCatalog = z.infer<typeof accountUpgradeCatalogSchema>;

/** Polar report product IDs → upgrade dialog availability (account + shared viewer). */
export const reportCheckoutAvailabilityFromPolarProducts = (
  products:
    | {
        productReportMonthly?: string | undefined;
        productReportYearly?: string | undefined;
      }
    | null
    | undefined
): Pick<AccountUpgradeCatalog, "monthlyAvailable" | "yearlyAvailable"> => ({
  monthlyAvailable: Boolean(products?.productReportMonthly),
  yearlyAvailable: Boolean(products?.productReportYearly),
});

/** Checkout plans shown in upgrade dialogs (once, then yearly, then monthly). */
export const reportCheckoutPlansFromCatalog = (
  catalog: Pick<AccountUpgradeCatalog, "monthlyAvailable" | "yearlyAvailable">
): CheckoutPlan[] => {
  const plans: CheckoutPlan[] = [checkoutPlanSchema.parse("once")];
  if (catalog.yearlyAvailable) {
    plans.push(checkoutPlanSchema.parse("yearly"));
  }
  if (catalog.monthlyAvailable) {
    plans.push(checkoutPlanSchema.parse("monthly"));
  }
  return plans;
};

/** Polar catalog fields available on a live report entitlement. */
export const upgradeCatalogFromEntitlement = (
  access: EntitlementState,
  availableAnalyticsBands: AnalyticsBandId[] = []
): AccountUpgradeCatalog =>
  accountUpgradeCatalogSchema.parse({
    availableAnalyticsBands,
    fixStepsWithoutPayment: access.fixStepsWithoutPayment,
    monthlyAvailable: access.monthlyAvailable,
    paymentsEnabled: access.paymentsEnabled,
    yearlyAvailable: access.yearlyAvailable,
  });

const accountRowUpgradeInputSchema = z.object({
  catalog: accountUpgradeCatalogSchema,
  owned: z.boolean(),
  plan: accountPlanSchema,
});

/**
 * Full report purchase is still available for this owned business row.
 * Uses plan (not row `unlocked`) because account rows mark history access
 * unlocked for lapsed monthly plans while the plan stays on preview.
 */
export const accountRowShowsUpgrade = (
  input: z.input<typeof accountRowUpgradeInputSchema>
): boolean => {
  const parsed = accountRowUpgradeInputSchema.parse(input);
  const { catalog, owned, plan } = parsed;
  return (
    owned &&
    accountPlanSchema.parse(plan) === "preview" &&
    catalog.paymentsEnabled &&
    !catalog.fixStepsWithoutPayment
  );
};

export const accountReportIsUpgraded = (
  report: Pick<z.infer<typeof accountReportSchema>, "plan" | "unlocked">
): boolean => {
  const row = accountReportSchema
    .pick({ plan: true, unlocked: true })
    .parse(report);
  if (row.unlocked) {
    return true;
  }
  return accountPlanSchema.parse(row.plan) !== "preview";
};
