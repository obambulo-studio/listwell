import { describe, expect, it } from 'vitest'
import { parseGooglePlaceAutocomplete, parseGooglePlacesSearch } from '../src/lookups/googlePlaces'
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
