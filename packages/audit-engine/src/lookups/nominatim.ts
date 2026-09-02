import { z } from 'zod'

export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
export const NOMINATIM_USER_AGENT = 'Listwell/1.0 (https://listwell.au; local business audit)'
export const NOMINATIM_MIN_INTERVAL_MS = 1100

export const BUSINESS_OSM_CLASSES = new Set([
  'amenity',
  'shop',
  'office',
  'craft',
  'tourism',
  'healthcare',
  'leisure',
  'club',
])

const FOOD_TYPES = new Set([
  'restaurant',
  'cafe',
  'fast_food',
  'bar',
  'pub',
  'food_court',
  'ice_cream',
  'biergarten',
  'canteen',
  'bakery',
  'confectionery',
  'wine',
  'alcohol',
])

const SERVICE_TYPES = new Set([
  'accountant',
  'lawyer',
  'estate_agent',
  'insurance',
  'company',
  'dentist',
  'doctors',
  'clinic',
  'veterinary',
  'car_repair',
  'hairdresser',
  'beauty',
  'plumber',
  'electrician',
  'carpenter',
  'painter',
  'cleaning',
])

const nominatimAddressSchema = z.record(z.string(), z.string())

const nominatimItemSchema = z.object({
  place_id: z.union([z.number(), z.string()]),
  osm_type: z.string().optional(),
  osm_id: z.union([z.number(), z.string()]).optional(),
  name: z.string().optional(),
  display_name: z.string(),
  lat: z.string().optional(),
  lon: z.string().optional(),
  class: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  importance: z.number().optional(),
  address: nominatimAddressSchema.optional(),
  extratags: nominatimAddressSchema.optional(),
})

const nominatimSearchSchema = z.array(nominatimItemSchema)

const nominatimReverseSchema = nominatimItemSchema

export type NominatimItem = z.infer<typeof nominatimItemSchema>
export type OsmCategoryId = 'food' | 'retail' | 'services' | 'other'

export interface NominatimMatch {
  id: string
  name: string
  address: string
  suburb?: string
  city?: string
  state?: string
  websiteUrl?: string
  phone?: string
  hours?: string
  osmClass: string
  osmType: string
  categoryId: OsmCategoryId
  score: number
}

export interface NominatimSearchOptions {
  fetchImpl?: typeof fetch
  minIntervalMs?: number
  countryCodes?: string
  limit?: number
}

export interface NominatimLocality {
  locality: string
  suburb?: string
  city?: string
  state?: string
}

let lastNominatimAt = 0

export function resetNominatimThrottle(): void {
  lastNominatimAt = 0
}

async function throttle(minIntervalMs: number): Promise<void> {
  if (minIntervalMs <= 0) return
  const wait = minIntervalMs - (Date.now() - lastNominatimAt)
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  lastNominatimAt = Date.now()
}

function nominatimHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Accept-Language': 'en-AU',
    'User-Agent': NOMINATIM_USER_AGENT,
  }
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function namesOverlap(search: string, candidate: string): boolean {
  const needle = normalizeName(search)
  const haystack = normalizeName(candidate)
  if (!needle || !haystack) return false
  return haystack.includes(needle) || needle.includes(haystack)
}

export function osmClassOf(item: NominatimItem): string {
  return item.category ?? item.class ?? ''
}

export function isBusinessOsmClass(osmClass: string): boolean {
  return BUSINESS_OSM_CLASSES.has(osmClass)
}

export function categoryFromOsm(osmClass: string, osmType: string): OsmCategoryId {
  if (FOOD_TYPES.has(osmType) || osmType === 'food') return 'food'
  if (osmClass === 'shop' || osmType === 'marketplace') return 'retail'
  if (osmClass === 'office' || osmClass === 'craft' || osmClass === 'healthcare' || SERVICE_TYPES.has(osmType)) {
    return 'services'
  }
  if (osmClass === 'amenity' && FOOD_TYPES.has(osmType)) return 'food'
  return 'other'
}

export function localityFromAddress(address: Record<string, string> | undefined): NominatimLocality {
  const suburb = address?.suburb ?? address?.hamlet ?? address?.neighbourhood
  const city = address?.city ?? address?.town ?? address?.municipality ?? address?.village
  const state = address?.state
  const parts = [suburb, city].filter((part): part is string => Boolean(part))
  return {
    locality: parts.join(', ') || city || suburb || address?.state || '',
    suburb,
    city,
    state,
  }
}

export function formatNominatimAddress(item: NominatimItem): string {
  const address = item.address
  if (!address) return item.display_name
  const line = [
    [address.house_number, address.road].filter(Boolean).join(' '),
    address.suburb ?? address.hamlet,
    address.city ?? address.town ?? address.village,
    address.state,
    address.postcode,
  ].filter((part) => part && part.length > 0)
  return line.length > 0 ? line.join(', ') : item.display_name
}

