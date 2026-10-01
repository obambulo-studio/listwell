import { describe, expect, it } from "vitest";

import {
  entitlementCheckoutRetryPath,
  fixStepsWithoutPayment,
  isPaymentsIntentionallyDisabled,
  reportResearchChrome,
  reportShowsFixSteps,
  reportShowsPurchasePrices,
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
