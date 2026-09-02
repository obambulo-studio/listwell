import { describe, expect, it } from 'vitest'
import { runCheck, runChecks } from '../src/run'
import { checkResult } from '../src/schemas'
import type { BusinessSnapshot } from '../src/types'

const cafe: BusinessSnapshot = {
  id: 'cafe-1',
  name: 'Seoul Bistro',
  category: 'food',
  websiteUrl: 'https://seoulbistro.example',
  facebookUsername: 'seoulbistro',
  instagramUsername: 'seoulbistro',
  uberEatsUrl: 'https://www.ubereats.com/store/seoul-bistro',
  locations: [{
    googlePlaceId: 'https://maps.example/seoul-bistro',
    address: '12 Example Street, South Brisbane QLD',
  }],
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html' } })
}

function mockFetch(routes: Record<string, Response | string>): typeof fetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    for (const [pattern, value] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return typeof value === 'string' ? htmlResponse(value) : value
      }
    }
    return new Response('not found', { status: 404 })
  }
}

const websitePage = `<!doctype html>
  <html>
    <head>
      <title>Seoul Bistro Brisbane</title>
      <meta name="description" content="Korean restaurant in Brisbane CBD." />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta property="og:image" content="https://seoulbistro.example/og.jpg" />
      <link rel="canonical" href="https://seoulbistro.example/" />
      <style>@media (max-width: 600px) { body { display: flex } }</style>
    </head>
    <body>
      <footer>12 Example Street, Brisbane QLD 4000</footer>
      <a href="tel:+61730000000">Call us</a>
      <p>Opening hours 11:00am - 10:30pm. Open 7 days.</p>
      <script type="application/ld+json">
        {"@type":"LocalBusiness","name":"Seoul Bistro","telephone":"+61 7 3000 0000","address":{"streetAddress":"12 Example Street","addressLocality":"Brisbane"},"openingHours":"Mo-Su 11:00-22:30"}
      </script>
    </body>
  </html>`

const listingPage = `<!doctype html>
  <html data-listwell-lcp="1800" data-listwell-timing-kind="lcp">
    <body>
      <h1>Seoul Bistro</h1>
      <a href="tel:+61730000000">07 3000 0000</a>
      <p>12 Example Street, South Brisbane</p>
      <p>Open 11:00am - 10:30pm</p>
      <img src="https://maps.example/photo-1.jpg" width="400" height="300" />
      <script type="application/ld+json">
        {
          "@type":"LocalBusiness",
          "name":"Seoul Bistro",
          "telephone":"+61 7 3000 0000",
          "url":"https://seoulbistro.example",
          "address":{"streetAddress":"12 Example Street","addressLocality":"South Brisbane"},
          "openingHours":"Mo-Su 11:00-22:30",
          "aggregateRating":{"ratingValue":3.8,"reviewCount":12},
          "image":["https://maps.example/photo-1.jpg"]
        }
      </script>
    </body>
  </html>`

describe('presence checks', () => {
  it('passes when the channel field is set', async () => {
    expect(await runCheck('website', cafe)).toEqual(checkResult(true))
    expect(await runCheck('facebook-page', cafe)).toEqual(checkResult(true))
    expect(await runCheck('instagram-profile', cafe)).toEqual(checkResult(true))
    expect(await runCheck('uber-eats-listing', cafe)).toEqual(checkResult(true))
    expect(await runCheck('google-listing', cafe)).toEqual(checkResult(true, 'A Google listing is attached to this audit'))
    expect(await runCheck('doordash-listing', cafe)).toEqual(checkResult(false))
    expect(await runCheck('linkedin-profile', cafe)).toEqual(checkResult(false))
  })

  it('fails website when no URL is stored', async () => {
    const result = await runCheck('website', { ...cafe, websiteUrl: null })
    expect(result).toEqual(checkResult(false))
  })
})

describe('website html checks', () => {
  const fetchImpl = mockFetch({
    'seoulbistro.example/robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://seoulbistro.example/sitemap.xml',
    'seoulbistro.example/sitemap.xml': '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://seoulbistro.example/</loc></url></urlset>',
    'seoulbistro.example': websitePage,
  })

  it('reads title, meta, canonical, og, tel, address, hours, and schema from one html fetch', async () => {
    const results = await runChecks(cafe, [
      'website-title',
      'website-meta-description',
      'website-canonical',
      'website-og-image',
      'website-tel-link',
      'website-physical-address',
      'website-opening-hours',
      'website-localbusiness-jsonld',
      'website-mobile-responsive',
      'website-robots',
      'website-sitemap',
      'website-200-299',
    ], { fetchImpl })

    expect(results['website-title']?.value).toBe(true)
    expect(results['website-meta-description']?.value).toBe(true)
    expect(results['website-canonical']?.value).toBe(true)
    expect(results['website-og-image']?.value).toBe(true)
    expect(results['website-tel-link']?.value).toBe(true)
    expect(results['website-physical-address']?.value).toBe(true)
    expect(results['website-opening-hours']?.value).toBe(true)
    expect(results['website-localbusiness-jsonld']?.value).toBe(true)
    expect(results['website-mobile-responsive']?.value).toBe(true)
    expect(results['website-robots']?.value).toBe(true)
    expect(results['website-sitemap']?.value).toBe(true)
    expect(results['website-200-299']?.value).toBe(true)
  })

  it('fails meta description when longer than 160 characters', async () => {
    const long = 'x'.repeat(180)
    const fetchLong = mockFetch({
      'seoulbistro.example': `<html><head><meta name="description" content="${long}" /></head><body></body></html>`,
    })
    const result = await runCheck('website-meta-description', cafe, { fetchImpl: fetchLong })
    expect(result.value).toBe(false)
    expect(result.label).toContain('too long')
  })
})

