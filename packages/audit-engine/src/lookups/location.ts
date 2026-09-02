import type { LocationParts } from '../types'

const STATE_CODES = new Set(['QLD', 'NSW', 'VIC', 'ACT', 'SA', 'TAS', 'WA', 'NT'])

export function locationPartsFromAddress(address: string | null | undefined): LocationParts {
  if (!address || address.trim().length === 0) {
    return { suburb: null, city: null, state: null, country: null, locationParts: [] }
  }

  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  let suburb: string | null = null
  let city: string | null = null
  let state: string | null = null
  let country: string | null = null

  for (const part of parts) {
    const tokens = part.split(/\s+/)
    const code = tokens.find((token) => STATE_CODES.has(token.toUpperCase()))
    if (code && !state) state = code.toUpperCase()

    const withoutPostcode = part.replace(/\b\d{4}\b/g, '').replace(/\bAustralia\b/i, '').trim()
    if (/australia/i.test(part)) country = 'Australia'
    if (!withoutPostcode) continue

    if (!suburb && parts.indexOf(part) >= 1) suburb = withoutPostcode.replace(/\b(?:QLD|NSW|VIC|ACT|SA|TAS|WA|NT)\b/i, '').trim() || withoutPostcode
    else if (!city && suburb && withoutPostcode !== suburb) city = withoutPostcode
  }

  if (suburb && /^(QLD|NSW|VIC|ACT|SA|TAS|WA|NT)$/i.test(suburb)) {
    state = suburb.toUpperCase()
    suburb = null
  }

  const locationParts = parts
    .map((part) => part.replace(/\d+/g, '').trim())
    .filter((part) => part.length > 1 && /[a-zA-Z]/.test(part))

  return { suburb, city, state, country, locationParts }
}
