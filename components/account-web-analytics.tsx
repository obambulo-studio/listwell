"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { ButtonLink } from "@/components/atoms/button";
import {
  FormActions,
  PrimaryButton,
  QuietButton,
} from "@/components/listwell/actions";
import { ProfileBackLink } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchAccountWebAnalyticsState,
  setAccountWebAnalyticsEnabled,
} from "@/lib/account-web-analytics-state";
import type { AccountWebAnalyticsState } from "@/lib/account-web-analytics-state";
import {
  ANALYTICS_BANDS,
  ANALYTICS_FREE_EVENTS_PER_MONTH,
  analyticsBandByEntitlementKind,
  analyticsCheckoutPlanFromBand,
  formatEventLimit,
} from "@/lib/analytics-pricing";
import type { AnalyticsBandId } from "@/lib/analytics-pricing";
import { analyticsInstallSnippet } from "@/lib/analytics-snippet";
import { requestCheckoutUrl } from "@/lib/polar";
import { checkoutPlanSchema } from "@/lib/schema";

const sameAnalyticsState = (
  left: AccountWebAnalyticsState,
  right: AccountWebAnalyticsState
): boolean =>
  left.activeKind === right.activeKind &&
  left.allowance === right.allowance &&
  left.enabled === right.enabled &&
  left.eventsThisMonth === right.eventsThisMonth &&
  left.ingestKey === right.ingestKey &&
  left.month === right.month;

