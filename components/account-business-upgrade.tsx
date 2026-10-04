"use client";

import { useState } from "react";

import { MonthlyScansUpgradeDialog } from "@/components/chat-report-insight";
import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { LoadingSpinner } from "@/components/listwell/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { reportCheckoutPlansFromCatalog } from "@/lib/account-row-upgrade";
import type { AccountUpgradeCatalog } from "@/lib/account-row-upgrade";
import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
  requestCheckoutUrl,
} from "@/lib/polar";
import { checkoutPlanSchema } from "@/lib/schema";
import type { CheckoutPlan } from "@/lib/schema";
import { cn } from "@/lib/utils";

const offerRowClass =
  "h-auto min-h-11 w-full min-w-0 shrink-0 justify-between gap-3 whitespace-normal px-3 py-2 text-left text-sm leading-snug";

const OfferChoice = ({
  detail,
  loading,
  price,
  title,
}: {
  detail?: string;
  loading?: boolean;
  price?: string;
  title: string;
}) => (
  <span className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
    <span className="col-start-1 row-start-1 inline-flex items-center gap-2">
      {loading ? <LoadingSpinner size="sm" /> : null}
      {title}
    </span>
    {price ? (
      <span className="col-start-2 row-start-1 text-right tabular-nums">
        {price}
      </span>
    ) : null}
    {detail ? (
      <span className="col-start-2 row-start-2 text-right font-normal">
        {detail}
      </span>
    ) : null}
  </span>
);
const planOfferCopy = (
  plan: CheckoutPlan
): { detail?: string; price?: string; title: string } => {
  const once = checkoutPlanSchema.parse("once");
  const yearly = checkoutPlanSchema.parse("yearly");
  const monthly = checkoutPlanSchema.parse("monthly");
  if (plan === once) {
    return {
      price: `${REPORT_ONCE_PRICE} once`,
      title: "Full report",
    };
  }
  if (plan === yearly) {
    return {
      detail: REPORT_YEARLY_VALUE_NOTE,
      price: REPORT_YEARLY_PRICE,
      title: "Best value",
    };
  }
  if (plan === monthly) {
    return {
      price: REPORT_MONTHLY_PRICE,
      title: "Monthly scans",
    };
  }
  return { title: "Checkout" };
};

export const AccountBusinessUpgradeDialog = ({
  businessId,
  businessName,
  catalog,
  open,
  onOpenChange,
  resetKey = 0,
}: {
  businessId: string;
  businessName: string;
  catalog: AccountUpgradeCatalog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetKey?: number;
}) => {
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const monthlyPlan = checkoutPlanSchema.parse("monthly");
  const oncePlan = checkoutPlanSchema.parse("once");
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>(oncePlan);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<CheckoutPlan | null>(null);

  const plans = reportCheckoutPlansFromCatalog(catalog);

  const [appliedResetKey, setAppliedResetKey] = useState(resetKey);

  if (resetKey !== appliedResetKey) {
    setAppliedResetKey(resetKey);
    setCheckoutError(null);
    setSelectedPlan(oncePlan);
  }

  const startCheckout = async (plan: CheckoutPlan) => {
    setCheckoutError(null);
    setRedirecting(plan);
    try {
      const url = await requestCheckoutUrl(businessId, plan, {
        returnTo: "account",
      });
      window.location.assign(url);
    } catch (error) {
      setRedirecting(null);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout failed"
      );
    }
  };

  const continueUpgrade = () => {
    if (selectedPlan === monthlyPlan) {
      setCheckoutError(null);
      setMonthlyOpen(true);
      return;
    }
    void startCheckout(selectedPlan);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (redirecting === null) {
            onOpenChange(nextOpen);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upgrade {businessName}</DialogTitle>
            <DialogDescription className="text-foreground leading-relaxed">
              Unlock the full report with fix steps. Choose how you want to pay.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="vbg-visually-hidden">Report prices</legend>
            {plans.map((plan) => {
              const copy = planOfferCopy(plan);
              return (
                <Button
                  key={plan}
                  type="button"
                  variant={selectedPlan === plan ? "default" : "secondary"}
                  className={cn(offerRowClass, "font-normal")}
                  disabled={redirecting !== null}
                  aria-pressed={selectedPlan === plan}
                  onClick={() => {
                    setSelectedPlan(plan);
                  }}
                >
                  <OfferChoice
                    detail={copy.detail}
                    loading={redirecting === plan}
                    price={copy.price}
                    title={copy.title}
                  />
                </Button>
              );
            })}
          </fieldset>
          {checkoutError && !monthlyOpen ? (
            <p className="listwell-panel__error" role="alert">
              {checkoutError}
            </p>
          ) : null}
          <FormActions className="justify-end pt-0">
            <QuietButton
              disabled={redirecting !== null}
              type="button"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Not now
            </QuietButton>
            <PrimaryButton
              disabled={redirecting !== null}
              loading={redirecting !== null}
              type="button"
              onClick={continueUpgrade}
            >
              Continue to checkout
            </PrimaryButton>
          </FormActions>
        </DialogContent>
      </Dialog>
      <MonthlyScansUpgradeDialog
        busy={redirecting === monthlyPlan}
        error={checkoutError}
        open={monthlyOpen}
        onConfirm={() => {
          void startCheckout(monthlyPlan);
        }}
        onOpenChange={(nextOpen) => {
          if (redirecting === null) {
            setMonthlyOpen(nextOpen);
          }
        }}
      />
    </>
  );
};

export const AccountBusinessUpgradeButton = ({
  businessId,
  businessName,
  catalog,
}: {
  businessId: string;
  businessName: string;
  catalog: AccountUpgradeCatalog;
}) => {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeResetKey, setUpgradeResetKey] = useState(0);

  return (
    <>
      <button
        type="button"
        className="listwell-account-row__upgrade"
        onClick={() => {
          setUpgradeResetKey((current) => current + 1);
          setUpgradeOpen(true);
        }}
      >
        Upgrade
      </button>
      <AccountBusinessUpgradeDialog
        businessId={businessId}
        businessName={businessName}
        catalog={catalog}
        open={upgradeOpen}
        resetKey={upgradeResetKey}
        onOpenChange={setUpgradeOpen}
      />
    </>
  );
};
