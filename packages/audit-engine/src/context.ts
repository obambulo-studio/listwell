import { fetchText, fetchWebsiteHtml, fetchWebsiteResponse, type FetchWebsiteOptions } from './browser'
import { parseDocument, type HtmlDocument } from './html'
import { fetchGooglePlace } from './lookups/googlePlaces'
import { fetchApplePlace, searchAppleMaps } from './lookups/appleMaps'
import { googleSearch } from './lookups/googleSearch'
import { fetchCruxPerformance, fetchPageSpeedPerformance } from './lookups/performance'
import { checkResult } from './schemas'
import type {
  AuditEngineEnv,
  BusinessSnapshot,
  GooglePlace,
  GoogleSearchResult,
  SerializedHttpResponse,
} from './types'

export interface CheckContext {
  business: BusinessSnapshot
  env: AuditEngineEnv
  fetchImpl: typeof fetch
  getWebsiteHtml: () => Promise<string>
  getWebsiteDocument: () => Promise<HtmlDocument>
  getWebsiteResponse: () => Promise<SerializedHttpResponse>
  getGooglePlace: () => Promise<GooglePlace | null>
  googleSearch: (query: string) => Promise<GoogleSearchResult[]>
  fetchText: (url: string) => Promise<{ ok: boolean; status: number; body: string }>
  fetchCrux: (url: string) => Promise<{ lcp?: number; passes?: boolean; message: string }>
  fetchPageSpeed: (url: string) => Promise<{ lcp?: number; passes?: boolean; message: string }>
  searchAppleMaps: (query: string, userLocation?: string) => ReturnType<typeof searchAppleMaps>
  getApplePlace: (id: string) => ReturnType<typeof fetchApplePlace>
}

export function firstGooglePlaceId(business: BusinessSnapshot): string | null {
  for (const location of business.locations) {
    if (location.googlePlaceId) return location.googlePlaceId
  }
  return null
}

export function createCheckContext(
  business: BusinessSnapshot,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions = {},
): CheckContext {
  const fetchImpl = options.fetchImpl ?? fetch
  const browserOptions: FetchWebsiteOptions = {
    ...options,
    fetchImpl,
    browserRendering: options.browserRendering ?? {
      accountId: env.cloudflareAccountId,
      apiToken: env.cloudflareApiToken,
    },
  }

  let htmlPromise: Promise<string> | undefined
  let documentPromise: Promise<HtmlDocument> | undefined
  let responsePromise: Promise<SerializedHttpResponse> | undefined
  let placePromise: Promise<GooglePlace | null> | undefined

  return {
    business,
    env,
    fetchImpl,
    getWebsiteHtml: () => {
      if (!business.websiteUrl) {
        return Promise.reject(new Error('No website URL provided'))
      }
      htmlPromise ??= fetchWebsiteHtml(business.websiteUrl, browserOptions)
      return htmlPromise
    },
    getWebsiteDocument: () => {
      documentPromise ??= (async () => parseDocument(await (htmlPromise ??= fetchWebsiteHtml(business.websiteUrl ?? '', browserOptions))))()
      return documentPromise
    },
    getWebsiteResponse: () => {
      if (!business.websiteUrl) {
        return Promise.reject(new Error('No website URL provided'))
      }
      responsePromise ??= fetchWebsiteResponse(business.websiteUrl, browserOptions)
      return responsePromise
    },
    getGooglePlace: () => {
      placePromise ??= (async () => {
        const placeId = firstGooglePlaceId(business)
        if (!placeId || !env.googleApiKey) return null
        return fetchGooglePlace(placeId, env.googleApiKey, fetchImpl)
      })()
      return placePromise
    },
    googleSearch: (query: string) => googleSearch(query, env, fetchImpl),
    fetchText: (url: string) => fetchText(url, fetchImpl),
    fetchCrux: (url: string) => fetchCruxPerformance(url, env.googleApiKey, fetchImpl),
    fetchPageSpeed: (url: string) => fetchPageSpeedPerformance(url, env.googleApiKey, fetchImpl),
    searchAppleMaps: (query: string, userLocation?: string) => searchAppleMaps(query, env, fetchImpl, userLocation),
    getApplePlace: (id: string) => fetchApplePlace(id, env, fetchImpl),
  }
}

export function noWebsiteResult(label = 'No website URL provided') {
  return checkResult(false, label)
}

export function noPlaceResult(label = 'No Google Place ID found for this business location') {
  return checkResult(false, label)
}

export function fetchErrorResult(error: unknown, prefix: string) {
  return checkResult(false, `${prefix}: ${error instanceof Error ? error.message : 'Unknown error'}`)
}