describe('google listing checks', () => {
  it('uses Places details when a place id and GOOGLE_API_KEY exist', async () => {
    const placesCafe = {
      ...cafe,
      locations: [{ googlePlaceId: 'places/abc', address: '12 Example St, Brisbane QLD' }],
    }
    const fetchImpl = mockFetch({
      'places.googleapis.com': new Response(JSON.stringify({
        nationalPhoneNumber: '07 3000 0000',
        currentOpeningHours: { openNow: true },
        websiteUri: 'https://seoulbistro.example',
        userRatingCount: 12,
        rating: 3.8,
        photos: [{ name: 'photo1' }],
        types: ['restaurant'],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })

    const results = await runChecks(placesCafe, [
      'google-listing-phone-number',
      'google-listing-reviews',
      'google-listing-photos',
      'google-listing-opening-times',
      'google-listing-primary-category',
      'google-listing-website-matches',
    ], { fetchImpl, env: { googleApiKey: 'test-key' } })

    expect(results['google-listing-phone-number']?.value).toBe(true)
    expect(results['google-listing-reviews']?.value).toBe(false)
    expect(results['google-listing-reviews']?.label).toContain('Need ≥ 20 reviews')
    expect(results['google-listing-photos']?.label).toBe('1 photo found')
    expect(results['google-listing-opening-times']?.value).toBe(true)
    expect(results['google-listing-primary-category']?.label).toBe('Primary category: restaurant')
    expect(results['google-listing-website-matches']?.value).toBe(true)
  })

  it('reads listing facts from pasted listing HTML without a Google API key', async () => {
    const fetchImpl = mockFetch({
      'maps.example/seoul-bistro': listingPage,
      'seoulbistro.example': websitePage,
    })

    const results = await runChecks(cafe, [
      'google-listing-phone-number',
      'google-listing-reviews',
      'google-listing-photos',
      'google-listing-opening-times',
      'google-listing-primary-category',
      'google-listing-website-matches',
      'website-gbp-name-address-phone',
    ], { fetchImpl, env: {} })

    expect(results['google-listing-phone-number']?.value).toBe(true)
    expect(results['google-listing-reviews']?.value).toBe(false)
    expect(results['google-listing-reviews']?.label).toContain('Need ≥ 20 reviews')
    expect(results['google-listing-photos']?.label).toContain('photo')
    expect(results['google-listing-opening-times']?.value).toBe(true)
    expect(results['google-listing-primary-category']?.label).toContain('LocalBusiness')
    expect(results['google-listing-website-matches']?.value).toBe(true)
    expect(results['website-gbp-name-address-phone']?.value).toBe(true)
  })

  it('marks listing checks inconclusive when the pasted URL cannot be fetched', async () => {
    const fetchImpl = mockFetch({
      'seoulbistro.example': websitePage,
    })
    const result = await runCheck('google-listing-phone-number', cafe, { fetchImpl, env: {} })
    expect(result.value).toBeNull()
    expect(result.label).toContain('could not be read')
  })

  it('falls back to website schema when no listing URL is stored', async () => {
    const fetchImpl = mockFetch({
      'seoulbistro.example': websitePage,
    })
    const noListing = { ...cafe, locations: [{ address: '12 Example Street, South Brisbane QLD' }] }
    const result = await runCheck('google-listing-phone-number', noListing, { fetchImpl, env: {} })
    expect(result.value).toBe(true)
    expect(result.label).toContain('business website')
  })

  it('does not invent review counts when none are published', async () => {
    const fetchImpl = mockFetch({
      'maps.example/seoul-bistro': '<html><body><h1>Seoul Bistro</h1></body></html>',
    })
    const result = await runCheck('google-listing-reviews', cafe, { fetchImpl, env: {} })
    expect(result.value).toBeNull()
    expect(result.label).toContain('do not invent')
  })
})

describe('website performance', () => {
  it('prefers CrUX LCP when a Google API key is present', async () => {
    const fetchImpl = mockFetch({
      'chromeuxreport.googleapis.com': new Response(JSON.stringify({
        record: { metrics: { largest_contentful_paint: { percentiles: { p75: 1900 } } } },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    const result = await runCheck('website-performance', cafe, {
      fetchImpl,
      env: { googleApiKey: 'test-key' },
    })
    expect(result.value).toBe(true)
    expect(result.label).toContain('LCP p75: 1900ms')
  })

  it('labels a synthetic browser LCP and does not mention API keys', async () => {
    const result = await runCheck('website-performance', cafe, {
      measurePerformance: async () => ({
        lcp: 1800,
        passes: true,
        kind: 'lcp',
        message: 'Synthetic browser load LCP: 1800ms (good). This is Listwell loading the page, not Chrome UX Report.',
      }),
    })
    expect(result.value).toBe(true)
    expect(result.label).toContain('Synthetic browser load')
    expect(result.label).not.toContain('API key')
  })

  it('is inconclusive when a lab speed check cannot run', async () => {
    const result = await runCheck('website-performance', cafe, { env: {} })
    expect(result.value).toBeNull()
    expect(result.label).toBe('Listwell could not run a lab speed check for this site.')
    expect(result.label).not.toContain('API key')
    expect(result.label).not.toContain('Browser Rendering')
  })
})
