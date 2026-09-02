import { z } from 'zod'
import { fetchBrowserRenderingHtml, type FetchWebsiteOptions } from '../browser'

export const LCP_GOOD_MS = 2500

const cruxSchema = z.object({
  record: z.object({
    metrics: z.object({
      largest_contentful_paint: z.object({
        percentiles: z.object({
          p75: z.number().optional(),
        }).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
})

const pageSpeedSchema = z.object({
  lighthouseResult: z.object({
    audits: z.object({
      'largest-contentful-paint': z.object({
        numericValue: z.number().optional(),
      }).optional(),
    }).optional(),
  }).optional(),
})

export const performanceDataSchema = z.object({
  lcp: z.number().optional(),
  passes: z.boolean().optional(),
  kind: z.enum(['lcp', 'load', 'none']).optional(),
  message: z.string(),
})

export type PerformanceData = z.infer<typeof performanceDataSchema>

export const LCP_PROBE_SCRIPT = `(function(){function r(){try{var e=performance.getEntriesByType('largest-contentful-paint');var l=e[e.length-1];if(l&&typeof l.startTime==='number'){document.documentElement.setAttribute('data-listwell-lcp',String(Math.round(l.startTime)));document.documentElement.setAttribute('data-listwell-timing-kind','lcp');return}var n=performance.getEntriesByType('navigation')[0];if(n&&n.loadEventEnd){document.documentElement.setAttribute('data-listwell-timing',String(Math.round(n.loadEventEnd)));document.documentElement.setAttribute('data-listwell-timing-kind','load')}}catch(x){}}try{new PerformanceObserver(function(){r()}).observe({type:'largest-contentful-paint',buffered:true})}catch(x){}if(document.readyState==='complete')r();else window.addEventListener('load',r)})();`

const htmlLcpSchema = z.object({
  lcp: z.string().optional(),
  timing: z.string().optional(),
  kind: z.string().optional(),
})

export function parseSyntheticTiming(html: string): { value?: number; kind: 'lcp' | 'load' | 'none' } {
  const lcp = html.match(/data-listwell-lcp=["']?(\d+)/i)?.[1]
  const timing = html.match(/data-listwell-timing=["']?(\d+)/i)?.[1]
  const kindRaw = html.match(/data-listwell-timing-kind=["']?(lcp|load)/i)?.[1]
  const parsed = htmlLcpSchema.parse({ lcp, timing, kind: kindRaw })
  if (parsed.lcp) return { value: Number(parsed.lcp), kind: 'lcp' }
  if (parsed.timing) return { value: Number(parsed.timing), kind: 'load' }
  return { kind: 'none' }
}

export function performanceFromTiming(value: number | undefined, kind: 'lcp' | 'load' | 'none'): PerformanceData {
  if (value === undefined || kind === 'none') {
    return performanceDataSchema.parse({
      kind: 'none',
      message: 'Synthetic browser load did not report LCP or load timing. This is not Chrome UX Report data.',
    })
  }

  const passes = value < LCP_GOOD_MS
  const metric = kind === 'lcp' ? 'LCP' : 'load event'
  return performanceDataSchema.parse({
    lcp: value,
    passes,
    kind,
    message: `Synthetic browser load ${metric}: ${value}ms (${passes ? 'good' : 'needs improvement'}). This is Listwell loading the page, not Chrome UX Report.`,
  })
}

export async function fetchCruxPerformance(
  url: string,
  googleApiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<PerformanceData> {
  if (!googleApiKey) {
    return { message: 'No Google API key configured for CrUX API' }
  }

  try {
    const response = await fetchImpl(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const parsed = cruxSchema.safeParse(await response.json())
    const lcp = parsed.success
      ? parsed.data.record?.metrics?.largest_contentful_paint?.percentiles?.p75
      : undefined
    const passes = lcp !== undefined && lcp < LCP_GOOD_MS
    return {
      lcp,
      passes,
      message: lcp !== undefined
        ? `LCP p75: ${lcp}ms (${passes ? 'good' : 'needs improvement'})`
        : 'No LCP data available',
    }
  } catch (error) {
    return {
      message: `CrUX API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function fetchPageSpeedPerformance(
  url: string,
  googleApiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<PerformanceData> {
  if (!googleApiKey) {
    return { message: 'No Google API key configured for PageSpeed Insights API' }
  }

  try {
    const response = await fetchImpl(
      `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${googleApiKey}`,
    )
    const parsed = pageSpeedSchema.safeParse(await response.json())
    const lcpValue = parsed.success
      ? parsed.data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue
      : undefined
    const passes = lcpValue !== undefined && lcpValue < LCP_GOOD_MS
    return {
      lcp: lcpValue !== undefined ? Math.round(lcpValue) : undefined,
      passes,
      message: lcpValue !== undefined
        ? `LCP: ${Math.round(lcpValue)}ms (${passes ? 'good' : 'needs improvement'})`
        : 'No LCP data available from PageSpeed Insights',
    }
  } catch (error) {
    return {
      message: `PageSpeed API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function measureSyntheticPerformance(
  url: string,
  options: FetchWebsiteOptions = {},
): Promise<PerformanceData> {
  if (options.measurePerformance) {
    return performanceDataSchema.parse(await options.measurePerformance(url))
  }

  if (options.browserRendering?.accountId && options.browserRendering.apiToken) {
    try {
      const html = await fetchBrowserRenderingHtml(url, options.browserRendering, options.fetchImpl ?? fetch, {
        injectScript: LCP_PROBE_SCRIPT,
      })
      const timing = parseSyntheticTiming(html)
      return performanceFromTiming(timing.value, timing.kind)
    } catch (error) {
      return performanceDataSchema.parse({
        kind: 'none',
        message: `Synthetic browser load failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  return performanceDataSchema.parse({
    kind: 'none',
    message: 'Listwell could not run a lab speed check for this site.',
  })
}
