import { describe, expect, it } from 'vitest'
import { parseGooglePlaceAutocomplete, parseGooglePlacesSearch } from '../src/lookups/googlePlaces'
import { evidenceFromHtml, urlsMatch } from '../src/lookups/listingEvidence'
import { locationPartsFromAddress } from '../src/lookups/location'
import {
  categoryFromOsm,
  parseNominatimSearch,
  pickStrongMatch,
  rankNominatimMatches,
} from '../src/lookups/nominatim'
import { parseSyntheticTiming, performanceFromTiming } from '../src/lookups/performance'
import { extractFacebookPage, extractInstagramProfile, extractTikTokProfile, rankFacebookPages } from '../src/lookups/social'

describe('social extractors', () => {
  it('keeps Facebook business pages and drops groups', () => {
    expect(extractFacebookPage('https://www.facebook.com/seoulbistro/')?.urlType).toBe('vanity')
    expect(extractFacebookPage('https://www.facebook.com/groups/123')).toBeNull()
    expect(extractFacebookPage('https://www.facebook.com/p/Seoul-Bistro-123456/')?.pageId).toBe('123456')
  })

  it('keeps Instagram and TikTok profiles and drops posts', () => {
    expect(extractInstagramProfile('https://www.instagram.com/seoulbistro/')?.username).toBe('seoulbistro')
    expect(extractInstagramProfile('https://www.instagram.com/p/abc123/')).toBeNull()
    expect(extractTikTokProfile('https://www.tiktok.com/@seoulbistro')?.username).toBe('seoulbistro')
    expect(extractTikTokProfile('https://www.tiktok.com/video/123')).toBeNull()
  })

  it('parses Places text search and drops results without an id', () => {
    const places = parseGooglePlacesSearch({
      places: [
        { id: 'places/abc', displayName: { text: 'Seoul Bistro' }, formattedAddress: '12 Smith St' },
        { displayName: { text: 'Missing id' } },
      ],
    })

    expect(places).toHaveLength(1)
    expect(places[0]?.id).toBe('places/abc')
    expect(places[0]?.displayName?.text).toBe('Seoul Bistro')
  })

  it('parses Places autocomplete suggestions', () => {
    const predictions = parseGooglePlaceAutocomplete({
      suggestions: [
        {
          placePrediction: {
            placeId: 'places/abc',
            types: ['restaurant'],
            structuredFormat: {
              mainText: { text: 'Seoul Bistro' },
              secondaryText: { text: 'Brisbane QLD' },
            },
          },
        },
      ],
    })

    expect(predictions[0]).toEqual({
      id: 'places/abc',
      title: 'Seoul Bistro',
      description: 'Brisbane QLD',
      types: ['restaurant'],
    })
  })

  it('ranks exact Facebook title matches first', () => {
    const ranked = rankFacebookPages([
      { title: 'Other Cafe', link: 'https://www.facebook.com/othercafe', description: '' },
      { title: 'Seoul Bistro', link: 'https://www.facebook.com/seoulbistro', description: '' },
    ], 'Seoul Bistro')

    expect(ranked[0]?.url).toBe('https://www.facebook.com/seoulbistro/')
  })
})

describe('nominatim ranking', () => {
  const items = parseNominatimSearch([
    {
      place_id: 1,
      osm_type: 'node',
      osm_id: 11,
      name: 'Seoul Bistro',
      display_name: 'Seoul Bistro, 12 Example Street, South Brisbane, QLD',
      category: 'amenity',
      type: 'restaurant',
      importance: 0.1,
      address: { amenity: 'Seoul Bistro', suburb: 'South Brisbane', city: 'Brisbane', state: 'Queensland' },
      extratags: { website: 'https://seoulbistro.example' },
    },
    {
      place_id: 2,
      osm_type: 'node',
      osm_id: 12,
      name: 'Seoul Bistro West End',
      display_name: 'Seoul Bistro West End, West End, QLD',
      category: 'amenity',
      type: 'restaurant',
      address: { amenity: 'Seoul Bistro West End', suburb: 'West End', city: 'Brisbane' },
    },
    {
      place_id: 3,
      osm_type: 'way',
      osm_id: 13,
      name: 'South Brisbane',
      display_name: 'South Brisbane, QLD',
      category: 'place',
      type: 'suburb',
      address: { suburb: 'South Brisbane' },
    },
  ])

  it('keeps businesses and drops suburbs', () => {
    const ranked = rankNominatimMatches('Seoul Bistro', 'South Brisbane', items)
    expect(ranked.map((match) => match.name)).toEqual(['Seoul Bistro', 'Seoul Bistro West End'])
    expect(ranked[0]?.categoryId).toBe('food')
    expect(ranked[0]?.websiteUrl).toBe('https://seoulbistro.example')
  })

  it('picks a strong match when one result is clearly better', () => {
    const ranked = rankNominatimMatches('Seoul Bistro', 'South Brisbane', items)
    const strong = pickStrongMatch(ranked)
    expect(strong?.name).toBe('Seoul Bistro')
  })

  it('does not invent a business from a street or suburb', () => {
    expect(categoryFromOsm('place', 'suburb')).toBe('other')
    expect(rankNominatimMatches('South Brisbane', 'Brisbane', [items[2]!])).toEqual([])
  })
})

describe('listing evidence', () => {
  it('reads LocalBusiness facts and does not invent missing reviews', () => {
    const evidence = evidenceFromHtml(`
      <html><body>
        <a href="tel:+61730000000">Call</a>
        <script type="application/ld+json">
          {"@type":"Restaurant","name":"Seoul Bistro","telephone":"+61 7 3000 0000","url":"https://seoulbistro.example","openingHours":"Mo-Su 11:00-22:00"}
        </script>
      </body></html>
    `, 'https://maps.example/listing')

    expect(evidence.fetched).toBe(true)
    expect(evidence.name).toBe('Seoul Bistro')
    expect(evidence.phone).toBe('+61 7 3000 0000')
    expect(evidence.website).toBe('https://seoulbistro.example')
    expect(evidence.hours).toContain('11:00')
    expect(evidence.reviewCount).toBeUndefined()
    expect(urlsMatch(evidence.website, 'https://www.seoulbistro.example/menu')).toBe(true)
  })
})

describe('location and performance helpers', () => {
  it('reads suburb and state from a typed Australian address', () => {
    const parts = locationPartsFromAddress('12 Example Street, South Brisbane QLD 4101, Australia')
    expect(parts.state).toBe('QLD')
    expect(parts.locationParts.length).toBeGreaterThan(0)
  })

  it('parses synthetic LCP from Browser Rendering HTML', () => {
    const timing = parseSyntheticTiming('<html data-listwell-lcp="2100" data-listwell-timing-kind="lcp"><body></body></html>')
    expect(timing).toEqual({ value: 2100, kind: 'lcp' })
    const result = performanceFromTiming(timing.value, timing.kind)
    expect(result.passes).toBe(true)
    expect(result.message).toContain('Synthetic browser load')
    expect(result.message).not.toContain('Chrome UX Report data.')
  })
})
