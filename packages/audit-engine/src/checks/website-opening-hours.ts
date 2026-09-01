import { fetchErrorResult, noWebsiteResult, type CheckContext } from '../context'
import { parseJsonLd } from '../html'
import { checkResult } from '../schemas'
import type { CheckResult } from '../types'

const HOURS_SECTION_INDICATORS = [
  /opening\s*hours/i,
  /hours\s*of\s*operation/i,
  /business\s*hours/i,
  /store\s*hours/i,
  /trading\s*hours/i,
]

const HOURS_PATTERNS = [
  /\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)\s*[-–—to]*\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/i,
  /(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*(?:[-:]\s|\s)\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
  /(?:hours|open|we\s+are\s+open|opening\s+hours)\s*[:]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i,
  /open\s+\d+\s+days/i,
  /\d+\s+days\s+a\s+week/i,
  /(?:open\s+)?24\s*\/\s*7/i,
  /(?:open\s+)?24\s+hours/i,
  /last\s+order(?:s)?\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)/i,
]

function isLikelyCode(text: string): boolean {
  if (!text || text.length < 5) return false
  const codePatterns = [
    /function\s*\(/i, /var\s+[a-zA-Z_$]/i, /const\s+[a-zA-Z_$]/i, /let\s+[a-zA-Z_$]/i,
    /return\s+/i, /import\s+/i, /export\s+/i, /document\./, /console\./,
  ]
  if (codePatterns.some((pattern) => pattern.test(text))) return true
  const bracketCount = (text.match(/[[\]{}()]/g) ?? []).length
  if (bracketCount > 0 && bracketCount / text.length > 0.05) return true
  const specialChars = (text.match(/[;:+\-*/%&|^~<>=!?]/g) ?? []).length
  return specialChars > 0 && specialChars / text.length > 0.1
}

function containsReadableText(text: string): boolean {
  const commonWords = [/\bthe\b/i, /\band\b/i, /\bor\b/i, /\bwe\b/i, /\byou\b/i, /\bday\b/i, /\bopen\b/i, /\bhour/i, /\btime/i]
  if (commonWords.some((word) => word.test(text))) return true
  const letters = text.match(/[a-zA-Z]/g) ?? []
  if (letters.length < 5) return false
  const letterCountMap: Record<string, number> = {}
  for (const letter of letters) {
    const lower = letter.toLowerCase()
    letterCountMap[lower] = (letterCountMap[lower] ?? 0) + 1
  }
  const uniqueLetters = Object.keys(letterCountMap).length
  const mostCommonLetterCount = Math.max(...Object.values(letterCountMap))
  return uniqueLetters >= 3 && mostCommonLetterCount / letters.length < 0.4
}

function containsHoursPattern(text: string): boolean {
  return HOURS_PATTERNS.some((pattern) => pattern.test(text))
}

function cleanHoursText(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned.length > 200 ? `${cleaned.substring(0, 200)}...` : cleaned
}

function openingHoursFromJsonLd(blocks: unknown[]): string | null {
  for (const data of blocks) {
    if (!data || typeof data !== 'object') continue
    const record = data
    const hours = readHours(record)
    if (hours) return hours
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  const record: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    record[key] = nestedValue
  }
  return record
}

function readHours(value: object): string | null {
  const record = asRecord(value)
  if (!record) return null
  const openingHours = record.openingHours ?? record.openingHoursSpecification
    ?? nested(record.mainEntity, 'openingHours')
    ?? nested(record.mainEntity, 'openingHoursSpecification')
  if (typeof openingHours === 'string') return openingHours
  if (Array.isArray(openingHours)) return openingHours.map(String).join(', ')
  const graph = record['@graph']
  if (Array.isArray(graph)) {
    for (const item of graph) {
      const graphItem = asRecord(item)
      if (!graphItem) continue
      const nestedHours = graphItem.openingHours ?? graphItem.openingHoursSpecification
      if (typeof nestedHours === 'string') return nestedHours
      if (Array.isArray(nestedHours)) return nestedHours.map(String).join(', ')
    }
  }
  return null
}

function nested(value: unknown, key: string): unknown {
  return asRecord(value)?.[key]
}

export async function checkWebsiteOpeningHours(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.business.websiteUrl) return noWebsiteResult()

  try {
    const document = await ctx.getWebsiteDocument()
    const jsonLdHours = openingHoursFromJsonLd(parseJsonLd(document))

    let hoursFound = false
    let hoursText = ''
    const bodyText = document.body?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

    for (const indicator of ['opening hours', 'business hours', 'hours of operation', 'we are open']) {
      const index = bodyText.toLowerCase().indexOf(indicator)
      if (index === -1) continue
      const contextText = bodyText.substring(Math.max(0, index - 10), Math.min(bodyText.length, index + indicator.length + 150)).trim()
      if (isLikelyCode(contextText)) continue
      if (containsHoursPattern(contextText)) {
        hoursFound = true
        hoursText = contextText
        break
      }
    }

    if (!hoursFound && jsonLdHours) {
      hoursFound = true
      hoursText = jsonLdHours
    }

    if (hoursFound && (isLikelyCode(hoursText) || !containsReadableText(hoursText))) {
      hoursFound = false
      hoursText = ''
    }

    if (!hoursFound && HOURS_SECTION_INDICATORS.some((pattern) => pattern.test(bodyText)) && containsHoursPattern(bodyText)) {
      hoursFound = true
      hoursText = bodyText.slice(0, 200)
    }

    return checkResult(
      hoursFound,
      hoursFound ? `Opening hours found: ${cleanHoursText(hoursText)}` : 'No opening hours found on website',
    )
  } catch (error) {
    return fetchErrorResult(error, 'Error checking for opening hours')
  }
}
