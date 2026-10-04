import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { LISTWELL_CONTACT_URL, LISTWELL_OPERATOR } from "@/lib/listwell-services";
import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
  REPORT_YEARLY_VALUE_NOTE,
} from "@/lib/polar";
import { ONCE_RESCAN_WINDOW_DAYS } from "@/lib/scan-config";

export const metadata: Metadata = {
  description:
    "Refund and cancellation terms for Listwell report purchases and subscriptions.",
  title: "Refunds",
};

const RefundsPage = () => (
  <LegalPage title="Refund policy">
    <p className="listwell-legal__lede">
      This policy explains how refunds and cancellations work for paid Listwell
      reports. Prices below match the live product. Polar is the merchant of
      record for card payments.
    </p>
    <p className="listwell-legal__meta">Last updated: October 2026</p>

    <LegalSection title="What you can buy">
      <ul className="listwell-legal__list">
        <li>
          <strong>Free basic report:</strong> no charge.
        </li>
        <li>
          <strong>Full report (once):</strong> {REPORT_ONCE_PRICE} for fix
          steps and a one-off unlock for that business.
        </li>
        <li>
          <strong>Continued reports (monthly):</strong> {REPORT_MONTHLY_PRICE}.
          Listwell re-runs the check about every 30 days and emails you when the
          report is ready.
        </li>
        <li>
          <strong>Continued reports (yearly):</strong> {REPORT_YEARLY_PRICE} (
          {REPORT_YEARLY_VALUE_NOTE}). Same continued entitlement as monthly,
          billed once per year per business.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="One-off full report">
      <p>
        After you pay {REPORT_ONCE_PRICE}, you receive access to the full report
        for that business. You may re-run the report once for free within{" "}
        {ONCE_RESCAN_WINDOW_DAYS} days of purchase. After that window, another
        full run requires a new purchase or a continued plan.
      </p>
      <p>
        If a technical fault on our side stops you from accessing a report you
        paid for, contact us through{" "}
        <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
          {LISTWELL_CONTACT_URL}
        </a>{" "}
        and we will fix access or discuss a refund.
      </p>
    </LegalSection>

    <LegalSection title="Subscriptions">
      <p>
        Monthly and yearly plans renew through Polar until you cancel. Cancelling
        stops future charges. You keep access for the period you have already paid
        for unless Polar or Listwell revokes access after a refund or chargeback.
      </p>
      <p>
        Manage billing through the Polar customer portal linked from your
        Listwell account when available.
      </p>
    </LegalSection>

    <LegalSection title="Refunds">
      <p>
        Polar processes payments and may issue refunds according to its policies
        and applicable law. When a payment is refunded through Polar, Listwell
        revokes the related paid entitlement for that business.
      </p>
      <p>
        Nothing in this policy limits your rights under the Australian Consumer
        Law, including when a paid report is not supplied as described. Contact{" "}
        {LISTWELL_OPERATOR} through{" "}
        <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
          {LISTWELL_CONTACT_URL}
        </a>{" "}
        if something went wrong with your purchase.
      </p>
    </LegalSection>

    <LegalSection title="Related pages">
      <p>
        See <Link href="/terms">Terms of use</Link> and{" "}
        <Link href="/privacy">Privacy policy</Link> for general service terms and
        data handling.
      </p>
    </LegalSection>
  </LegalPage>
);

export default RefundsPage;
