import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { listwellThirdPartyServices } from "@/lib/listwell-services";

export const metadata: Metadata = {
  description:
    "How Listwell is built and which third-party services the product calls.",
  title: "How it works",
};

const HowItWorksPage = () => {
  const services = listwellThirdPartyServices();

  return (
    <LegalPage title="How Listwell is built">
      <p className="listwell-legal__lede">
        Listwell is a Next.js app on Cloudflare Workers (vinext). Audits run in
        the Worker using the <code>@listwell/audit-engine</code> package.
        Accounts and saved data live in Convex. This page lists third-party
        services the code actually calls and what each one does.
      </p>

      <LegalSection title="Third-party services">
        <ul className="listwell-legal__list listwell-legal__list--services">
          {services.map((service) => (
            <li key={service.name}>
              <strong>{service.name}.</strong> {service.purpose}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="Optional keys">
        <p>
          Google Places, Apple MapKit, TinyFish Fetch, TypeSafe, and DataForSEO
          only run when the matching API keys are set on the Worker. Without
          those keys, Listwell falls back to other lookups or skips that
          feature.
        </p>
      </LegalSection>

      <LegalSection title="Privacy">
        <p>
          For what we collect and how these services handle personal
          information, see the <Link href="/privacy">Privacy policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
};

export default HowItWorksPage;
