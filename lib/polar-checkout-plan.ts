import { CheckoutPlanNotConfiguredError } from "./checkout-create-error";
import type { CheckoutPlan } from "./schema";

export interface CheckoutPolarProducts {
  productAnalytics100k: string | undefined;
  productAnalytics10k: string | undefined;
  productAnalytics1m: string | undefined;
  productReportMonthly: string | undefined;
  productReportOnce: string;
  productReportYearly: string | undefined;
}

export const resolveCheckoutProduct = (
  config: CheckoutPolarProducts,
  plan: CheckoutPlan,
  businessId: string
): { productId: string; returnPath: string } => {
  const analyticsReturnPath = `/account/analytics/${businessId}`;

  if (plan === "monthly") {
    const productId = config.productReportMonthly;
    if (!productId) {
      throw new CheckoutPlanNotConfiguredError(plan);
    }
    return { productId, returnPath: `/${businessId}` };
  }
  if (plan === "yearly") {
    const productId = config.productReportYearly;
    if (!productId) {
      throw new CheckoutPlanNotConfiguredError(plan);
    }
    return { productId, returnPath: `/${businessId}` };
  }
  if (plan === "analytics_10k") {
    const productId = config.productAnalytics10k;
    if (!productId) {
      throw new CheckoutPlanNotConfiguredError(plan);
    }
    return { productId, returnPath: analyticsReturnPath };
  }
  if (plan === "analytics_100k") {
    const productId = config.productAnalytics100k;
    if (!productId) {
      throw new CheckoutPlanNotConfiguredError(plan);
    }
    return { productId, returnPath: analyticsReturnPath };
  }
  if (plan === "analytics_1m") {
    const productId = config.productAnalytics1m;
    if (!productId) {
      throw new CheckoutPlanNotConfiguredError(plan);
    }
    return { productId, returnPath: analyticsReturnPath };
  }
  return { productId: config.productReportOnce, returnPath: `/${businessId}` };
};
