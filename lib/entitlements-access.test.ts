import { describe, expect, it } from "vitest";

import {
  entitlementCheckoutRetryPath,
  entitlementIsPurchaserBound,
  fixStepsWithoutPayment,
  isPaymentsIntentionallyDisabled,
  ownerCanRescan,
  reportCanManagePlan,
  reportResearchChrome,
  reportSessionRequired,
  reportShowsFixSteps,
  reportShowsPurchasePrices,
  rescanCallerIsOwner,
  sharedViewerEntitlementState,
} from "./entitlements-access";
import { entitlementStateSchema } from "./schema";

const access = (
  patch: Partial<ReturnType<typeof entitlementStateSchema.parse>>
) =>
  entitlementStateSchema.parse({
    paymentsEnabled: true,
    unlocked: false,
    ...patch,
  });

describe(isPaymentsIntentionallyDisabled, () => {
  it("accepts 1 and true", () => {
    expect(
      isPaymentsIntentionallyDisabled({ listwellPaymentsDisabled: "1" })
    ).toBeTruthy();
    expect(
      isPaymentsIntentionallyDisabled({ listwellPaymentsDisabled: "true" })
    ).toBeTruthy();
  });

  it("rejects other values", () => {
    expect(
      isPaymentsIntentionallyDisabled({ listwellPaymentsDisabled: "0" })
    ).toBeFalsy();
    expect(isPaymentsIntentionallyDisabled({})).toBeFalsy();
  });
});

describe(fixStepsWithoutPayment, () => {
  it("never waives when Polar is configured", () => {
    expect(
      fixStepsWithoutPayment({
        intentionallyDisabled: true,
        nodeEnv: "development",
        polarConfigured: true,
      })
    ).toBeFalsy();
  });

  it("waives in development without Polar", () => {
    expect(
      fixStepsWithoutPayment({
        intentionallyDisabled: false,
        nodeEnv: "development",
        polarConfigured: false,
      })
    ).toBeTruthy();
  });

  it("does not waive in production without Polar unless intentional", () => {
    expect(
      fixStepsWithoutPayment({
        intentionallyDisabled: false,
        nodeEnv: "production",
        polarConfigured: false,
      })
    ).toBeFalsy();
    expect(
      fixStepsWithoutPayment({
        intentionallyDisabled: true,
        nodeEnv: "production",
        polarConfigured: false,
      })
    ).toBeTruthy();
  });
});

describe(reportShowsFixSteps, () => {
  it("shows fix steps when waived without payment", () => {
    expect(
      reportShowsFixSteps(
        access({ fixStepsWithoutPayment: true, unlocked: false })
      )
    ).toBeTruthy();
  });

  it("shows fix steps when unlocked and session not required", () => {
    expect(
      reportShowsFixSteps(
        access({ fixStepsWithoutPayment: false, unlocked: true })
      )
    ).toBeTruthy();
  });

  it("hides fix steps when locked and not waived", () => {
    expect(
      reportShowsFixSteps(
        access({ fixStepsWithoutPayment: false, unlocked: false })
      )
    ).toBeFalsy();
  });

  it("hides fix steps when session is required", () => {
    expect(
      reportShowsFixSteps(
        access({
          fixStepsWithoutPayment: false,
          sessionRequired: true,
          unlocked: true,
        })
      )
    ).toBeFalsy();
  });
});

describe(reportShowsPurchasePrices, () => {
  it("shows prices when the business is still unpaid", () => {
    expect(reportShowsPurchasePrices(access({ unlocked: false }))).toBeTruthy();
  });

  it("hides prices after purchase", () => {
    expect(reportShowsPurchasePrices(access({ unlocked: true }))).toBeFalsy();
  });

  it("hides prices when fix steps are free or payments are off", () => {
    expect(
      reportShowsPurchasePrices(
        access({ fixStepsWithoutPayment: true, unlocked: false })
      )
    ).toBeFalsy();
    expect(
      reportShowsPurchasePrices(
        access({ paymentsEnabled: false, unlocked: false })
      )
    ).toBeFalsy();
    expect(
      reportShowsPurchasePrices(
        access({ backendAvailable: false, unlocked: false })
      )
    ).toBeFalsy();
  });
});

