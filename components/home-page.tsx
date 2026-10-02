"use client";

import {
  AiBrowserIcon,
  BadgeCheckIcon,
  ChartIncreaseIcon,
  DeliveryTruck01Icon,
  MatchesIcon,
  RankingIcon,
  SeoIcon,
  Share01Icon,
  StarIcon,
  StoreLocation01Icon,
  Structure02Icon,
  Tick02Icon,
  UserMultipleIcon,
  WebValidationIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";

import { Icon } from "@/components/icon";
import { authClient } from "@/lib/auth-client";
import {
  getHomepageCheckGridGroups,
  HOMEPAGE_CHECK_COUNT,
} from "@/lib/home-checks-display";
import type { HomepageCheckGridIcon } from "@/lib/home-checks-display";
import { listwellChatHref } from "@/lib/listwell-routes";
import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
} from "@/lib/polar";
import { ONCE_RESCAN_WINDOW_DAYS } from "@/lib/scan-config";
import { clearChatSession, LISTWELL_PENDING_BUSINESS_KEY } from "@/lib/storage";

const homepageCheckGridGroups = getHomepageCheckGridGroups();

const homepageGroupIcons: Record<HomepageCheckGridIcon, IconSvgElement> = {
  "ai-visibility": AiBrowserIcon,
  "brand-consistency": MatchesIcon,
  "competitor-comparison": UserMultipleIcon,
  "food-delivery": DeliveryTruck01Icon,
  "google-business": StoreLocation01Icon,
  "local-search-research": RankingIcon,
  "on-page-seo": SeoIcon,
  "reviews-reputation": StarIcon,
  social: Share01Icon,
  "structured-data": Structure02Icon,
  technical: WebValidationIcon,
  "trends-monitoring": ChartIncreaseIcon,
};

type BillingPeriod = "monthly" | "yearly";

const HomePricingFeature = ({ children }: { children: ReactNode }) => (
  <li className="home-pricing__feature">
    <Icon
      aria-hidden
      className="home-pricing__feature-icon"
      color="var(--home-faint)"
      icon={Tick02Icon}
      size={16}
    />
    <span>{children}</span>
  </li>
);

const continuedDisplayPrice = (billing: BillingPeriod): string =>
  billing === "yearly"
    ? REPORT_YEARLY_PRICE.replace("/yr", "")
    : REPORT_MONTHLY_PRICE.replace("/mo per business", "");

const HomeFaq = () => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const onToggle = (event: Event) => {
      const { target } = event;
      if (!(target instanceof HTMLDetailsElement) || !target.open) {
        return;
      }
      for (const details of list.querySelectorAll("details")) {
        if (details !== target) {
          details.open = false;
        }
      }
    };

    list.addEventListener("toggle", onToggle, true);
    return () => {
      list.removeEventListener("toggle", onToggle, true);
    };
  }, []);

  return (
    <div className="home-faq">
      <h2 className="home-section__title">Questions? Answers.</h2>
      <div className="home-faq__list" ref={listRef}>
        <details>
          <summary>What is Listwell?</summary>
          <p>
            A visibility check for small businesses and agencies. You type a
            business name. Listwell finds listings, a website, and social
            profiles, then shows a basic report.
          </p>
        </details>
        <details>
          <summary>Is the basic report free?</summary>
          <p>
            Yes. The full report with fix steps is {REPORT_ONCE_PRICE} once.
          </p>
        </details>
        <details>
          <summary>Do I need an account to start?</summary>
          <p>
            No. Sign in with an email code when you want the business saved to
            an account.
          </p>
        </details>
        <details>
          <summary>How long does a check take?</summary>
          <p>Usually under 60 seconds.</p>
        </details>
        <details>
          <summary>What happens after a one-off report?</summary>
          <p>
            You can re-run it once for free within {ONCE_RESCAN_WINDOW_DAYS}{" "}
            days. Continued reports are {REPORT_MONTHLY_PRICE}, or{" "}
            {REPORT_YEARLY_PRICE} ({REPORT_YEARLY_VALUE_NOTE}). Listwell re-runs
            the check and emails you when the report is ready.
          </p>
        </details>
      </div>
    </div>
  );
};

