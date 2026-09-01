import { describe, expect, it } from 'vitest'
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

  it('ranks exact Facebook title matches first', () => {
    const ranked = rankFacebookPages([
      { title: 'Other Cafe', link: 'https://www.facebook.com/othercafe', description: '' },
      { title: 'Seoul Bistro', link: 'https://www.facebook.com/seoulbistro', description: '' },
    ], 'Seoul Bistro')

    expect(ranked[0]?.url).toBe('https://www.facebook.com/seoulbistro/')
  })
})
