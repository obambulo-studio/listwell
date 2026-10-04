"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ButtonLink } from "@/components/atoms/button";
import { ProfileBackLink } from "@/components/profile-form";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_BANDS,
  analyticsBandByEntitlementKind,
  analyticsCheckoutPlanFromBand,
  formatEventLimit,
} from "@/lib/analytics-pricing";
import type {
  AnalyticsBandId,
  AnalyticsEntitlementKind,
} from "@/lib/analytics-pricing";
import { analyticsInstallSnippet } from "@/lib/analytics-snippet";
import { requestCheckoutUrl } from "@/lib/polar";
import { checkoutPlanSchema } from "@/lib/schema";

interface AccountWebAnalyticsProps {
  availableBands: AnalyticsBandId[];
  businessId: string;
  businessName: string;
  checkoutReturned: boolean;
  paymentsEnabled: boolean;
  siteOrigin: string;
  state: {
    activeKind: AnalyticsEntitlementKind | null;
    eventsThisMonth: number;
    ingestKey: string | null;
    month: string;
  };
}

export const AccountWebAnalytics = ({
  availableBands,
  businessId,
  businessName,
  checkoutReturned,
  paymentsEnabled,
  siteOrigin,
  state,
}: AccountWebAnalyticsProps) => {
  const router = useRouter();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const activeBand = state.activeKind
    ? analyticsBandByEntitlementKind(state.activeKind)
    : null;

  const startCheckout = async (bandId: AnalyticsBandId) => {
    setCheckoutError(null);
    setRedirecting(true);
    try {
      const plan = analyticsCheckoutPlanFromBand(bandId);
      checkoutPlanSchema.parse(plan);
      const url = await requestCheckoutUrl(businessId, plan);
      window.location.assign(url);
    } catch (error) {
      setRedirecting(false);
      setCheckoutError(
        error instanceof Error ? error.message : "Could not start checkout"
      );
    }
  };

  const snippet =
    state.ingestKey && activeBand
      ? analyticsInstallSnippet({
          businessId,
          ingestKey: state.ingestKey,
          siteOrigin,
        })
      : null;

  return (
    <section className="listwell-page">
      <ProfileBackLink />
      <div className="listwell-panel">
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">Web analytics</h1>
          <p className="listwell-panel__text">{businessName}</p>
        </div>

        <div className="listwell-panel__body listwell-panel__body--stack">
          {checkoutReturned ? (
            <output className="listwell-panel__note">
              Thanks. Your add-on should appear here in a moment. Refresh if it
              does not.
            </output>
          ) : null}

          {activeBand ? (
            <>
              <p className="listwell-panel__text">
                Plan: up to {formatEventLimit(activeBand.eventLimitPerMonth)}{" "}
                events per month ({activeBand.displayPrice}, GST inclusive).
              </p>
              <p className="listwell-panel__text">
                Events this month ({state.month} UTC):{" "}
                <span className="listwell-panel__mono">
                  {formatEventLimit(state.eventsThisMonth)}
                </span>
              </p>
              {snippet ? (
                <div className="listwell-analytics-snippet">
                  <p className="listwell-panel__text">
                    Add this snippet before{" "}
                    <code className="listwell-panel__mono">&lt;/head&gt;</code>{" "}
                    on your site:
                  </p>
                  <pre className="listwell-analytics-snippet__code">
                    <code>{snippet}</code>
                  </pre>
                </div>
              ) : (
                <p className="listwell-panel__note">
                  Your tracking key is still being set up. Refresh in a moment.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="listwell-panel__text">
                Lightweight pageview counting for this business. Billed
                separately from your visibility report. Pick a monthly event
                band:
              </p>
              <ul className="listwell-analytics-bands">
                {ANALYTICS_BANDS.map((band) => {
                  const configured = availableBands.includes(band.bandId);
                  return (
                    <li
                      key={band.bandId}
                      className="listwell-analytics-bands__row"
                    >
                      <span className="listwell-analytics-bands__label">
                        {formatEventLimit(band.eventLimitPerMonth)} events /
                        month
                      </span>
                      <span className="listwell-analytics-bands__price">
                        {band.displayPrice}
                      </span>
                      {configured && paymentsEnabled ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={redirecting}
                          onClick={() => startCheckout(band.bandId)}
                        >
                          Choose plan
                        </Button>
                      ) : (
                        <span className="listwell-panel__note">
                          Not available
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {checkoutError ? (
            <p className="listwell-panel__note" role="alert">
              {checkoutError}
            </p>
          ) : null}
        </div>

        <div className="listwell-panel__foot">
          <ButtonLink href={`/${businessId}`} variant="secondary">
            View report
          </ButtonLink>
          {activeBand ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
            >
              Refresh counts
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
