import type { EntitlementState } from "./schema";

const truthyEnv = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

export const isPaymentsIntentionallyDisabled = (env: {
  listwellPaymentsDisabled?: string;
}): boolean => truthyEnv(env.listwellPaymentsDisabled);

/** Fix steps are free only when Polar is off on purpose, not when prod secrets are missing. */
export const fixStepsWithoutPayment = (input: {
  polarConfigured: boolean;
  intentionallyDisabled: boolean;
  nodeEnv: string;
}): boolean => {
  if (input.polarConfigured) {
    return false;
  }
  if (input.intentionallyDisabled) {
    return true;
  }
  return input.nodeEnv !== "production";
};

export const reportShowsFixSteps = (access: EntitlementState): boolean =>
  access.fixStepsWithoutPayment || (access.unlocked && !access.sessionRequired);

export const entitlementCheckoutRetryPath = (
  checkoutId: string,
  businessId: string
): string => `/api/auth/checkout/${checkoutId}/${businessId}`;
