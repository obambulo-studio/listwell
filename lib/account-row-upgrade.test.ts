import { describe, expect, it } from "vitest";

import type { AccountUpgradeCatalog } from "./account-row-upgrade";
import {
  accountReportIsUpgraded,
  accountRowShowsUpgrade,
  reportCheckoutAvailabilityFromPolarProducts,
  reportCheckoutPlansFromCatalog,
  upgradeCatalogFromEntitlement,
} from "./account-row-upgrade";
import { checkoutPlanSchema, entitlementStateSchema } from "./schema";

const catalog: AccountUpgradeCatalog = {
  availableAnalyticsBands: ["10k"],
  fixStepsWithoutPayment: false,
  monthlyAvailable: true,
  paymentsEnabled: true,
  yearlyAvailable: true,
};

describe(reportCheckoutAvailabilityFromPolarProducts, () => {
  it("enables yearly when POLAR yearly product is configured", () => {
    expect(
      reportCheckoutAvailabilityFromPolarProducts({
        productReportMonthly: "prod_month",
        productReportYearly: "prod_year",
      })
    ).toStrictEqual({
      monthlyAvailable: true,
      yearlyAvailable: true,
    });
  });

  it("defaults yearly off when the yearly product id is missing", () => {
    expect(
      reportCheckoutAvailabilityFromPolarProducts({
        productReportMonthly: "prod_month",
      })
    ).toStrictEqual({
      monthlyAvailable: true,
      yearlyAvailable: false,
    });
  });
});

describe(reportCheckoutPlansFromCatalog, () => {
  it("lists once, yearly, then monthly when products are configured", () => {
    expect(reportCheckoutPlansFromCatalog(catalog)).toStrictEqual([
      checkoutPlanSchema.parse("once"),
      checkoutPlanSchema.parse("yearly"),
      checkoutPlanSchema.parse("monthly"),
    ]);
  });

  it("omits yearly when the yearly product is not sold", () => {
    expect(
      reportCheckoutPlansFromCatalog({
        monthlyAvailable: true,
        yearlyAvailable: false,
      })
    ).toStrictEqual([
      checkoutPlanSchema.parse("once"),
      checkoutPlanSchema.parse("monthly"),
    ]);
  });
});

describe(upgradeCatalogFromEntitlement, () => {
  it("maps entitlement flags into the account upgrade catalog", () => {
    expect(
      upgradeCatalogFromEntitlement(
        entitlementStateSchema.parse({
          fixStepsWithoutPayment: false,
          monthlyAvailable: true,
          paymentsEnabled: true,
          unlocked: false,
          yearlyAvailable: true,
        })
      )
    ).toStrictEqual({
      availableAnalyticsBands: [],
      fixStepsWithoutPayment: false,
      monthlyAvailable: true,
      paymentsEnabled: true,
      yearlyAvailable: true,
    });
  });
});

describe("account row upgrade", () => {
  it("shows upgrade for preview owned businesses when payments are on", () => {
    expect(
      accountRowShowsUpgrade({
        catalog,
        owned: true,
        plan: "preview",
      })
    ).toBeTruthy();
  });

  it("hides upgrade when the report plan is already paid", () => {
    expect(
      accountRowShowsUpgrade({
        catalog,
        owned: true,
        plan: "once",
      })
    ).toBeFalsy();
  });

  it("hides upgrade when fix steps are waived", () => {
    expect(
      accountRowShowsUpgrade({
        catalog: { ...catalog, fixStepsWithoutPayment: true },
        owned: true,
        plan: "preview",
      })
    ).toBeFalsy();
  });

  it("treats unlocked rows as upgraded", () => {
    expect(
      accountReportIsUpgraded({ plan: "preview", unlocked: true })
    ).toBeTruthy();
  });

  it("treats preview rows without unlock as not upgraded", () => {
    expect(
      accountReportIsUpgraded({ plan: "preview", unlocked: false })
    ).toBeFalsy();
  });
});
