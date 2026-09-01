import { z } from 'zod'
import { looksLikeThinSpa } from './html'
import type { SerializedHttpResponse } from './types'

export interface BrowserRenderingConfig {
  accountId?: string
  apiToken?: string
}

export interface FetchWebsiteOptions {
  browserRendering?: BrowserRenderingConfig
  fetchImpl?: typeof fetch
  preferBrowser?: boolean
  /** Workers Browser Rendering binding (or any HTML renderer). Used after a thin-SPA fetch. */
  renderHtml?: (url: string) => Promise<string>
}

const browserContentSchema = z.object({
  success: z.boolean(),
  result: z.string().optional(),
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
})

export async function fetchPlain(url: string, fetchImpl: typeof fetch = fetch): Promise<SerializedHttpResponse> {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'ListwellAuditBot/1.0 (+https://listwell.au)',
    },
  })

  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  const isRedirect = response.status >= 300 && response.status < 400
  const body = isRedirect ? '' : await response.text()

  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    ok: response.ok,
    headers,
    body,
  }
}

/**
 * Cloudflare Browser Rendering REST `/content` — faster than a full puppeteer
 * session when we only need rendered HTML.
 */
export async function fetchBrowserRenderingHtml(
  url: string,
  config: BrowserRenderingConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!config.accountId || !config.apiToken) {
    throw new Error('Cloudflare Browser Rendering is not configured')
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/content`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
    }),
  })

  const json: unknown = await response.json()
  const parsed = browserContentSchema.parse(json)
  if (!parsed.success || typeof parsed.result !== 'string') {
    const message = parsed.errors?.[0]?.message ?? `Browser Rendering failed (${response.status})`
    throw new Error(message)
  }

  return parsed.result
}

/**
 * Prefer a plain fetch. Fall back to Browser Rendering only when the page
 * looks like a thin SPA — faster than always launching puppeteer.
 */
export async function fetchWebsiteHtml(url: string, options: FetchWebsiteOptions = {}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch

  if (!options.preferBrowser) {
    try {
      const plain = await fetchPlain(url, fetchImpl)
      if (plain.ok && !looksLikeThinSpa(plain.body)) {
        return plain.body
      }
    } catch {
      // Fall through to Browser Rendering.
    }
  }

  if (options.renderHtml) {
    try {
      return await options.renderHtml(url)
    } catch {
      // Fall through to REST Browser Rendering or the last plain fetch.
    }
  }

  if (options.browserRendering?.accountId && options.browserRendering.apiToken) {
    return await fetchBrowserRenderingHtml(url, options.browserRendering, fetchImpl)
  }

  const fallback = await fetchPlain(url, fetchImpl)
  if (!fallback.ok) {
    throw new Error(`Failed to fetch ${url}: ${fallback.status} ${fallback.statusText}`)
  }
  return fallback.body
}

export async function fetchWebsiteResponse(
  url: string,
  options: FetchWebsiteOptions = {},
): Promise<SerializedHttpResponse> {
  return fetchPlain(url, options.fetchImpl ?? fetch)
}

export async function fetchText(url: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'ListwellAuditBot/1.0 (+https://listwell.au)' },
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  } catch {
    return { ok: false, status: 0, body: '' }
  }
}
