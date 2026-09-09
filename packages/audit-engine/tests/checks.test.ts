import { describe, expect, it } from "vitest";

import { runCheck, runChecks } from "../src/run";
import { checkResult } from "../src/schemas";
import type { BusinessSnapshot } from "../src/types";

const cafe: BusinessSnapshot = {
  category: "food",
  facebookUsername: "seoulbistro",
  id: "cafe-1",
  instagramUsername: "seoulbistro",
  locations: [
    {
      address: "12 Example Street, South Brisbane QLD",
      googlePlaceId: "https://maps.example/seoul-bistro",
    },
  ],
  name: "Seoul Bistro",
  uberEatsUrl: "https://www.ubereats.com/store/seoul-bistro",
  websiteUrl: "https://seoulbistro.example",
};

const htmlResponse = (html: string, status = 200): Response =>
  new Response(html, {
    headers: { "content-type": "text/html" },
    status,
  });

const resolveMockUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

const mockFetch = (routes: Record<string, Response | string>): typeof fetch => {
  const orderedRoutes = Object.entries(routes).toSorted(
    (left, right) => right[0].length - left[0].length
  );

  return (input) => {
    const url = resolveMockUrl(input);
    for (const [pattern, value] of orderedRoutes) {
      if (url.includes(pattern)) {
        return Promise.resolve(
          typeof value === "string" ? htmlResponse(value) : value
        );
      }
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
};

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
  </html>`;

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
  </html>`;

describe("presence checks", () => {
  it("passes when the channel field is set", async () => {
    await expect(runCheck("website", cafe)).resolves.toStrictEqual(
      checkResult(true)
    );
    await expect(
      Promise.all([
        runCheck("facebook-page", cafe),
        runCheck("instagram-profile", cafe),
        runCheck("uber-eats-listing", cafe),
        runCheck("google-listing", cafe),
        runCheck("doordash-listing", cafe),
        runCheck("linkedin-profile", cafe),
      ])
    ).resolves.toStrictEqual([
      checkResult(true),
      checkResult(true),
      checkResult(true),
      checkResult(
        true,
        "A Google listing URL or identifier is attached to this audit"
      ),
      checkResult(null, "No DoorDash listing linked to this audit"),
      checkResult(null, "No LinkedIn profile linked to this audit"),
    ]);
  });

  it("skips website when no URL is stored", async () => {
    const result = await runCheck("website", { ...cafe, websiteUrl: null });
    expect(result).toStrictEqual(
      checkResult(null, "No website URL linked to this audit")
    );
  });

  it("skips website html checks when no URL is stored", async () => {
    const bare = { ...cafe, websiteUrl: null };
    const result = await runCheck("website-title", bare);
    expect(result.value).toBeNull();
    expect(result.label).toContain("No website URL");
  });
});

describe("website html checks", () => {
  const fetchImpl = mockFetch({
    "seoulbistro.example": websitePage,
    "seoulbistro.example/robots.txt":
      "User-agent: *\nAllow: /\nSitemap: https://seoulbistro.example/sitemap.xml",
    "seoulbistro.example/sitemap.xml":
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://seoulbistro.example/</loc></url></urlset>',
  });

  it("reads title, meta, canonical, og, tel, address, hours, and schema from one html fetch", async () => {
    const results = await runChecks(
      cafe,
      [
        "website-title",
        "website-meta-description",
        "website-canonical",
        "website-og-image",
        "website-tel-link",
        "website-physical-address",
        "website-opening-hours",
        "website-localbusiness-jsonld",
        "website-mobile-responsive",
        "website-robots",
        "website-sitemap",
        "website-200-299",
      ],
      { fetchImpl }
    );

    expect(
      Object.values(results).every((result) => Boolean(result?.value))
    ).toBeTruthy();
  });

  it("fails meta description when longer than 160 characters", async () => {
    const long = "x".repeat(180);
    const fetchLong = mockFetch({
      "seoulbistro.example": `<html><head><meta name="description" content="${long}" /></head><body></body></html>`,
    });
    const result = await runCheck("website-meta-description", cafe, {
      fetchImpl: fetchLong,
    });
    expect(result.value).toBeFalsy();
    expect(result.label).toContain("too long");
  });
});

describe("google listing checks", () => {
  it("skips google listing when no listing is attached", async () => {
    const noListing = {
      ...cafe,
      locations: [{ address: "12 Example Street" }],
    };
    const result = await runCheck("google-listing", noListing);
    expect(result.value).toBeNull();
    expect(result.label).toContain("No Google listing");
  });

  it("uses Places details when a place id and GOOGLE_API_KEY exist", async () => {
    const placesCafe = {
      ...cafe,
      locations: [
        { address: "12 Example St, Brisbane QLD", googlePlaceId: "places/abc" },
      ],
    };
    const fetchImpl = mockFetch({
      "places.googleapis.com": Response.json(
        {
          currentOpeningHours: { openNow: true },
          nationalPhoneNumber: "07 3000 0000",
          photos: [{ name: "photo1" }],
          rating: 3.8,
          types: ["restaurant"],
          userRatingCount: 12,
          websiteUri: "https://seoulbistro.example",
        },
        { status: 200 }
      ),
    });

    const results = await runChecks(
      placesCafe,
      [
        "google-listing-phone-number",
        "google-listing-reviews",
        "google-listing-photos",
        "google-listing-opening-times",
        "google-listing-primary-category",
        "google-listing-website-matches",
      ],
      { env: { googleApiKey: "test-key" }, fetchImpl }
    );

    expect(results).toMatchObject({
      "google-listing-opening-times": { value: true },
      "google-listing-phone-number": { value: true },
      "google-listing-photos": { label: "1 photo found" },
      "google-listing-primary-category": {
        label: "Primary category: restaurant",
      },
      "google-listing-reviews": {
        label: expect.stringContaining("Need ≥ 20 reviews"),
        value: false,
      },
      "google-listing-website-matches": { value: true },
    });
  });

  it("reads listing facts from pasted listing HTML without a Google API key", async () => {
    const fetchImpl = mockFetch({
      "maps.example/seoul-bistro": listingPage,
      "seoulbistro.example": websitePage,
    });

    const results = await runChecks(
      cafe,
      [
        "google-listing-phone-number",
        "google-listing-reviews",
        "google-listing-photos",
        "google-listing-opening-times",
        "google-listing-primary-category",
        "google-listing-website-matches",
        "website-gbp-name-address-phone",
      ],
      { env: {}, fetchImpl }
    );

    expect(results).toMatchObject({
      "google-listing-opening-times": { value: true },
      "google-listing-phone-number": { value: true },
      "google-listing-photos": { label: expect.stringContaining("photo") },
      "google-listing-primary-category": {
        label: expect.stringContaining("LocalBusiness"),
      },
      "google-listing-reviews": {
        label: expect.stringContaining("Need ≥ 20 reviews"),
        value: false,
      },
      "google-listing-website-matches": { value: true },
      "website-gbp-name-address-phone": { value: true },
    });
  });

  it("marks listing checks inconclusive when the pasted URL cannot be fetched", async () => {
    const fetchImpl = mockFetch({
      "seoulbistro.example": websitePage,
    });
    const result = await runCheck("google-listing-phone-number", cafe, {
      env: {},
      fetchImpl,
    });
    expect(result.value).toBeNull();
    expect(result.label).toContain("could not be read");
  });

  it("falls back to website schema when no listing URL is stored", async () => {
    const fetchImpl = mockFetch({
      "seoulbistro.example": websitePage,
    });
    const noListing = {
      ...cafe,
      locations: [{ address: "12 Example Street, South Brisbane QLD" }],
    };
    const result = await runCheck("google-listing-phone-number", noListing, {
      env: {},
      fetchImpl,
    });
    expect(result.value).toBeTruthy();
    expect(result.label).toContain("business website");
  });

  it("does not invent review counts when none are published", async () => {
    const fetchImpl = mockFetch({
      "maps.example/seoul-bistro":
        "<html><body><h1>Seoul Bistro</h1></body></html>",
    });
    const result = await runCheck("google-listing-reviews", cafe, {
      env: {},
      fetchImpl,
    });
    expect(result.value).toBeNull();
    expect(result.label).toContain("do not invent");
  });
});

describe("website performance", () => {
  it("prefers CrUX LCP when a Google API key is present", async () => {
    const fetchImpl = mockFetch({
      "chromeuxreport.googleapis.com": Response.json(
        {
          record: {
            metrics: {
              largest_contentful_paint: { percentiles: { p75: 1900 } },
            },
          },
        },
        { status: 200 }
      ),
    });
    const result = await runCheck("website-performance", cafe, {
      env: { googleApiKey: "test-key" },
      fetchImpl,
    });
    expect(result.value).toBeTruthy();
    expect(result.label).toContain("LCP p75: 1900ms");
  });

  it("labels a synthetic browser LCP and does not mention API keys", async () => {
    const result = await runCheck("website-performance", cafe, {
      measurePerformance: () =>
        Promise.resolve({
          kind: "lcp",
          lcp: 1800,
          message:
            "Synthetic browser load LCP: 1800ms (good). This is Listwell loading the page, not Chrome UX Report.",
          passes: true,
        }),
    });
    expect(result.value).toBeTruthy();
    expect(result.label).toContain("Synthetic browser load");
    expect(result.label).not.toContain("API key");
  });

  it("is inconclusive when Browser Rendering is not configured", async () => {
    const result = await runCheck("website-performance", cafe, { env: {} });
    expect(result.value).toBeNull();
    expect(result.label).toContain("Browser Rendering");
    expect(result.label).not.toContain("API key");
  });
});
