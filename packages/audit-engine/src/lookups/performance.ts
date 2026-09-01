import { z } from 'zod'

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

export interface PerformanceData {
  lcp?: number
  passes?: boolean
  message: string
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
    const passes = lcp !== undefined && lcp < 2500
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
    const passes = lcpValue !== undefined && lcpValue < 2500
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
