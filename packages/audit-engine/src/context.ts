import { fetchText, fetchWebsiteHtml, fetchWebsiteResponse, type FetchWebsiteOptions } from './browser'
import { parseDocument, type HtmlDocument } from './html'
import {
  emptyEvidence,
  evidenceFromHtml,
  firstListingUrl,
  type ListingEvidence,
} from './lookups/listingEvidence'
import { measureSyntheticPerformance, type PerformanceData } from './lookups/performance'
import { checkResult } from './schemas'
import type { AuditEngineEnv, BusinessSnapshot, SerializedHttpResponse } from './types'

export interface CheckContext {
  business: BusinessSnapshot
  env: AuditEngineEnv
  fetchImpl: typeof fetch
  getWebsiteHtml: () => Promise<string>
  getWebsiteDocument: () => Promise<HtmlDocument>
  getWebsiteResponse: () => Promise<SerializedHttpResponse>
  getWebsiteEvidence: () => Promise<ListingEvidence>
  getListingEvidence: () => Promise<ListingEvidence>
  fetchText: (url: string) => Promise<{ ok: boolean; status: number; body: string }>
  measurePerformance: (url: string) => Promise<PerformanceData>
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
  let websiteEvidencePromise: Promise<ListingEvidence> | undefined
  let listingEvidencePromise: Promise<ListingEvidence> | undefined

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
    getWebsiteEvidence: () => {
      websiteEvidencePromise ??= (async () => {
        if (!business.websiteUrl) {
          return emptyEvidence('', 'No website URL provided')
        }
        try {
          const html = await (htmlPromise ??= fetchWebsiteHtml(business.websiteUrl, browserOptions))
          return evidenceFromHtml(html, business.websiteUrl)
        } catch (error) {
          return emptyEvidence(
            business.websiteUrl,
            error instanceof Error ? error.message : 'Could not fetch the website',
          )
        }
      })()
      return websiteEvidencePromise
    },
    getListingEvidence: () => {
      listingEvidencePromise ??= (async () => {
        const listingUrl = firstListingUrl(business.locations)
        if (!listingUrl) {
          return emptyEvidence('', 'No Google listing URL provided')
        }
        try {
          const html = await fetchWebsiteHtml(listingUrl, browserOptions)
          return evidenceFromHtml(html, listingUrl)
        } catch (error) {
          return emptyEvidence(
            listingUrl,
            error instanceof Error ? error.message : 'Could not fetch the listing URL',
          )
        }
      })()
      return listingEvidencePromise
    },
    fetchText: (url: string) => fetchText(url, fetchImpl),
    measurePerformance: (url: string) => measureSyntheticPerformance(url, browserOptions),
  }
}

export function noWebsiteResult(label = 'No website URL provided') {
  return checkResult(false, label)
}

export function noListingResult(label = 'No Google listing URL provided') {
  return checkResult(false, label)
}

export function fetchErrorResult(error: unknown, prefix: string) {
  return checkResult(false, `${prefix}: ${error instanceof Error ? error.message : 'Unknown error'}`)
}