export function nameScore(search: string, candidate: string): number {
  const needle = normalizeName(search)
  const haystack = normalizeName(candidate)
  if (!needle || !haystack) return 0
  if (haystack === needle) return 1
  if (haystack.startsWith(needle) || haystack.endsWith(needle)) return 0.92
  if (haystack.includes(needle)) return 0.85

  const queryWords = needle.split(/\s+/).filter((word) => word.length > 1)
  if (queryWords.length === 0) return 0
  const haystackWords = new Set(haystack.split(/\s+/))
  const hits = queryWords.filter((word) => haystackWords.has(word) || haystack.includes(word)).length
  return (hits / queryWords.length) * 0.7
}

export function locationScore(near: string, item: NominatimItem): number {
  const needle = normalizeName(near)
  if (!needle) return 0.4
  const haystack = normalizeName([
    item.display_name,
    item.address?.suburb,
    item.address?.city,
    item.address?.town,
    item.address?.state,
  ].filter(Boolean).join(' '))
  if (haystack.includes(needle)) return 1
  const words = needle.split(/\s+/).filter((word) => word.length > 2)
  if (words.length === 0) return 0.4
  const hits = words.filter((word) => haystack.includes(word)).length
  return hits / words.length
}

export function scoreNominatimItem(query: string, near: string, item: NominatimItem): number {
  const name = item.name || item.address?.amenity || item.address?.shop || ''
  const scoredName = nameScore(query, name) || nameScore(query, item.display_name)
  const nearby = locationScore(near, item)
  const businessBonus = isBusinessOsmClass(osmClassOf(item)) ? 0.12 : -0.35
  const importance = Math.min(item.importance ?? 0, 0.15)
  return scoredName * 0.62 + nearby * 0.22 + businessBonus + importance
}

export function matchFromNominatim(item: NominatimItem, score: number): NominatimMatch | null {
  const osmClass = osmClassOf(item)
  if (!isBusinessOsmClass(osmClass)) return null
  const name = item.name?.trim() || item.address?.amenity || item.address?.shop || item.address?.office
  if (!name) return null

  const locality = localityFromAddress(item.address)
  const website = item.extratags?.website ?? item.extratags?.['contact:website']
  const phone = item.extratags?.phone ?? item.extratags?.['contact:phone']
  const hours = item.extratags?.opening_hours

  return {
    id: `osm:${item.osm_type ?? 'node'}:${item.osm_id ?? item.place_id}`,
    name,
    address: formatNominatimAddress(item),
    suburb: locality.suburb,
    city: locality.city,
    state: locality.state,
    websiteUrl: website && /^https?:\/\//.test(website) ? website : undefined,
    phone,
    hours,
    osmClass,
    osmType: item.type ?? '',
    categoryId: categoryFromOsm(osmClass, item.type ?? ''),
    score,
  }
}

export function rankNominatimMatches(query: string, near: string, items: NominatimItem[]): NominatimMatch[] {
  const ranked = items
    .map((item) => {
      const score = scoreNominatimItem(query, near, item)
      const match = matchFromNominatim(item, score)
      return match
    })
    .filter((match): match is NominatimMatch => match !== null && match.score >= 0.45)
    .sort((left, right) => right.score - left.score)

  const seen = new Set<string>()
  const unique: NominatimMatch[] = []
  for (const match of ranked) {
    const key = `${normalizeName(match.name)}|${normalizeName(match.suburb ?? match.city ?? match.address)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(match)
  }
  return unique.slice(0, 8)
}

export function pickStrongMatch(matches: NominatimMatch[]): NominatimMatch | null {
  const top = matches[0]
  if (!top || top.score < 0.8) return null
  const second = matches[1]
  if (!second) return top
  if (top.score - second.score >= 0.12) return top
  return null
}

export function parseNominatimSearch(value: unknown): NominatimItem[] {
  const parsed = nominatimSearchSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

export function parseNominatimReverse(value: unknown): NominatimItem | null {
  const parsed = nominatimReverseSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export async function searchNominatim(
  query: string,
  near: string,
  options: NominatimSearchOptions = {},
): Promise<NominatimMatch[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const fetchImpl = options.fetchImpl ?? fetch
  await throttle(options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS)

  const params = new URLSearchParams({
    q: near.trim() ? `${trimmed}, ${near.trim()}` : trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    limit: String(options.limit ?? 8),
    countrycodes: options.countryCodes ?? 'au',
  })

  const response = await fetchImpl(`${NOMINATIM_SEARCH_URL}?${params}`, {
    headers: nominatimHeaders(),
  })
  if (!response.ok) return []
  return rankNominatimMatches(trimmed, near, parseNominatimSearch(await response.json()))
}

export async function reverseNominatim(
  latitude: number,
  longitude: number,
  options: NominatimSearchOptions = {},
): Promise<NominatimLocality | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const fetchImpl = options.fetchImpl ?? fetch
  await throttle(options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS)

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '14',
  })

  const response = await fetchImpl(`${NOMINATIM_REVERSE_URL}?${params}`, {
    headers: nominatimHeaders(),
  })
  if (!response.ok) return null
  const item = parseNominatimReverse(await response.json())
  if (!item) return null
  const locality = localityFromAddress(item.address)
  return locality.locality ? locality : null
}
