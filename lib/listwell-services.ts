/** Third-party services Listwell calls in production code (optional keys noted). */

export interface ListwellThirdPartyService {
  /** Shown on the how-it-works page and referenced in the privacy policy when relevant. */
  handlesPersonalInformation: boolean;
  name: string;
  purpose: string;
}

export const LISTWELL_OPERATOR = "obambulo studio";

export const LISTWELL_CONTACT_URL = "https://obambulo.studio";

export const listwellThirdPartyServices = (): ListwellThirdPartyService[] => [
  {
    handlesPersonalInformation: true,
    name: "Cloudflare",
    purpose:
      "Hosts the Listwell website and API on Workers, stores short-lived audit job state in Workers KV, and may fetch some website pages through Browser Rendering.",
  },
  {
    handlesPersonalInformation: true,
    name: "Convex",
    purpose:
      "Stores account data, saved businesses, scan results, entitlements, and billing linkage in a deployment hosted in the Asia Pacific (Sydney) region.",
  },
  {
    handlesPersonalInformation: true,
    name: "Better Auth",
    purpose: "Runs email one-time code sign-in and session handling on Convex.",
  },
  {
    handlesPersonalInformation: true,
    name: "Polar",
    purpose:
      "Processes checkout, acts as merchant of record for paid reports, and sends payment receipts.",
  },
  {
    handlesPersonalInformation: true,
    name: "UseSend",
    purpose:
      "Sends sign-in codes, purchase emails, and optional monthly scan notification emails through the UseSend API endpoint configured for Listwell.",
  },
  {
    handlesPersonalInformation: true,
    name: "Cloudflare Workers AI",
    purpose:
      "Generates plain-language report summaries and listing review text from completed check results when the Workers AI binding is available.",
  },
  {
    handlesPersonalInformation: true,
    name: "Google",
    purpose:
      "When API keys are configured, looks up businesses (Places), finds web results (Programmable Search), and reads public performance signals (Chrome UX Report and PageSpeed Insights).",
  },
  {
    handlesPersonalInformation: true,
    name: "Apple MapKit",
    purpose:
      "When MapKit keys are configured, searches Apple Maps for business matches during intake.",
  },
  {
    handlesPersonalInformation: true,
    name: "OpenStreetMap Nominatim",
    purpose:
      "Geocodes and searches OpenStreetMap when Google or Apple lookups are unavailable or inconclusive.",
  },
  {
    handlesPersonalInformation: false,
    name: "TinyFish Fetch",
    purpose:
      "When an API key is configured, fetches HTML for a small number of thin website pages during an audit.",
  },
  {
    handlesPersonalInformation: true,
    name: "TypeSafe",
    purpose:
      "When an API key is configured, helps disambiguate business matches, interpret chat intake, compare social profile images, and tidy search phrases.",
  },
  {
    handlesPersonalInformation: true,
    name: "DataForSEO",
    purpose:
      "When an API key is configured, supplies SEO research data used on continued (monthly or yearly) reports.",
  },
];

export const listwellServicesWithPersonalData =
  (): ListwellThirdPartyService[] =>
    listwellThirdPartyServices().filter(
      (service) => service.handlesPersonalInformation
    );
