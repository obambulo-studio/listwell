import { describe, expect, it } from "vitest";

import { freshnessScore } from "../src/lookups/social-profiles";
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
        "google-listing-rating",
        "google-listing-review-count",
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
      "google-listing-rating": {
        label: expect.stringContaining("Need ≥ 4.0"),
        value: false,
      },
      "google-listing-review-count": {
        label: expect.stringContaining("Need at least 20 reviews"),
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
        "google-listing-rating",
        "google-listing-review-count",
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
      "google-listing-rating": {
        label: expect.stringContaining("Need ≥ 4.0"),
        value: false,
      },
      "google-listing-review-count": {
        label: expect.stringContaining("Need at least 20 reviews"),
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
    const result = await runCheck("google-listing-review-count", cafe, {
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

const pngBytes = (base64: string): ArrayBuffer => {
  const decoded = Uint8Array.from(
    atob(base64),
    (char) => char.codePointAt(0) ?? 0
  );
  const buffer = new ArrayBuffer(decoded.length);
  new Uint8Array(buffer).set(decoded);
  return buffer;
};

const daysAgoIso = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const profileHtml = (options: {
  avatar?: string;
  banner?: string;
  login?: boolean;
  postedDaysAgo?: number;
}): string => {
  if (options.login) {
    return "<!doctype html><html><head><title>Log in</title></head><body>Log in to continue</body></html>";
  }
  const banner = options.banner
    ? `<img data-listwell-banner="${options.banner}" alt="Cover photo" />`
    : "";
  const avatar = options.avatar
    ? `<img data-listwell-avatar="${options.avatar}" alt="Profile photo" />`
    : "";
  const posted =
    options.postedDaysAgo === undefined
      ? ""
      : `<time datetime="${daysAgoIso(options.postedDaysAgo)}"></time>`;
  return `<!doctype html><html><body>${banner}${avatar}${posted}Haddon Institute public profile for students.</body></html>`;
};

const socialBusiness: BusinessSnapshot = {
  category: "other",
  facebookUsername: "haddoninstitute",
  id: "social-1",
  instagramUsername: "haddoninstitute",
  locations: [],
  name: "Haddon Institute",
};

describe("social profile checks", () => {
  it("scores freshness in week, month, quarter, and stale bands", () => {
    expect(freshnessScore(3)).toBe(100);
    expect(freshnessScore(12)).toBe(80);
    expect(freshnessScore(64)).toBe(50);
    expect(freshnessScore(120)).toBe(0);
  });

  it("passes when every readable profile has a banner", async () => {
    const result = await runCheck("social-profile-banner", socialBusiness, {
      fetchImpl: mockFetch({
        "facebook.com": profileHtml({
          banner: "https://cdn.example/banner.jpg",
        }),
        "instagram.com": profileHtml({
          banner: "https://cdn.example/banner.jpg",
        }),
      }),
    });
    expect(result.value).toBeTruthy();
    expect(result.label).toContain("Facebook");
    expect(result.label).toContain("Instagram");
  });

  it("fails when a readable profile has no banner", async () => {
    const result = await runCheck("social-profile-banner", socialBusiness, {
      fetchImpl: mockFetch({
        "facebook.com": profileHtml({ avatar: "https://cdn.example/logo.png" }),
        "instagram.com": profileHtml({
          banner: "https://cdn.example/banner.jpg",
        }),
      }),
    });
    expect(result.value).toBeFalsy();
    expect(result.label).toContain("Facebook");
  });

  it("does not treat an Open Graph image as a banner", async () => {
    const result = await runCheck(
      "social-profile-banner",
      { ...socialBusiness, instagramUsername: null },
      {
        fetchImpl: mockFetch({
          "facebook.com": `<!doctype html><html><head><meta property="og:image" content="https://cdn.example/post.jpg" /></head><body>Haddon Institute public profile for students and visitors.</body></html>`,
        }),
      }
    );
    expect(result.value).toBeNull();
    expect(result.label).toContain("could not be read");
  });

  it("stays inconclusive when the profile page is a login wall", async () => {
    const result = await runCheck("social-profile-banner", socialBusiness, {
      fetchImpl: mockFetch({
        "facebook.com": profileHtml({ login: true }),
        "instagram.com": profileHtml({ login: true }),
      }),
    });
    expect(result.value).toBeNull();
    expect(result.label).toContain("login");
  });

  it("stays inconclusive when no social profile is linked", async () => {
    const result = await runCheck(
      "social-profile-freshness",
      {
        category: "services",
        id: "quiet",
        locations: [],
        name: "Quiet Co",
      },
      { fetchImpl: mockFetch({}) }
    );
    expect(result.value).toBeNull();
    expect(result.label).toContain("No social profiles");
  });

  it("matches profiles that share the same avatar URL", async () => {
    const result = await runCheck(
      "social-profile-image-match",
      socialBusiness,
      {
        fetchImpl: mockFetch({
          "cdn.example/logo.png": new Response(new Uint8Array([1, 2, 3, 4])),
          "facebook.com": profileHtml({
            avatar: "https://cdn.example/logo.png",
          }),
          "instagram.com": profileHtml({
            avatar: "https://cdn.example/logo.png",
          }),
        }),
      }
    );
    expect(result.value).toBeTruthy();
  });

  it("fails when profile avatars are different images", async () => {
    const left = pngBytes(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGNgwAH+4wC41I9qGA0lhqGfNADqSX6QjxtfxwAAAABJRU5ErkJggg=="
    );
    const right = pngBytes(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4jwMw4AKjGkZDiWHYJg0AyGV+kDMCpwkAAAAASUVORK5CYII="
    );
    const result = await runCheck(
      "social-profile-image-match",
      socialBusiness,
      {
        fetchImpl: mockFetch({
          "cdn.example/left.png": new Response(left, {
            headers: { "content-type": "image/png" },
          }),
          "cdn.example/right.png": new Response(right, {
            headers: { "content-type": "image/png" },
          }),
          "facebook.com": profileHtml({
            avatar: "https://cdn.example/left.png",
          }),
          "instagram.com": profileHtml({
            avatar: "https://cdn.example/right.png",
          }),
        }),
      }
    );
    expect(result.value).toBeFalsy();
    expect(result.label).toContain("do not match");
  });

  it("shows a freshness score and passes when posts are within 90 days", async () => {
    const result = await runCheck("social-profile-freshness", socialBusiness, {
      fetchImpl: mockFetch({
        "facebook.com": profileHtml({ postedDaysAgo: 12 }),
        "instagram.com": profileHtml({ postedDaysAgo: 64 }),
      }),
    });
    expect(result.value).toBeTruthy();
    expect(result.label).toContain("Facebook 12 days ago (80)");
    expect(result.label).toContain("Instagram 64 days ago (50)");
  });

  it("fails freshness when a profile has not posted within 90 days", async () => {
    const result = await runCheck("social-profile-freshness", socialBusiness, {
      fetchImpl: mockFetch({
        "facebook.com": profileHtml({ postedDaysAgo: 3 }),
        "instagram.com": profileHtml({ postedDaysAgo: 120 }),
      }),
    });
    expect(result.value).toBeFalsy();
    expect(result.label).toContain("Instagram 120 days ago (0)");
  });
});