describe(reportCanManagePlan, () => {
  it("shows the portal for an owner on a monthly or yearly subscription", () => {
    expect(
      reportCanManagePlan(
        access({ kind: "report_monthly", unlocked: true }),
        true
      )
    ).toBeTruthy();
  });

  it("shows the portal for a one-off buyer so they can upgrade", () => {
    expect(
      reportCanManagePlan(access({ kind: "report_once", unlocked: true }), true)
    ).toBeTruthy();
  });

  it("hides the portal from a shared or signed-out one-off viewer", () => {
    expect(
      reportCanManagePlan(
        access({ kind: "report_once", unlocked: true }),
        false
      )
    ).toBeFalsy();
    expect(
      reportCanManagePlan(
        access({
          kind: "report_once",
          sessionRequired: true,
          unlocked: true,
        }),
        true
      )
    ).toBeFalsy();
  });

  it("hides the portal from a shared viewer", () => {
    expect(
      reportCanManagePlan(
        access({ kind: "report_monthly", unlocked: true }),
        false
      )
    ).toBeFalsy();
  });

  it("hides the portal when this viewer is not the signed-in purchaser", () => {
    expect(
      reportCanManagePlan(
        access({
          kind: "report_monthly",
          sessionRequired: true,
          unlocked: true,
        }),
        true
      )
    ).toBeFalsy();
  });

  it("hides the portal when billing is not configured", () => {
    expect(
      reportCanManagePlan(
        access({
          kind: "report_monthly",
          paymentsEnabled: false,
          unlocked: true,
        }),
        true
      )
    ).toBeFalsy();
  });
});

describe(ownerCanRescan, () => {
  it("allows unlimited rescans for a monthly or yearly owner", () => {
    expect(
      ownerCanRescan({
        access: access({ kind: "report_monthly", unlocked: true }),
        isOwner: true,
      })
    ).toBeTruthy();
  });

  it("allows one rescan on a one-off report while it is still available", () => {
    expect(
      ownerCanRescan({
        access: access({
          kind: "report_once",
          onceRescan: {
            available: true,
            remaining: 1,
            windowEndsAt: "2026-10-31T00:00:00.000Z",
          },
          unlocked: true,
        }),
        isOwner: true,
      })
    ).toBeTruthy();
  });

  it("hides a one-off rescan after the free rescan is used", () => {
    expect(
      ownerCanRescan({
        access: access({
          kind: "report_once",
          onceRescan: {
            available: false,
            remaining: 0,
            windowEndsAt: null,
          },
          unlocked: true,
        }),
        isOwner: true,
      })
    ).toBeFalsy();
  });

  it("hides rescan from a shared viewer", () => {
    expect(
      ownerCanRescan({
        access: access({ kind: "report_monthly", unlocked: true }),
        isOwner: false,
      })
    ).toBeFalsy();
  });

  it("hides rescan when the viewer must sign in as the purchaser", () => {
    expect(
      ownerCanRescan({
        access: access({
          kind: "report_monthly",
          sessionRequired: true,
          unlocked: true,
        }),
        isOwner: true,
      })
    ).toBeFalsy();
  });
});

describe(entitlementIsPurchaserBound, () => {
  it("treats an email or Polar order without a user as purchaser-bound", () => {
    expect(
      entitlementIsPurchaserBound({
        polarOrderId: null,
        purchaserEmail: "bob@example.com",
        userId: null,
      })
    ).toBeTruthy();
    expect(
      entitlementIsPurchaserBound({
        polarOrderId: "ord_1",
        purchaserEmail: null,
        userId: null,
      })
    ).toBeTruthy();
  });

  it("is not bound once a user is linked or nothing identifies a purchaser", () => {
    expect(
      entitlementIsPurchaserBound({
        polarOrderId: "ord_1",
        purchaserEmail: "bob@example.com",
        userId: "purchaser",
      })
    ).toBeFalsy();
    expect(
      entitlementIsPurchaserBound({
        polarOrderId: null,
        purchaserEmail: null,
        userId: null,
      })
    ).toBeFalsy();
    expect(
      entitlementIsPurchaserBound({
        polarOrderId: "",
        purchaserEmail: "",
        userId: null,
      })
    ).toBeFalsy();
  });
});

