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

/**
 * Monthly and yearly checkouts both grant `report_monthly`, and those owners
 * can rescan without the one-off limit. A one-off report keeps its single
 * rescan inside the purchase window.
 */
export const ownerCanRescan = (input: {
  access: EntitlementState;
  isOwner: boolean;
}): boolean => {
  if (
    !input.isOwner ||
    !input.access.unlocked ||
    input.access.sessionRequired
  ) {
    return false;
  }
  if (input.access.kind === "report_monthly") {
    return true;
  }
  return (
    input.access.kind === "report_once" &&
    input.access.onceRescan?.available === true
  );
};

const presentPurchaseId = (value: string | null): boolean =>
  value !== null && value.length > 0;

/**
 * An active purchase that names a purchaser email or Polar order, but is not
 * linked to a Listwell user yet, belongs to that purchaser.
 */
export const entitlementIsPurchaserBound = (input: {
  polarOrderId: string | null;
  purchaserEmail: string | null;
  userId: string | null;
}): boolean =>
  input.userId === null &&
  (presentPurchaseId(input.purchaserEmail) ||
    presentPurchaseId(input.polarOrderId));

/**
 * Require the purchaser's session once a user is linked, and also while the
 * purchase is only bound to an email or Polar order.
 */
export const reportSessionRequired = (input: {
  authEnabled: boolean;
  ownerUserId: string | null;
  purchaserBound: boolean;
  sessionUserId: string | null;
  unlocked: boolean;
}): boolean => {
  if (!input.authEnabled || !input.unlocked) {
    return false;
  }
  if (input.purchaserBound) {
    return true;
  }
  return (
    input.ownerUserId !== null && input.sessionUserId !== input.ownerUserId
  );
};

/**
 * The signed-in purchaser may rescan. The business row can still point at
 * another user after purchase, so that id is not the owner check.
 * A purchaser-bound entitlement with no user yet does not fall back to the
 * business owner. When nothing identifies a purchaser, only the business
 * owner may call.
 */
export const rescanCallerIsOwner = (input: {
  businessOwnerId: string | null;
  entitlementOwnerId: string | null;
  purchaserBound: boolean;
  sessionUserId: string | null;
}): boolean => {
  if (!input.sessionUserId) {
    return false;
  }
  if (input.entitlementOwnerId) {
    return input.sessionUserId === input.entitlementOwnerId;
  }
  if (input.purchaserBound) {
    return false;
  }
  return input.sessionUserId === input.businessOwnerId;
};

/** Prices sit under the score while this business still needs a purchase. */
export const reportShowsPurchasePrices = (access: EntitlementState): boolean =>
  access.backendAvailable &&
  access.paymentsEnabled &&
  !access.fixStepsWithoutPayment &&
  !access.unlocked;

/**
 * Polar customer portal for the signed-in owner.
 * Monthly and yearly checkouts are both stored as `report_monthly`.
 * A one-off buyer can open the same portal to upgrade.
 */
export const reportCanManagePlan = (
  access: EntitlementState,
  isOwner: boolean
): boolean =>
  isOwner &&
  access.paymentsEnabled &&
  !access.sessionRequired &&
  (access.kind === "report_monthly" || access.kind === "report_once");

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
