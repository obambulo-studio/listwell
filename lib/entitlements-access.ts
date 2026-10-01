import type { EntitlementState } from "./schema";
import { entitlementStateSchema } from "./schema";

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

/** Prices sit under the score while this business still needs a purchase. */
export const reportShowsPurchasePrices = (access: EntitlementState): boolean =>
  access.backendAvailable &&
  access.paymentsEnabled &&
  !access.fixStepsWithoutPayment &&
  !access.unlocked;

/** Continued research stays visible on a share even though the viewer plan is cleared. */
export const monthlyResearchVisible = (
  entitlement: {
    kind: EntitlementState["kind"];
    status: "active" | "revoked";
  } | null
): boolean =>
  entitlement?.kind === "report_monthly" && entitlement.status === "active";

export const reportResearchChrome = (input: {
  isOwner: boolean;
  researchVisible: boolean;
  showFixSteps: boolean;
}): { fixSteps: boolean; phrasesEditor: boolean; research: boolean } => ({
  fixSteps: input.showFixSteps,
  phrasesEditor: input.isOwner && input.researchVisible,
  research: input.researchVisible,
});

/** Read-only share links never inherit the purchaser's unlock state. */
export const sharedViewerEntitlementState = (
  access: EntitlementState
): EntitlementState =>
  entitlementStateSchema.parse({
    ...access,
    backendAvailable: true,
    kind: null,
    maskedEmail: null,
    sessionRequired: false,
    unlocked: false,
  });

export const entitlementCheckoutRetryPath = (
  checkoutId: string,
  businessId: string
): string => `/api/auth/checkout/${checkoutId}/${businessId}`;