const HomePricing = ({
  checkCount,
  onStartCheck,
}: {
  checkCount: number;
  onStartCheck: () => void;
}) => {
  const [billing, setBilling] = useState<BillingPeriod>("yearly");
  const monthlyTabId = useId();
  const yearlyTabId = useId();
  const continuedPanelId = useId();
  const monthlyTabRef = useRef<HTMLButtonElement>(null);
  const yearlyTabRef = useRef<HTMLButtonElement>(null);

  const continuedPrice = continuedDisplayPrice(billing);
  const continuedPriceNote =
    billing === "yearly" ? "a year, per business" : "a month, per business";

  const focusBillingTab = (period: BillingPeriod) => {
    (period === "monthly" ? monthlyTabRef : yearlyTabRef).current?.focus();
  };

  const onBillingTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    period: BillingPeriod
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next: BillingPeriod = period === "monthly" ? "yearly" : "monthly";
    setBilling(next);
    focusBillingTab(next);
  };

  return (
    <section
      aria-labelledby="home-pricing-title"
      className="home-section home-pricing"
      id="pricing"
    >
      <h2 className="home-pricing__sr-title" id="home-pricing-title">
        Pricing
      </h2>
      <div className="home-pricing__board">
        <div className="home-pricing__one-time">
          <article className="home-pricing__tier">
            <header className="home-pricing__tier-head">
              <h3 className="home-pricing__tier-name">Free</h3>
              <p className="home-pricing__tier-lede">
                For a quick read on how your business shows up online.
              </p>
            </header>
            <p className="home-pricing__price">Free</p>
            <p className="home-pricing__price-note">No card required</p>
            <ul className="home-pricing__features">
              <HomePricingFeature>Business name lookup</HomePricingFeature>
              <HomePricingFeature>Basic visibility summary</HomePricingFeature>
              <HomePricingFeature>
                Overview of {checkCount}+ audit checks
              </HomePricingFeature>
            </ul>
            <button
              className="home-button home-button--wash home-pricing__cta"
              onClick={onStartCheck}
              type="button"
            >
              Start free
            </button>
          </article>
          <article className="home-pricing__tier home-pricing__tier--featured">
            <header className="home-pricing__tier-head">
              <h3 className="home-pricing__tier-name">Full report</h3>
              <p className="home-pricing__tier-lede">
                For owners who want fix steps they can act on once.
              </p>
            </header>
            <p className="home-pricing__price">{REPORT_ONCE_PRICE}</p>
            <p className="home-pricing__price-note">once, per business</p>
            <ul className="home-pricing__features">
              <HomePricingFeature>Full audit with fix steps</HomePricingFeature>
              <HomePricingFeature>
                One free re-run within {ONCE_RESCAN_WINDOW_DAYS} days
              </HomePricingFeature>
              <HomePricingFeature>
                Competitor and listing detail in report
              </HomePricingFeature>
            </ul>
            <button
              className="home-button home-button--ink home-pricing__cta"
              onClick={onStartCheck}
              type="button"
            >
              Get full report
            </button>
          </article>
        </div>
        <div className="home-pricing__continued-row">
          <article className="home-pricing__tier home-pricing__tier--continued">
            <div className="home-pricing__continued-intro">
              <header className="home-pricing__tier-head home-pricing__continued-head">
                <h3 className="home-pricing__tier-name">Continued</h3>
                <p className="home-pricing__tier-lede">
                  For businesses that want scans, research, and trends on a
                  schedule.
                </p>
              </header>
              <div className="home-pricing__continued-billing">
                <div
                  aria-label="Billing period for continued reports"
                  className="home-pricing__tabs"
                  role="tablist"
                >
                  <button
                    aria-controls={continuedPanelId}
                    aria-selected={billing === "monthly"}
                    className="home-pricing__tab"
                    id={monthlyTabId}
                    onClick={() => {
                      setBilling("monthly");
                    }}
                    onKeyDown={(event) => {
                      onBillingTabKeyDown(event, "monthly");
                    }}
                    ref={monthlyTabRef}
                    role="tab"
                    tabIndex={billing === "monthly" ? 0 : -1}
                    type="button"
                  >
                    Monthly
                  </button>
                  <button
                    aria-controls={continuedPanelId}
                    aria-selected={billing === "yearly"}
                    className="home-pricing__tab"
                    id={yearlyTabId}
                    onClick={() => {
                      setBilling("yearly");
                    }}
                    onKeyDown={(event) => {
                      onBillingTabKeyDown(event, "yearly");
                    }}
                    ref={yearlyTabRef}
                    role="tab"
                    tabIndex={billing === "yearly" ? 0 : -1}
                    type="button"
                  >
                    Yearly
                  </button>
                </div>
                <div
                  aria-labelledby={
                    billing === "monthly" ? monthlyTabId : yearlyTabId
                  }
                  className="home-pricing__tabpanel"
                  id={continuedPanelId}
                  role="tabpanel"
                >
                  <p className="home-pricing__price home-pricing__price--unit">
                    <span className="home-pricing__price-amount">
                      {continuedPrice}
                    </span>
                    <span className="home-pricing__price-cadence">
                      {continuedPriceNote}
                    </span>
                    {billing === "yearly" ? (
                      <span className="home-pricing__price-aside">
                        {REPORT_YEARLY_VALUE_NOTE}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
            <div className="home-pricing__continued-detail">
              <div className="home-pricing__continued-offer">
                <div className="home-pricing__continued-features">
                  <ul className="home-pricing__features">
                    <HomePricingFeature>
                      Scheduled rescans about every 30 days
                    </HomePricingFeature>
                    <HomePricingFeature>
                      Email when each report is ready
                    </HomePricingFeature>
                    <HomePricingFeature>
                      Local search research and{" "}
                      <span className="home-pricing__nowrap">
                        month-on-month change
                      </span>
                    </HomePricingFeature>
                  </ul>
                </div>
                <button
                  className="home-button home-button--wash home-pricing__cta"
                  onClick={onStartCheck}
                  type="button"
                >
                  Get continued reports
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};

export const HomeLanding = ({
  onSend,
  rootId = "listwell-chat-root",
}: {
  onSend: (text: string) => void;
  rootId?: string | false;
}) => {
  const [value, setValue] = useState("");
  const composerFormRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const session = authClient.useSession();
  const signedIn = Boolean(session.data?.user);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
    const form = composerFormRef.current;
    if (form) {
      form.setAttribute(
        "tooldescription",
        "Start a free Listwell local and website SEO audit by business name"
      );
      form.setAttribute("toolname", "start_listing_audit");
    }
    const input = inputRef.current;
    if (input) {
      input.setAttribute(
        "toolparamdescription",
        "Legal or trading name of the business to look up on maps and the web"
      );
    }
  }, []);

  const focusComposer = () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    document.querySelector("#home-check")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    inputRef.current?.focus({ preventScroll: true });
  };

  const submitName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
  };

  return (
    <div className="home-landing" id={rootId === false ? undefined : rootId}>
      <header className="home-nav">
        <div className="home-nav__inner">
          <div className="home-nav__brand">
            <Link className="home-nav__product" href="/">
              <Icon
                aria-hidden
                color="var(--accent)"
                icon={BadgeCheckIcon}
                size={22}
              />
              <span className="home-nav__name">Listwell</span>
            </Link>
            <span className="home-nav__by">
              by{" "}
              <a
                className="home-nav__studio"
                href="https://obambulo.studio"
                rel="noopener noreferrer"
                target="_blank"
              >
                obambulo studio
              </a>
            </span>
          </div>
          <nav aria-label="Account" className="home-nav__actions">
            {signedIn ? (
              <Link className="home-button home-button--ink" href="/account">
                Account
              </Link>
            ) : (
              <Link
                className="home-button home-button--ink"
                href="/sign-in?return=/account"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="home-frame" id="top">
        <section className="home-hero">
          <div className="home-hero__lede">
            <h1 className="home-hero__headline">
              Your Google listing is probably wrong.
            </h1>
            <p className="home-hero__subline">
              Enter your business name and get a free report in under a minute.
            </p>
          </div>
          <div className="home-split">
            <button
              className="home-split__action"
              onClick={focusComposer}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                viewBox="0 0 16 16"
                width="16"
              >
                <path
                  d="M8 2.75v8.5M4.75 8.25 8 11.5l3.25-3.25"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              </svg>
              Get my free report
            </button>
            <a className="home-split__aside" href="#checks">
              <span className="home-split__title">What we check</span>
              <span className="home-split__price">
                {REPORT_ONCE_PRICE} once ·{" "}
                {REPORT_MONTHLY_PRICE.replace(" per business", "")}
              </span>
            </a>
          </div>
        </section>

        <section
          aria-label="Start a check"
          className="home-stage"
          id="home-check"
        >
          <div className="home-stage__panel">
            <form
              ref={composerFormRef}
              className="home-composer"
              onSubmit={submitName}
            >
              <label className="home-composer__label" htmlFor="home-business">
                What is your business called?
              </label>
              <div className="home-composer__field">
                <input
                  ref={inputRef}
                  autoCapitalize="none"
                  autoComplete="organization"
                  className="home-composer__input"
                  enterKeyHint="send"
                  id="home-business"
                  name="business"
                  onChange={(event) => {
                    setValue(event.currentTarget.value);
                  }}
                  placeholder="Willow Whip Gelato"
                  spellCheck={false}
                  value={value}
                />
                <button
                  className="home-button home-button--ink home-composer__send"
                  disabled={!canSend}
                  type="submit"
                >
                  Check
                </button>
              </div>
            </form>
          </div>
          <p className="home-stage__caption">
            Type a business name. Listwell looks up the listing and runs a free
            check.
          </p>
        </section>

        <section
          aria-label="What we check"
          className="home-section home-checks"
          id="checks"
        >
          <ul className="home-checks-grid">
            {homepageCheckGridGroups.map((group) => (
              <li className="home-checks-grid__cell" key={group.id}>
                <Icon
                  className="home-checks-grid__icon"
                  color="var(--home-ink)"
                  icon={homepageGroupIcons[group.icon]}
                  size={22}
                />
                <p className="home-checks-grid__copy">
                  <strong>{group.title}.</strong> {group.description}
                </p>
              </li>
            ))}
          </ul>
          <p className="home-checks__note">
            {HOMEPAGE_CHECK_COUNT} total checks
          </p>
        </section>

        <HomePricing
          checkCount={HOMEPAGE_CHECK_COUNT}
          onStartCheck={focusComposer}
        />

        <section className="home-section">
          <HomeFaq />
        </section>
      </div>
    </div>
  );
};

/** Marketing home: start a check by navigating to `/chat`. */
export const HomeRoute = () => {
  const { push } = useRouter();

  return (
    <HomeLanding
      onSend={(text) => {
        clearChatSession();
        window.sessionStorage.setItem(LISTWELL_PENDING_BUSINESS_KEY, text);
        push(listwellChatHref());
      }}
    />
  );
};