describe(reportSessionRequired, () => {
  it("requires a session while the purchase is bound to an email and not a user", () => {
    expect(
      reportSessionRequired({
        authEnabled: true,
        ownerUserId: null,
        purchaserBound: true,
        sessionUserId: "business-owner",
        unlocked: true,
      })
    ).toBeTruthy();
  });

  it("does not require a session for the linked purchaser", () => {
    expect(
      reportSessionRequired({
        authEnabled: true,
        ownerUserId: "purchaser",
        purchaserBound: false,
        sessionUserId: "purchaser",
        unlocked: true,
      })
    ).toBeFalsy();
  });

  it("still requires a session when a different user is signed in", () => {
    expect(
      reportSessionRequired({
        authEnabled: true,
        ownerUserId: "purchaser",
        purchaserBound: false,
        sessionUserId: "business-owner",
        unlocked: true,
      })
    ).toBeTruthy();
  });
});

describe(rescanCallerIsOwner, () => {
  it("allows the purchaser when the business row belongs to someone else", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: "business-owner",
        entitlementOwnerId: "purchaser",
        purchaserBound: false,
        sessionUserId: "purchaser",
      })
    ).toBeTruthy();
  });

  it("rejects a signed-out caller", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: null,
        entitlementOwnerId: "purchaser",
        purchaserBound: false,
        sessionUserId: null,
      })
    ).toBeFalsy();
  });

  it("rejects a signed-in user who is not the purchaser", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: "business-owner",
        entitlementOwnerId: "purchaser",
        purchaserBound: false,
        sessionUserId: "business-owner",
      })
    ).toBeFalsy();
  });

  it("allows the business owner when nothing identifies a purchaser", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: "business-owner",
        entitlementOwnerId: null,
        purchaserBound: false,
        sessionUserId: "business-owner",
      })
    ).toBeTruthy();
  });

  it("rejects the business owner of an unlinked monthly or yearly purchase", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: "business-owner",
        entitlementOwnerId: null,
        purchaserBound: true,
        sessionUserId: "business-owner",
      })
    ).toBeFalsy();
  });

  it("rejects a signed-out caller of an unlinked purchase", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: "business-owner",
        entitlementOwnerId: null,
        purchaserBound: true,
        sessionUserId: null,
      })
    ).toBeFalsy();
  });

  it("rejects a signed-in user when neither record is theirs", () => {
    expect(
      rescanCallerIsOwner({
        businessOwnerId: null,
        entitlementOwnerId: null,
        purchaserBound: false,
        sessionUserId: "someone",
      })
    ).toBeFalsy();
  });
});

describe(sharedViewerEntitlementState, () => {
  it("never exposes purchaser unlock or account hints", () => {
    const viewer = sharedViewerEntitlementState(
      access({
        backendAvailable: false,
        fixStepsWithoutPayment: false,
        kind: "report_monthly",
        maskedEmail: "o***@example.com",
        unlocked: true,
      })
    );
    expect(viewer.unlocked).toBeFalsy();
    expect(viewer.kind).toBeNull();
    expect(viewer.maskedEmail).toBeNull();
    expect(viewer.backendAvailable).toBeTruthy();
    expect(reportShowsFixSteps(viewer)).toBeFalsy();
  });

  it("still honours dev payment waivers for fix steps", () => {
    const viewer = sharedViewerEntitlementState(
      access({ fixStepsWithoutPayment: true, unlocked: true })
    );
    expect(reportShowsFixSteps(viewer)).toBeTruthy();
  });
});

describe(reportResearchChrome, () => {
  it("shows research on a share without the phrases editor or fix steps", () => {
    const viewer = sharedViewerEntitlementState(
      access({ kind: "report_monthly", unlocked: true })
    );
    expect(
      reportResearchChrome({
        isOwner: false,
        researchVisible: true,
        showFixSteps: reportShowsFixSteps(viewer),
      })
    ).toStrictEqual({
      fixSteps: false,
      phrasesEditor: false,
      research: true,
    });
  });
});

describe(entitlementCheckoutRetryPath, () => {
  it("builds the checkout confirm URL", () => {
    expect(entitlementCheckoutRetryPath("chk_1", "biz_1")).toBe(
      "/api/auth/checkout/chk_1/biz_1"
    );
  });
});
