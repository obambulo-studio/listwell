import { parseDocument, parseJsonLd, type HtmlDocument } from '../html'
import { z } from 'zod'

export const listingEvidenceSchema = z.object({
  sourceUrl: z.string(),
  fetched: z.boolean(),
  fetchReason: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  hours: z.string().optional(),
  website: z.string().optional(),
  category: z.string().optional(),
  photoCount: z.number().int().nonnegative().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
})

export type ListingEvidence = z.infer<typeof listingEvidenceSchema>

export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export function urlsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  if (left === right) return true
  const leftHost = hostOf(left)
  const rightHost = hostOf(right)
  return Boolean(leftHost && rightHost && leftHost === rightHost)
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  return { ...value }
}

function typeIncludes(value: unknown, needle: string): boolean {
  if (typeof value === 'string') return value === needle || value.includes(needle)
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === 'string' && (item === needle || item.includes(needle)))
  }
  return false
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function formatPostalAddress(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  const address = toRecord(value)
  if (!address) return undefined
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
    address.addressCountry,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0)
  return parts.length > 0 ? parts.join(', ') : undefined
}

function flattenJsonLd(blocks: unknown[]): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  for (const block of blocks) {
    const record = toRecord(block)
    if (!record) continue
    records.push(record)
    const graph = record['@graph']
    const items = Array.isArray(graph) ? graph : graph ? [graph] : []
    for (const item of items) {
      const nested = toRecord(item)
      if (nested) records.push(nested)
    }
  }
  return records
}

function isLocalBusiness(record: Record<string, unknown>): boolean {
  return typeIncludes(record['@type'], 'LocalBusiness')
    || typeIncludes(record['@type'], 'Organization')
    || typeIncludes(record['@type'], 'Restaurant')
    || typeIncludes(record['@type'], 'Store')
}

function hoursFromValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const parts = value.map((item) => {
      if (typeof item === 'string') return item
      const record = toRecord(item)
      if (!record) return ''
      const days = readString(record.dayOfWeek)
      const opens = readString(record.opens)
      const closes = readString(record.closes)
      if (opens && closes) return [days, `${opens}-${closes}`].filter(Boolean).join(' ')
      return ''
    }).filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : undefined
  }
  return undefined
}

function typeLabel(value: unknown): string | undefined {
  if (typeof value === 'string') return value.replace(/^https?:\/\/schema\.org\//, '')
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string')
    return first ? first.replace(/^https?:\/\/schema\.org\//, '') : undefined
  }
  return undefined
}

function evidenceFromJsonLd(document: HtmlDocument): Partial<ListingEvidence> {
  const records = flattenJsonLd(parseJsonLd(document))
  const found: Partial<ListingEvidence> = {}

  for (const record of records) {
    if (!isLocalBusiness(record) && !found.name) continue

    found.name ??= readString(record.name)
    found.phone ??= readString(record.telephone)
    found.address ??= formatPostalAddress(record.address)
    found.hours ??= hoursFromValue(record.openingHours ?? record.openingHoursSpecification)
    found.website ??= readString(record.url)
    found.category ??= typeLabel(record['@type'])

    const rating = toRecord(record.aggregateRating)
    if (rating) {
      found.rating ??= readNumber(rating.ratingValue)
      found.reviewCount ??= readNumber(rating.reviewCount ?? rating.ratingCount)
    }

    const images = record.image
    if (typeof images === 'string') found.photoCount = Math.max(found.photoCount ?? 0, 1)
    if (Array.isArray(images)) found.photoCount = Math.max(found.photoCount ?? 0, images.length)
  }

  return found
}

const VISIBLE_PHONE = /(?:\+?61|0)[\s()-]*[2-478](?:[\s()-]*\d){8}/
const VISIBLE_HOURS = /\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i

function visiblePhone(document: HtmlDocument): string | undefined {
  const tel = document.querySelector('a[href^="tel:"]')?.getAttribute('href')
  if (tel?.startsWith('tel:')) {
    const number = tel.slice(4).trim()
    if (number) return number
  }
  const text = document.body?.textContent ?? ''
  return text.match(VISIBLE_PHONE)?.[0]?.replace(/\s+/g, ' ')
}

function visibleHours(document: HtmlDocument): string | undefined {
  const text = document.body?.textContent?.replace(/\s+/g, ' ') ?? ''
  const match = text.match(VISIBLE_HOURS)
  return match?.[0]
}

function visibleWebsite(document: HtmlDocument, sourceUrl: string): string | undefined {
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')
  if (canonical && isHttpUrl(canonical)) return canonical
  const og = document.querySelector('meta[property="og:url"]')?.getAttribute('content')
  if (og && isHttpUrl(og)) return og
  return isHttpUrl(sourceUrl) ? sourceUrl : undefined
}

function photoCountFromDom(document: HtmlDocument): number {
  const og = document.querySelector('meta[property="og:image"]') ? 1 : 0
  const images = document.querySelectorAll('img').filter((image) => {
    const src = image.getAttribute('src') ?? ''
    if (!src || src.startsWith('data:')) return false
    const width = Number(image.getAttribute('width') ?? '0')
    const height = Number(image.getAttribute('height') ?? '0')
    if (width && height && (width < 80 || height < 80)) return false
    return !/sprite|icon|logo|pixel|tracking/i.test(src)
  }).length
  return og + images
}

export function evidenceFromHtml(html: string, sourceUrl: string): ListingEvidence {
  const document = parseDocument(html)
  const fromLd = evidenceFromJsonLd(document)
  const photos = fromLd.photoCount && fromLd.photoCount > 0 ? fromLd.photoCount : photoCountFromDom(document)

  return listingEvidenceSchema.parse({
    sourceUrl,
    fetched: true,
    name: fromLd.name,
    phone: fromLd.phone ?? visiblePhone(document),
    address: fromLd.address,
    hours: fromLd.hours ?? visibleHours(document),
    website: fromLd.website ?? visibleWebsite(document, sourceUrl),
    category: fromLd.category,
    photoCount: photos > 0 ? photos : undefined,
    rating: fromLd.rating,
    reviewCount: fromLd.reviewCount,
  })
}

export function emptyEvidence(sourceUrl: string, fetchReason: string): ListingEvidence {
  return listingEvidenceSchema.parse({
    sourceUrl,
    fetched: false,
    fetchReason,
  })
}

export function firstListingUrl(locations: Array<{ googlePlaceId?: string | null }>): string | null {
  for (const location of locations) {
    if (isHttpUrl(location.googlePlaceId)) return location.googlePlaceId
  }
  return null
}

export function hasAttachedListing(locations: Array<{ googlePlaceId?: string | null }>): boolean {
  return locations.some((location) => Boolean(location.googlePlaceId))
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function phonesMatch(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false
  const a = normalizePhoneDigits(left)
  const b = normalizePhoneDigits(right)
  if (!a || !b) return false
  if (a === b) return true
  return a.endsWith(b.slice(-8)) || b.endsWith(a.slice(-8))
}

export function addressPartsMatch(expected: string, pageText: string): boolean {
  const significant = expected
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 3)
  if (significant.length === 0) return pageText.includes(expected.toLowerCase())
  const hits = significant.filter((part) => {
    if (pageText.includes(part)) return true
    const words = part.split(/\s+/).filter((word) => word.length > 3)
    return words.some((word) => pageText.includes(word))
  }).length
  return hits / significant.length >= 0.7
}
