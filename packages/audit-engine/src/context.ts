import { fetchText, fetchWebsiteHtml, fetchWebsiteResponse } from "./browser";
import type { FetchWebsiteOptions } from "./browser";
import { parseDocument } from "./html";
import type { HtmlDocument } from "./html";
import { fetchApplePlace, searchAppleMaps } from "./lookups/apple-maps";
import { fetchGooglePlace } from "./lookups/google-places";
import { googleSearch } from "./lookups/google-search";
import {
  emptyEvidence,
  evidenceFromHtml,
  firstListingUrl,
  isHttpUrl,
} from "./lookups/listing-evidence";
import type { ListingEvidence } from "./lookups/listing-evidence";
import {
  fetchCruxPerformance,
  fetchPageSpeedPerformance,
  measureSyntheticPerformance,
} from "./lookups/performance";
import type { PerformanceData } from "./lookups/performance";
import { checkResult } from "./schemas";
import type {
  AuditEngineEnv,
  BusinessSnapshot,
  GooglePlace,
  GoogleSearchResult,
  SerializedHttpResponse,
} from "./types";

export interface CheckContext {
  business: BusinessSnapshot;
  env: AuditEngineEnv;
  fetchImpl: typeof fetch;
  getWebsiteHtml: () => Promise<string>;
  getWebsiteDocument: () => Promise<HtmlDocument>;
  getWebsiteResponse: () => Promise<SerializedHttpResponse>;
  getWebsiteEvidence: () => Promise<ListingEvidence>;
  getListingEvidence: () => Promise<ListingEvidence>;
  getGooglePlace: () => Promise<GooglePlace | null>;
  googleSearch: (query: string) => Promise<GoogleSearchResult[]>;
  fetchText: (
    url: string
  ) => Promise<{ ok: boolean; status: number; body: string }>;
  fetchCrux: (url: string) => Promise<PerformanceData>;
  fetchPageSpeed: (url: string) => Promise<PerformanceData>;
  measurePerformance: (url: string) => Promise<PerformanceData>;
  searchAppleMaps: (
    query: string,
    userLocation?: string
  ) => ReturnType<typeof searchAppleMaps>;
  getApplePlace: (id: string) => ReturnType<typeof fetchApplePlace>;
}

export const firstGooglePlaceId = (
  business: BusinessSnapshot
): string | null => {
  for (const location of business.locations) {
    if (location.googlePlaceId) {
      return location.googlePlaceId;
    }
  }
  return null;
};

const placesApiId = (business: BusinessSnapshot): string | null => {
  const placeId = firstGooglePlaceId(business);
  if (!placeId || isHttpUrl(placeId)) {
    return null;
  }
  return placeId;
};

export const createCheckContext = (
  business: BusinessSnapshot,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions = {}
): CheckContext => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const browserOptions: FetchWebsiteOptions = {
    ...options,
    browserRendering: options.browserRendering ?? {
      accountId: env.cloudflareAccountId,
      apiToken: env.cloudflareApiToken,
    },
    fetchImpl,
  };

  let htmlPromise: Promise<string> | undefined;
  let documentPromise: Promise<HtmlDocument> | undefined;
  let responsePromise: Promise<SerializedHttpResponse> | undefined;
  let websiteEvidencePromise: Promise<ListingEvidence> | undefined;
  let listingEvidencePromise: Promise<ListingEvidence> | undefined;
  let placePromise: Promise<GooglePlace | null> | undefined;

  return {
    business,
    env,
    fetchCrux: (url: string) =>
      fetchCruxPerformance(url, env.googleApiKey, fetchImpl),
    fetchImpl,
    fetchPageSpeed: (url: string) =>
      fetchPageSpeedPerformance(url, env.googleApiKey, fetchImpl),
    fetchText: (url: string) => fetchText(url, fetchImpl),
    getApplePlace: (id: string) => fetchApplePlace(id, env, fetchImpl),
    getGooglePlace: () => {
      placePromise ??= (async () => {
        const placeId = placesApiId(business);
        if (!placeId || !env.googleApiKey) {
          return null;
        }
        return await fetchGooglePlace(placeId, env.googleApiKey, fetchImpl);
      })();
      return placePromise;
    },
    getListingEvidence: () => {
      listingEvidencePromise ??= (async () => {
        const listingUrl = firstListingUrl(business.locations);
        if (!listingUrl) {
          return emptyEvidence("", "No Google listing URL provided");
        }
        try {
          const html = await fetchWebsiteHtml(listingUrl, browserOptions);
          return evidenceFromHtml(html, listingUrl);
        } catch (error) {
          return emptyEvidence(
            listingUrl,
            error instanceof Error
              ? error.message
              : "Could not fetch the listing URL"
          );
        }
      })();
      return listingEvidencePromise;
    },
    getWebsiteDocument: () => {
      documentPromise ??= (async () =>
        parseDocument(
          await (htmlPromise ??= fetchWebsiteHtml(
            business.websiteUrl ?? "",
            browserOptions
          ))
        ))();
      return documentPromise;
    },
    getWebsiteEvidence: () => {
      websiteEvidencePromise ??= (async () => {
        if (!business.websiteUrl) {
          return emptyEvidence("", "No website URL provided");
        }
        try {
          const html = await (htmlPromise ??= fetchWebsiteHtml(
            business.websiteUrl,
            browserOptions
          ));
          return evidenceFromHtml(html, business.websiteUrl);
        } catch (error) {
          return emptyEvidence(
            business.websiteUrl,
            error instanceof Error
              ? error.message
              : "Could not fetch the website"
          );
        }
      })();
      return websiteEvidencePromise;
    },
    getWebsiteHtml: () => {
      if (!business.websiteUrl) {
        return Promise.reject(new Error("No website URL provided"));
      }
      htmlPromise ??= fetchWebsiteHtml(business.websiteUrl, browserOptions);
      return htmlPromise;
    },
    getWebsiteResponse: () => {
      if (!business.websiteUrl) {
        return Promise.reject(new Error("No website URL provided"));
      }
      responsePromise ??= fetchWebsiteResponse(
        business.websiteUrl,
        browserOptions
      );
      return responsePromise;
    },
    googleSearch: (query: string) => googleSearch(query, env, fetchImpl),
    measurePerformance: (url: string) =>
      measureSyntheticPerformance(url, browserOptions),
    searchAppleMaps: (query: string, userLocation?: string) =>
      searchAppleMaps(query, env, fetchImpl, userLocation),
  };
};

export const noWebsiteResult = (
  label = "No website URL linked to this audit"
) => checkResult(null, label);

export const noListingResult = (
  label = "No Google listing URL linked to this audit"
) => checkResult(null, label);

export const noPlaceResult = (
  label = "No Google Place ID linked to this audit"
) => checkResult(null, label);

export const fetchErrorResult = (error: unknown, prefix: string) =>
  checkResult(
    null,
    `${prefix}: ${error instanceof Error ? error.message : "Unknown error"}`
  );
