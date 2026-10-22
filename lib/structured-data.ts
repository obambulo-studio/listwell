import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
} from "@/lib/polar";
import { listwellSiteUrl } from "@/lib/site-metadata";

const AUD_AMOUNT_PATTERN = /A\$(?<amount>\d+(?:\.\d+)?)/u;

/** Reads the numeric amount from a display price such as "A$4.99/mo". */
export const audAmount = (displayPrice: string): string => {
  const amount = AUD_AMOUNT_PATTERN.exec(displayPrice)?.groups?.amount;
  if (!amount) {
    throw new Error(`No AUD amount in price: ${displayPrice}`);
  }
  return amount.includes(".") ? amount : `${amount}.00`;
};

const PUBLISHER_NAME = "obambulo studio";
const PUBLISHER_URL = "https://obambulo.studio";

const reportOffers = (origin: string) => [
  {
    "@type": "Offer",
    description: "Full report with fix steps for one business, paid once.",
    name: "Full report",
    price: audAmount(REPORT_ONCE_PRICE),
    priceCurrency: "AUD",
    url: `${origin}/`,
  },
  {
    "@type": "Offer",
    description: "Monthly re-check and report for one business.",
    name: "Monthly reports",
    price: audAmount(REPORT_MONTHLY_PRICE),
    priceCurrency: "AUD",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      billingDuration: "P1M",
      price: audAmount(REPORT_MONTHLY_PRICE),
      priceCurrency: "AUD",
      unitCode: "MON",
    },
    url: `${origin}/`,
  },
  {
    "@type": "Offer",
    description: "Yearly re-checks and reports for one business.",
    name: "Yearly reports",
    price: audAmount(REPORT_YEARLY_PRICE),
    priceCurrency: "AUD",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      billingDuration: "P1Y",
      price: audAmount(REPORT_YEARLY_PRICE),
      priceCurrency: "AUD",
      unitCode: "ANN",
    },
    url: `${origin}/`,
  },
];

/** Organization, WebSite and SoftwareApplication JSON-LD for the home page. */
export const homeStructuredData = (origin = listwellSiteUrl()) => {
  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;
  const publisher = {
    "@type": "Organization",
    name: PUBLISHER_NAME,
    url: PUBLISHER_URL,
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": organizationId,
        "@type": "Organization",
        logo: `${origin}/logo.png`,
        name: "Listwell",
        parentOrganization: publisher,
        url: `${origin}/`,
      },
      {
        "@id": websiteId,
        "@type": "WebSite",
        inLanguage: "en-AU",
        name: "Listwell",
        publisher: { "@id": organizationId },
        url: `${origin}/`,
      },
      {
        "@type": "SoftwareApplication",
        applicationCategory: "BusinessApplication",
        creator: publisher,
        description:
          "Local and website SEO audit for small businesses. Free basic check, then a full report with fix steps.",
        name: "Listwell",
        offers: reportOffers(origin),
        operatingSystem: "Web",
        publisher: { "@id": organizationId },
        url: `${origin}/`,
      },
    ],
  };
};

/** Serialises JSON-LD for a script tag, escaping "<" so it cannot close the tag. */
export const jsonLdScriptContent = (data: unknown): string =>
  JSON.stringify(data).replaceAll("<", String.raw`\u003c`);
