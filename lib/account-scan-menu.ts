import { accountPlanSchema } from "./schema";
import type { AccountPlan } from "./schema";

export const accountScanMenuFlags = (input: {
  monthlyScansAvailable: boolean;
  plan: AccountPlan;
}): {
  canAddMonthlyScans: boolean;
  canCancelMonthlyScans: boolean;
} => {
  const plan = accountPlanSchema.parse(input.plan);
  return {
    canAddMonthlyScans: input.monthlyScansAvailable && plan !== "monthly",
    canCancelMonthlyScans: plan === "monthly",
  };
};
