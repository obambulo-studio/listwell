import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import {
  LISTWELL_CONTACT_URL,
  LISTWELL_OPERATOR,
  listwellServicesWithPersonalData,
} from "@/lib/listwell-services";

export const metadata: Metadata = {
  description:
    "How Listwell collects, uses, and stores personal information under the Privacy Act 1988 and the Australian Privacy Principles.",
  title: "Privacy",
};

const PrivacyPage = () => {
  const sharedServices = listwellServicesWithPersonalData();

  return (
    <LegalPage title="Privacy policy">
      <p className="listwell-legal__lede">
        This policy describes how {LISTWELL_OPERATOR} (trading as Listwell)
        handles personal information when you use
        listwell.dev. We aim to meet the Privacy Act 1988 (Cth) and the
        Australian Privacy Principles (APPs). This page is product copy, not
        legal advice.
      </p>
      <p className="listwell-legal__meta">Last updated: October 2026</p>

      <LegalSection title="Who we are">
        <p>
          Listwell is a local and website visibility audit for small businesses.
          {LISTWELL_OPERATOR} is the operator. For privacy questions, access
          requests, or corrections, contact us through{" "}
          <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
            {LISTWELL_CONTACT_URL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <ul className="listwell-legal__list">
          <li>
            <strong>Account:</strong> email address, optional display name, and
            session data when you sign in with a one-time code.
          </li>
          <li>
            <strong>Business details you provide:</strong> business name,
            suburb or location hints, website URL, listing URLs, social profile
            URLs, and address text used to match the right business.
          </li>
          <li>
            <strong>Scan and report data:</strong> check results, scores,
            summaries, research outputs on paid continued plans, and timestamps
            for runs and entitlements.
          </li>
          <li>
            <strong>Payment-related data:</strong> Polar processes card payments
            and tax details. Listwell receives order and subscription identifiers,
            product purchased, and the email Polar associates with the checkout.
            We do not store full card numbers.
          </li>
          <li>
            <strong>Email preferences:</strong> tokens used to manage monthly
            scan notification unsubscribe links.
          </li>
          <li>
            <strong>Technical data:</strong> IP address and request metadata
            needed to run the site, apply rate limits, and keep sessions secure.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we collect it">
        <ul className="listwell-legal__list">
          <li>To run audits and show reports you request.</li>
          <li>To save businesses to your account and re-run checks on a schedule for paid plans.</li>
          <li>To sign you in, send purchase receipts, and send optional scan-ready emails.</li>
          <li>To process payments and honour entitlements through Polar.</li>
          <li>To improve reliability, prevent abuse, and support customers.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <p>
          We use service providers that process data on our behalf to run
          Listwell. The main services that may handle personal information are:
        </p>
        <ul className="listwell-legal__list">
          {sharedServices.map((service) => (
            <li key={service.name}>
              <strong>{service.name}:</strong> {service.purpose}
            </li>
          ))}
        </ul>
        <p>
          Listwell also fetches public websites and social profile pages you
          point us to. That traffic goes to those sites, not through a separate
          analytics vendor.
        </p>
        <p>
          See also{" "}
          <Link href="/how-it-works">How it works</Link> for the same list in
          plain language.
        </p>
      </LegalSection>

      <LegalSection title="Overseas disclosure">
        <p>
          Some providers store or process data outside Australia even when you
          use Listwell from Australia. Based on our current stack:
        </p>
        <ul className="listwell-legal__list">
          <li>
            Convex production for Listwell is hosted in the Asia Pacific
            (Sydney) region.
          </li>
          <li>
            Cloudflare runs the app on its global network. Workers KV and audit
            job state may be held in Cloudflare infrastructure outside
            Australia.
          </li>
          <li>
            Polar (payments) and UseSend (email API) may process data in the
            United States or other countries where they operate.
          </li>
          <li>
            When configured, Google, Apple MapKit, TypeSafe, DataForSEO, and
            OpenStreetMap Nominatim may process lookup queries on servers
            outside Australia.
          </li>
        </ul>
        <p>
          Where the APPs require it, we take reasonable steps so overseas
          recipients handle personal information in line with this policy.
        </p>
      </LegalSection>

      <LegalSection title="Access and correction">
        <p>
          You may request access to or correction of personal information we
          hold about you. Contact us through{" "}
          <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
            {LISTWELL_CONTACT_URL}
          </a>
          . We will respond within a reasonable time. You can update some account
          details in Listwell after sign-in.
        </p>
      </LegalSection>

      <LegalSection title="Complaints">
        <p>
          If you have a privacy concern, contact us first through{" "}
          <a href={LISTWELL_CONTACT_URL} rel="noopener noreferrer">
            {LISTWELL_CONTACT_URL}
          </a>
          . If you are not satisfied with our response, you may lodge a complaint
          with the Office of the Australian Information Commissioner (OAIC) at{" "}
          <a href="https://www.oaic.gov.au" rel="noopener noreferrer">
            oaic.gov.au
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          We keep account and report data while your account is active and as
          needed to provide the service, meet legal obligations, and resolve
          disputes. Short-lived audit queue data in Cloudflare KV is discarded
          when no longer required for the job.
        </p>
      </LegalSection>
    </LegalPage>
  );
};

export default PrivacyPage;