const WebAnalyticsDetails = ({
  availableBands,
  businessId,
  onState,
  paymentsEnabled,
  siteOrigin,
  state,
}: {
  availableBands: AnalyticsBandId[];
  businessId: string;
  onState: (state: AccountWebAnalyticsState) => void;
  paymentsEnabled: boolean;
  siteOrigin: string;
  state: AccountWebAnalyticsState;
}) => {
  const enableFieldId = useId();
  const [actionError, setActionError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);

  const activeBand = state.activeKind
    ? analyticsBandByEntitlementKind(state.activeKind)
    : null;
  const paused = state.eventsThisMonth >= state.allowance;
  const snippet =
    state.enabled && state.ingestKey
      ? analyticsInstallSnippet({
          businessId,
          ingestKey: state.ingestKey,
          siteOrigin,
        })
      : null;
  const higherBands = ANALYTICS_BANDS.filter(
    (band) => band.eventLimitPerMonth > state.allowance
  );

  const setEnabled = async (enabled: boolean) => {
    setActionError(null);
    setSavingEnabled(true);
    try {
      const next = await setAccountWebAnalyticsEnabled(businessId, enabled);
      onState(next);
      setSavingEnabled(false);
    } catch (error) {
      setSavingEnabled(false);
      setActionError(
        error instanceof Error ? error.message : "Could not update analytics"
      );
    }
  };

  const startCheckout = async (bandId: AnalyticsBandId) => {
    setActionError(null);
    setRedirecting(true);
    try {
      const plan = analyticsCheckoutPlanFromBand(bandId);
      checkoutPlanSchema.parse(plan);
      const url = await requestCheckoutUrl(businessId, plan);
      window.location.assign(url);
    } catch (error) {
      setRedirecting(false);
      setActionError(
        error instanceof Error ? error.message : "Could not start checkout"
      );
    }
  };

  return (
    <div className="listwell-panel__body listwell-panel__body--stack">
      <p className="text-foreground m-0 text-sm leading-relaxed">
        Events are counted for your account, not for each site. Turn a site on
        and its pageviews add to the account total. The first{" "}
        {formatEventLimit(ANALYTICS_FREE_EVENTS_PER_MONTH)} events each month
        are free. After that, you pay the monthly band that covers what you use.
      </p>
      <p className="text-foreground m-0 text-sm leading-relaxed">
        Account total this month ({state.month} UTC):{" "}
        <span className="listwell-panel__mono">
          {formatEventLimit(state.eventsThisMonth)}
        </span>{" "}
        of {formatEventLimit(state.allowance)}
      </p>
      {activeBand ? (
        <p className="text-foreground m-0 text-sm leading-relaxed">
          Plan: up to {formatEventLimit(activeBand.eventLimitPerMonth)} events a
          month ({activeBand.displayPrice}, GST inclusive).
        </p>
      ) : (
        <p className="text-foreground m-0 text-sm leading-relaxed">
          No paid plan yet. You are on the free{" "}
          {formatEventLimit(ANALYTICS_FREE_EVENTS_PER_MONTH)} events.
        </p>
      )}
      {paused ? (
        <output className="listwell-panel__note">
          Counting is paused until you raise the account limit.
        </output>
      ) : null}
      <div className="flex items-start gap-2">
        <input
          id={enableFieldId}
          type="checkbox"
          checked={state.enabled}
          disabled={savingEnabled || redirecting}
          onChange={(event) => {
            void setEnabled(event.target.checked);
          }}
        />
        <div>
          <label htmlFor={enableFieldId} className="text-sm">
            Count this site
          </label>
          <p className="listwell-panel__note">
            {state.enabled
              ? "This site is adding to your account total."
              : "Off. Pageviews from this site are not counted."}
          </p>
        </div>
      </div>
      {state.enabled && snippet ? (
        <div className="listwell-analytics-snippet">
          <p className="text-foreground m-0 text-sm leading-relaxed">
            Add this snippet before{" "}
            <code className="listwell-panel__mono">&lt;/head&gt;</code> on this
            site:
          </p>
          <pre className="listwell-analytics-snippet__code">
            <code>{snippet}</code>
          </pre>
        </div>
      ) : null}
      {state.enabled && !snippet ? (
        <p className="listwell-panel__note">
          Your tracking key is still being set up. Refresh in a moment.
        </p>
      ) : null}
      {higherBands.length > 0 ? (
        <>
          <p className="text-foreground m-0 text-sm leading-relaxed">
            Raise the account limit:
          </p>
          <ul className="listwell-analytics-bands">
            {higherBands.map((band) => {
              const configured = availableBands.includes(band.bandId);
              return (
                <li key={band.bandId} className="listwell-analytics-bands__row">
                  <span className="listwell-analytics-bands__label">
                    {formatEventLimit(band.eventLimitPerMonth)} events / month
                  </span>
                  <span className="listwell-analytics-bands__price">
                    {band.displayPrice}
                  </span>
                  {configured && paymentsEnabled ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={redirecting || savingEnabled}
                      onClick={() => {
                        void startCheckout(band.bandId);
                      }}
                    >
                      Choose plan
                    </Button>
                  ) : (
                    <span className="listwell-panel__note">Not available</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {actionError ? (
        <p className="listwell-panel__error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
};

export const AccountWebAnalytics = ({
  availableBands,
  businessId,
  businessName,
  checkoutReturned,
  paymentsEnabled,
  siteOrigin,
  state: serverState,
}: {
  availableBands: AnalyticsBandId[];
  businessId: string;
  businessName: string;
  checkoutReturned: boolean;
  paymentsEnabled: boolean;
  siteOrigin: string;
  state: AccountWebAnalyticsState;
}) => {
  const router = useRouter();
  const [state, setState] = useState(serverState);
  if (!sameAnalyticsState(state, serverState)) {
    setState(serverState);
  }

  return (
    <section className="listwell-page">
      <ProfileBackLink />
      <div className="listwell-panel">
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">Web analytics</h1>
          <p className="listwell-panel__text">{businessName}</p>
        </div>
        {checkoutReturned ? (
          <output className="listwell-panel__note">
            Thanks. Your plan should appear here in a moment. Refresh if it does
            not.
          </output>
        ) : null}
        <WebAnalyticsDetails
          availableBands={availableBands}
          businessId={businessId}
          paymentsEnabled={paymentsEnabled}
          siteOrigin={siteOrigin}
          state={state}
          onState={setState}
        />
        <div className="listwell-panel__foot">
          <ButtonLink href={`/${businessId}`} variant="secondary">
            View report
          </ButtonLink>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              router.refresh();
            }}
          >
            Refresh counts
          </Button>
        </div>
      </div>
    </section>
  );
};

const WebAnalyticsManageDialogBody = ({
  availableBands,
  businessId,
  businessName,
  onClose,
  paymentsEnabled,
  siteOrigin,
}: {
  availableBands: AnalyticsBandId[];
  businessId: string;
  businessName: string;
  onClose: () => void;
  paymentsEnabled: boolean;
  siteOrigin: string;
}) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<AccountWebAnalyticsState | null>(null);

  const loadState = async () => {
    const next = await fetchAccountWebAnalyticsState(businessId);
    setState(next);
    setLoadError(null);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchAccountWebAnalyticsState(businessId);
        if (!cancelled) {
          setState(next);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load analytics"
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Web analytics</DialogTitle>
        <DialogDescription className="text-foreground leading-relaxed">
          {businessName}
        </DialogDescription>
      </DialogHeader>
      {loading ? (
        <p className="text-muted-foreground m-0 text-sm">Loading…</p>
      ) : null}
      {loadError ? (
        <p className="listwell-panel__error" role="alert">
          {loadError}
        </p>
      ) : null}
      {state ? (
        <WebAnalyticsDetails
          availableBands={availableBands}
          businessId={businessId}
          paymentsEnabled={paymentsEnabled}
          siteOrigin={siteOrigin}
          state={state}
          onState={setState}
        />
      ) : null}
      <FormActions className="justify-end pt-0">
        <QuietButton
          disabled={loading || refreshing}
          type="button"
          onClick={() => {
            void (async () => {
              setRefreshing(true);
              try {
                await loadState();
                setRefreshing(false);
              } catch (error) {
                setRefreshing(false);
                setLoadError(
                  error instanceof Error
                    ? error.message
                    : "Could not load analytics"
                );
              }
            })();
          }}
        >
          Refresh counts
        </QuietButton>
        <PrimaryButton type="button" onClick={onClose}>
          Done
        </PrimaryButton>
      </FormActions>
    </>
  );
};

export const WebAnalyticsManageDialog = ({
  availableBands,
  businessId,
  businessName,
  open,
  onOpenChange,
  paymentsEnabled,
  siteOrigin,
}: {
  availableBands: AnalyticsBandId[];
  businessId: string;
  businessName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentsEnabled: boolean;
  siteOrigin: string;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      {open ? (
        <WebAnalyticsManageDialogBody
          availableBands={availableBands}
          businessId={businessId}
          businessName={businessName}
          paymentsEnabled={paymentsEnabled}
          siteOrigin={siteOrigin}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);
