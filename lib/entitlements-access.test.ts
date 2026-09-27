import { describe, expect, it } from "vitest";

import {
  entitlementCheckoutRetryPath,
  fixStepsWithoutPayment,
  isPaymentsIntentionallyDisabled,
  reportShowsFixSteps,
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

describe(entitlementCheckoutRetryPath, () => {
  it("builds the checkout confirm URL", () => {
    expect(entitlementCheckoutRetryPath("chk_1", "biz_1")).toBe(
      "/api/auth/checkout/chk_1/biz_1"
    );
  });
});
