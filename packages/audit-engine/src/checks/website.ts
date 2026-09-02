import robotsParser from 'robots-parser'
import { fetchErrorResult, noWebsiteResult, type CheckContext } from '../context'
import { parseJsonLd } from '../html'
import { addressPartsMatch, phonesMatch } from '../lookups/listingEvidence'
import { checkResult } from '../schemas'
import type { CheckResult } from '../types'

export async function checkWebsite(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.websiteUrl))
}

export async function checkWebsite200(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const response = await ctx.getWebsiteResponse()
    return checkResult(response.ok, `${response.status} ${response.statusText}`)
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteMetaDescription(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')
    if (!metaDescription) {
      return checkResult(false, 'No meta description tag found on the website')
    }
    const isValidLength = metaDescription.length <= 160
    return checkResult(
      isValidLength,
      isValidLength
        ? `Meta description present (${metaDescription.length} chars)`
        : `Meta description too long: ${metaDescription.length} chars (should be ≤ 160)`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteCanonical(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const canonicalLink = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
    if (!canonicalLink) {
      return checkResult(false, 'No canonical link tag found on the website')
    }
    try {
      new URL(canonicalLink)
      return checkResult(true, `Canonical link found: ${canonicalLink}`)
    } catch {
      try {
        const resolvedUrl = new URL(canonicalLink, ctx.business.websiteUrl).toString()
        return checkResult(true, `Canonical link found (relative): ${resolvedUrl}`)
      } catch {
        return checkResult(false, `Invalid canonical link format: ${canonicalLink}`)
      }
    }
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteRobots(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const websiteUrl = new URL(ctx.business.websiteUrl)
    const robotsUrl = `${websiteUrl.protocol}//${websiteUrl.host}/robots.txt`
    const baseUrl = `${websiteUrl.protocol}//${websiteUrl.host}`
    const fetched = await ctx.fetchText(robotsUrl)

    if (!fetched.ok) {
      if (fetched.status === 404) {
        return checkResult(true, 'No robots.txt file found (homepage not blocked)')
      }
      return checkResult(null, `Could not access robots.txt: ${fetched.status || 'Unknown error'}`)
    }
    if (!fetched.body) {
      return checkResult(null, 'Could not read robots.txt content')
    }

    const robots = robotsParser(robotsUrl, fetched.body)
    const mainSearchBots = ['Googlebot', 'Bingbot', 'Yandexbot', 'DuckDuckBot', 'Slurp']
    const homepageUrl = `${baseUrl}/`
    const blockedBots = mainSearchBots.filter((bot) => !robots.isAllowed(homepageUrl, bot))
    const isAllowedForAll = robots.isAllowed(homepageUrl, '*')
    const isHomepageBlocked = !isAllowedForAll || blockedBots.length > 0

    return checkResult(
      !isHomepageBlocked,
      !isHomepageBlocked
        ? 'robots.txt does not block the homepage for main search engines'
        : `robots.txt blocks the homepage for ${blockedBots.length > 0 ? blockedBots.join(', ') : 'all bots'}`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching robots.txt')
  }
}

function looksLikeSitemap(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.includes('<?xml') && (trimmed.includes('<urlset') || trimmed.includes('<sitemapindex') || trimmed.includes('<sitemap>'))
}

export async function checkWebsiteSitemap(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const websiteUrl = new URL(ctx.business.websiteUrl)
    const baseUrl = `${websiteUrl.protocol}//${websiteUrl.host}`
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/sitemaps.xml`,
      `${baseUrl}/sitemap1.xml`,
    ]

    let sitemapFound = false
    let sitemapUrl = ''
    let foundViaRobots = false

    const robots = await ctx.fetchText(`${baseUrl}/robots.txt`)
    if (robots.ok && robots.body) {
      const parsed = robotsParser(`${baseUrl}/robots.txt`, robots.body)
      const declared = parsed.getSitemaps()
      const firstSitemap = declared[0]
      if (firstSitemap) {
        const sitemap = await ctx.fetchText(firstSitemap)
        if (sitemap.ok && looksLikeSitemap(sitemap.body)) {
          sitemapFound = true
          sitemapUrl = firstSitemap
          foundViaRobots = true
        }
      }
    }

    if (!sitemapFound) {
      for (const url of sitemapUrls) {
        const sitemap = await ctx.fetchText(url)
        if (sitemap.ok && looksLikeSitemap(sitemap.body)) {
          sitemapFound = true
          sitemapUrl = url
          break
        }
      }
    }

    if (sitemapFound) {
      const sitemapPath = sitemapUrl.replace(baseUrl, '')
      return checkResult(true, foundViaRobots
        ? `XML sitemap found via robots.txt: ${sitemapPath}`
        : `XML sitemap found at: ${sitemapPath}`)
    }
    return checkResult(false, 'No XML sitemap found at common locations (/sitemap.xml, robots.txt)')
  } catch (error) {
    return fetchErrorResult(error, 'Error checking sitemap')
  }
}

export async function checkWebsiteOgImage(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const imageUrl = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      ?? document.querySelector('meta[property="og:image:url"]')?.getAttribute('content')
      ?? document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')

    if (!imageUrl) return checkResult(false, 'No Open Graph image tag found')

    try {
      if (!imageUrl.startsWith('http')) new URL(imageUrl, ctx.business.websiteUrl)
      else new URL(imageUrl)
      return checkResult(true, `Open Graph image found: ${imageUrl.substring(0, 50)}${imageUrl.length > 50 ? '...' : ''}`)
    } catch {
      return checkResult(false, `Invalid Open Graph image URL: ${imageUrl}`)
    }
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsitePerformance(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const cruxResult = await ctx.fetchCrux(ctx.business.websiteUrl)
    if (cruxResult.lcp !== undefined) {
      return checkResult(cruxResult.passes ?? false, cruxResult.message)
    }
    const pageSpeedResult = await ctx.fetchPageSpeed(ctx.business.websiteUrl)
    if (pageSpeedResult.lcp !== undefined) {
      return checkResult(pageSpeedResult.passes ?? false, pageSpeedResult.message)
    }
    const synthetic = await ctx.measurePerformance(ctx.business.websiteUrl)
    if (synthetic.lcp !== undefined) {
      return checkResult(synthetic.passes ?? false, synthetic.message)
    }
    return checkResult(null, synthetic.message)
  } catch (error) {
    return checkResult(null, `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function checkWebsiteMobileResponsive(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const html = await ctx.getWebsiteHtml()
    const document = await ctx.getWebsiteDocument()
    const viewportTag = document.querySelector('meta[name="viewport"]')?.getAttribute('content')
    if (!viewportTag) {
      return checkResult(false, 'No viewport meta tag found - site likely not mobile-responsive')
    }

    const hasDeviceWidth = viewportTag.toLowerCase().includes('width=device-width')
    const hasMediaQueries = html.includes('@media') || html.includes('min-width') || html.includes('max-width')
    const hasFlexboxOrGrid = html.includes('display: flex') || html.includes('display:flex')
      || html.includes('display: grid') || html.includes('display:grid')
    const hasResponsiveFramework = html.includes('bootstrap') || html.includes('tailwind')
      || html.includes('foundation') || html.includes('bulma')
    const isResponsive = hasDeviceWidth && (hasMediaQueries || hasFlexboxOrGrid || hasResponsiveFramework)

    let details = ''
    if (isResponsive) {
      details = 'Site appears mobile-responsive'
      if (html.includes('tailwind')) details += ' (using Tailwind CSS)'
      else if (html.includes('bootstrap')) details += ' (using Bootstrap)'
      else if (html.includes('foundation')) details += ' (using Foundation)'
      else if (html.includes('bulma')) details += ' (using Bulma)'
    } else if (hasDeviceWidth) {
      details = 'Has viewport tag but limited responsive indicators'
    } else {
      details = 'Missing proper viewport configuration for responsive design'
    }

    return checkResult(isResponsive, details)
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteTelLink(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const telLinks = document.querySelectorAll('a[href^="tel:"]')
    return checkResult(
      telLinks.length > 0,
      telLinks.length > 0
        ? `Found ${telLinks.length} click-to-call link(s) on the website`
        : 'No click-to-call telephone links found on the website',
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

const ADDRESS_SELECTORS = [
  'footer', '.footer', '#footer',
  'header', '.header', '#header',
  '.contact', '#contact', '.contact-info', '#contact-info',
  '.address', '#address', '[itemprop="address"]',
  '.location', '#location',
  '.store-info', '#store-info',
  '.about', '#about',
]

const ADDRESS_PATTERNS = [
  /\d+\s+[A-Za-z0-9\s,]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|plaza|plz|square|sq|highway|hwy|parkway|pkwy)/i,
  /P\.?O\.?\s*Box\s+\d+/i,
  /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i,
  /\d{5}(?:-\d{4})?/i,
  /[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s*\d[ABCEGHJ-NPRSTV-Z]\d/i,
]

function addressFromJsonLd(blocks: unknown[]): string | null {
  for (const data of blocks) {
    if (!data || typeof data !== 'object') continue
    const record = data
    const address = readAddress(record)
    if (address) return address
  }
  return null
}

function readAddress(data: object): string | null {
  const record = toRecord(data)
  if (!record) return null
  const direct = record.address ?? nestedAddress(record.location) ?? nestedAddress(record.mainEntity)
  if (typeof direct === 'string') return direct
  const fromObject = formatPostalAddress(direct)
  if (fromObject) return fromObject

  const graph = record['@graph']
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const formatted = formatPostalAddress(toRecord(item)?.address)
      if (formatted) return formatted
    }
  }
  return null
}

function nestedAddress(value: unknown): unknown {
  return toRecord(value)?.address
}

function formatPostalAddress(value: unknown): string | null {
  if (typeof value === 'string') return value
  const address = toRecord(value)
  if (!address) return null
  if (typeof address.streetAddress !== 'string') return null
  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ')
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  const record: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    record[key] = nestedValue
  }
  return record
}

export async function checkWebsitePhysicalAddress(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    let addressFound = false
    let addressText = ''

    for (const selector of ADDRESS_SELECTORS) {
      const elements = document.querySelectorAll(selector)
      const text = elements.map((el) => el.textContent ?? '').join(' ').trim()
      for (const pattern of ADDRESS_PATTERNS) {
        const match = text.match(pattern)
        if (match?.[0]) {
          addressFound = true
          addressText = match[0]
          break
        }
      }
      if (addressFound) break
    }

    if (!addressFound) {
      const bodyText = document.body?.textContent ?? ''
      for (const pattern of ADDRESS_PATTERNS) {
        const match = bodyText.match(pattern)
        if (match?.[0]) {
          addressFound = true
          addressText = match[0]
          break
        }
      }
    }

    if (!addressFound) {
      const fromLd = addressFromJsonLd(parseJsonLd(document))
      if (fromLd) {
        addressFound = true
        addressText = fromLd
      }
    }

    return checkResult(addressFound, addressFound ? `Physical address found: ${addressText}` : 'No physical address found on website')
  } catch (error) {
    return fetchErrorResult(error, 'Error checking for physical address')
  }
}

function typeIncludes(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value === needle || value.includes(needle)
  if (Array.isArray(value)) return value.some((item) => typeof item === 'string' && (item === needle || item.includes(needle)))
  return false
}

export async function checkWebsiteLocalBusinessJsonLd(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const blocks = parseJsonLd(document)
    if (blocks.length === 0) return checkResult(false, 'No JSON-LD scripts found on website')

    for (const jsonContent of blocks) {
      const record = toRecord(jsonContent)
      if (!record) continue
      if (typeIncludes(record['@type'], 'LocalBusiness') || typeIncludes(record['@type'], 'Organization')) {
        const typeLabel = typeof record['@type'] === 'string' ? record['@type'] : 'LocalBusiness'
        return checkResult(true, `Found ${typeLabel} schema`)
      }
      const graph = record['@graph']
      const items = Array.isArray(graph) ? graph : graph ? [graph] : []
      for (const item of items) {
        const graphItem = toRecord(item)
        if (!graphItem) continue
        if (typeIncludes(graphItem['@type'], 'LocalBusiness') || typeIncludes(graphItem['@type'], 'Organization')) {
          const typeLabel = typeof graphItem['@type'] === 'string' ? graphItem['@type'] : 'LocalBusiness'
          return checkResult(true, `Found ${typeLabel} schema in @graph`)
        }
      }
    }

    return checkResult(false, 'No LocalBusiness or Organization JSON-LD schema found')
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteMenuJsonLd(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const document = await ctx.getWebsiteDocument()
    const blocks = parseJsonLd(document)
    if (blocks.length === 0) return checkResult(false, 'No JSON-LD scripts found on website')

    for (const jsonContent of blocks) {
      const record = toRecord(jsonContent)
      if (!record) continue
      if (typeIncludes(record['@type'], 'Menu')) {
        return checkResult(true, 'Found Menu schema')
      }
      if (typeIncludes(record['@type'], 'Restaurant') && (record.hasMenu || record.hasMenuSection || record.menu)) {
        return checkResult(true, 'Found Restaurant schema with menu data')
      }
      const graph = record['@graph']
      const items = Array.isArray(graph) ? graph : graph ? [graph] : []
      for (const item of items) {
        const graphItem = toRecord(item)
        if (!graphItem) continue
        if (typeIncludes(graphItem['@type'], 'Menu')) {
          return checkResult(true, 'Found Menu schema in @graph')
        }
        if (typeIncludes(graphItem['@type'], 'Restaurant') && (graphItem.hasMenu || graphItem.hasMenuSection || graphItem.menu)) {
          return checkResult(true, 'Found Restaurant schema with menu data in @graph')
        }
      }
    }

    return checkResult(false, 'No Menu JSON-LD schema found')
  } catch (error) {
    return fetchErrorResult(error, 'Error fetching website')
  }
}

export async function checkWebsiteGbpNap(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()
  try {
    const place = await ctx.getGooglePlace()
    if (place) {
      const gbpName = place.displayName?.text ?? ''
      const gbpAddress = place.formattedAddress ?? ''
      const gbpPhone = place.nationalPhoneNumber ?? ''
      if (!gbpName && !gbpAddress && !gbpPhone) {
        return checkResult(false, 'No NAP information found in Google Business Profile')
      }

      const document = await ctx.getWebsiteDocument()
      const pageText = document.body?.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''
      const results: string[] = []
      let nameFound = false
      let addressFound = false
      let phoneFound = false

      if (gbpName) {
        nameFound = pageText.includes(gbpName.toLowerCase())
        results.push(`Name ${nameFound ? 'found' : 'missing'}`)
      }
      if (gbpAddress) {
        const significantParts = gbpAddress.split(',').map((part) => part.trim().toLowerCase()).filter((part) => part.length > 3)
        if (significantParts.length > 0) {
          const foundParts = significantParts.filter((part) => pageText.includes(part))
          addressFound = foundParts.length / significantParts.length >= 0.7
          results.push(`Address ${addressFound ? 'found' : 'missing'}`)
        }
      }
      if (gbpPhone) {
        const normalizedGbpPhone = gbpPhone.replace(/\D/g, '')
        phoneFound = pageText.includes(gbpPhone)
          || pageText.includes(normalizedGbpPhone)
          || Boolean(pageText.match(new RegExp(normalizedGbpPhone.replace(/(\d{3})(\d{3})(\d{4})/, '\\(?$1\\)?[\\s.-]*$2[\\s.-]*$3'))))
        results.push(`Phone ${phoneFound ? 'found' : 'missing'}`)
      }

      const componentsToCheck = [gbpName, gbpAddress, gbpPhone].filter(Boolean).length
      const foundComponents = [gbpName && nameFound, gbpAddress && addressFound, gbpPhone && phoneFound].filter(Boolean).length
      const matchPercentage = componentsToCheck > 0 ? foundComponents / componentsToCheck : 0
      const passes = matchPercentage >= 0.7
      return checkResult(
        passes,
        passes
          ? `NAP consistency check passed (${results.join(', ')})`
          : `NAP consistency check failed (${results.join(', ')})`,
      )
    }

    const listing = await ctx.getListingEvidence()
    if (listing.sourceUrl && !listing.fetched) {
      return checkResult(null, `Listing page could not be read: ${listing.fetchReason ?? 'unknown error'}`)
    }

    const expectedName = listing.fetched && listing.name ? listing.name : ctx.business.name
    const expectedAddress = listing.fetched && listing.address
      ? listing.address
      : ctx.business.locations.find((location) => location.address)?.address ?? ''
    const expectedPhone = listing.fetched ? listing.phone ?? '' : ''
    const source = listing.fetched ? 'pasted listing page' : 'typed business details'

    if (!expectedName && !expectedAddress && !expectedPhone) {
      return checkResult(false, 'No listing URL or typed name and address to compare with the website')
    }

    const document = await ctx.getWebsiteDocument()
    const pageText = document.body?.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''
    const website = await ctx.getWebsiteEvidence()
    const results: string[] = []
    let nameFound = false
    let addressFound = false
    let phoneFound = false

    if (expectedName) {
      nameFound = pageText.includes(expectedName.toLowerCase())
      results.push(`Name ${nameFound ? 'found' : 'missing'}`)
    }
    if (expectedAddress) {
      addressFound = addressPartsMatch(expectedAddress, pageText)
      results.push(`Address ${addressFound ? 'found' : 'missing'}`)
    }
    if (expectedPhone) {
      phoneFound = phonesMatch(expectedPhone, website.phone) || pageText.includes(expectedPhone.toLowerCase())
      results.push(`Phone ${phoneFound ? 'found' : 'missing'}`)
    }

    const componentsToCheck = [expectedName, expectedAddress, expectedPhone].filter(Boolean).length
    const foundComponents = [expectedName && nameFound, expectedAddress && addressFound, expectedPhone && phoneFound].filter(Boolean).length
    const matchPercentage = componentsToCheck > 0 ? foundComponents / componentsToCheck : 0
    const passes = matchPercentage >= 0.7
    return checkResult(
      passes,
      passes
        ? `NAP matches the ${source} (${results.join(', ')})`
        : `NAP does not match the ${source} (${results.join(', ')})`,
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error checking NAP consistency')
  }
}
