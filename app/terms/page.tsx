import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  LISTWELL_CONTACT_URL,
  LISTWELL_OPERATOR,
} from "@/lib/listwell-services";

export const metadata: Metadata = {
  description: "Terms of use for the Listwell website and audit service.",
  title: "Terms",
};

const TermsPage = () => (
  <LegalPage title="Terms of use">
    <p className="listwell-legal__lede">
      These terms apply when you use listwell.dev and related Listwell services
      operated by {LISTWELL_OPERATOR}. By using Listwell you agree to these
      terms. This page is product copy, not legal advice.
    </p>
    <p className="listwell-legal__meta">Last updated: October 2026</p>

    <LegalSection title="The service">
      <p>
        Listwell runs automated checks on public listings, websites, and
        profiles you identify. Reports are informational. They are not legal,
        financial, or professional advice. You remain responsible for business
        decisions you make from a report.
      </p>
    </LegalSection>

    <LegalSection title="Accounts">
      <p>
        Sign-in uses a one-time code sent to your email. Keep access to that
        inbox secure. You are responsible for activity under your account.
      </p>
    </LegalSection>

    <LegalSection title="Acceptable use">
      <ul className="listwell-legal__list">
        <li>
          Only run checks for businesses you own, manage, or have permission to
          review.
        </li>
        <li>Do not probe, scrape, or overload Listwell systems.</li>
        <li>
          Do not misuse share links or attempt to access other users&apos; data.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="Paid reports">
      <p>
        Prices and plan features are shown on the site and at checkout. Payment
        is handled by Polar. Refunds and cancellations are described in the{" "}
        <Link href="/refunds">Refund policy</Link>.
      </p>
    </LegalSection>

    <LegalSection title="Intellectual property">
      <p>
        Listwell software, branding, and report presentation are owned by{" "}
        {LISTWELL_OPERATOR} or its licensors. You may use reports for your own
        business purposes. Do not resell or republish Listwell reports as a
        competing service without permission.
      </p>
    </LegalSection>

    <LegalSection title="Availability">
      <p>
        We aim for reliable service but do not guarantee uninterrupted access.
        Checks depend on third-party sites and APIs that may change or
        rate-limit requests. Optional features only run when the relevant API
        keys are configured.
      </p>
    </LegalSection>

    <LegalSection title="Liability">
      <p>
        To the extent permitted by law, {LISTWELL_OPERATOR} is not liable for
        indirect loss or loss arising from reliance on a report. Nothing here
        excludes guarantees that cannot be excluded under the Australian
        Consumer Law.
      </p>
    </LegalSection>

    <LegalSection title="Changes">
      <p>
        We may update these terms or the service. We will post the current terms
        on this page with an updated date.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions about these terms:{" "}
        <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
          {LISTWELL_CONTACT_URL}
        </a>
        . Privacy: <Link href="/privacy">Privacy policy</Link>.
      </p>
    </LegalSection>
  </LegalPage>
);

export default TermsPage;
