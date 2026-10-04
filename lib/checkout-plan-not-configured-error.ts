import type { CheckoutPlan } from "./schema";

export class CheckoutPlanNotConfiguredError extends Error {
  readonly plan: CheckoutPlan;

  constructor(plan: CheckoutPlan) {
    super(`Checkout plan not configured: ${plan}`);
    this.name = "CheckoutPlanNotConfiguredError";
    this.plan = plan;
  }
}
