import { describe, expect, it } from "vitest";

import {
  parseGooglePlaceAutocomplete,
  parseGooglePlacesSearch,
} from "../src/lookups/google-places";
import { evidenceFromHtml, urlsMatch } from "../src/lookups/listing-evidence";
import { locationPartsFromAddress } from "../src/lookups/location";
import {
  categoryFromOsm,
  parseNominatimSearch,
  pickStrongMatch,
  rankNominatimMatches,
} from "../src/lookups/nominatim";
import {
  parseSyntheticTiming,
  performanceFromTiming,
} from "../src/lookups/performance";
import {
  extractFacebookPage,
  extractInstagramProfile,
  extractTikTokProfile,
  rankFacebookPages,
} from "../src/lookups/social";

describe("social extractors", () => {
  it("keeps Facebook business pages and drops groups", () => {
    expect(
      extractFacebookPage("https://www.facebook.com/seoulbistro/")?.urlType
    ).toBe("vanity");
    expect(
      extractFacebookPage("https://www.facebook.com/groups/123")
    ).toBeNull();
    expect(
      extractFacebookPage("https://www.facebook.com/p/Seoul-Bistro-123456/")
        ?.pageId
    ).toBe("123456");
  });

  it("keeps Instagram and TikTok profiles and drops posts", () => {
    expect(
      extractInstagramProfile("https://www.instagram.com/seoulbistro/")
        ?.username
    ).toBe("seoulbistro");
    expect(
      extractInstagramProfile("https://www.instagram.com/p/abc123/")
    ).toBeNull();
    expect(
      extractTikTokProfile("https://www.tiktok.com/@seoulbistro")?.username
    ).toBe("seoulbistro");
    expect(extractTikTokProfile("https://www.tiktok.com/video/123")).toBeNull();
  });

  it("parses Places text search and drops results without an id", () => {
    const places = parseGooglePlacesSearch({
      places: [
        {
          displayName: { text: "Seoul Bistro" },
          formattedAddress: "12 Smith St",
          id: "places/abc",
        },
        { displayName: { text: "Missing id" } },
      ],
    });

    expect(places).toHaveLength(1);
    expect(places[0]?.id).toBe("places/abc");
    expect(places[0]?.displayName?.text).toBe("Seoul Bistro");
  });

  it("parses Places autocomplete suggestions", () => {
    const predictions = parseGooglePlaceAutocomplete({
      suggestions: [
        {
          placePrediction: {
            placeId: "places/abc",
            structuredFormat: {
              mainText: { text: "Seoul Bistro" },
              secondaryText: { text: "Brisbane QLD" },
            },
            types: ["restaurant"],
          },
        },
      ],
    });

    expect(predictions[0]).toStrictEqual({
      description: "Brisbane QLD",
      id: "places/abc",
      title: "Seoul Bistro",
      types: ["restaurant"],
    });
  });

  it("ranks exact Facebook title matches first", () => {
    const ranked = rankFacebookPages(
      [
        {
          description: "",
          link: "https://www.facebook.com/othercafe",
          title: "Other Cafe",
        },
        {
          description: "",
          link: "https://www.facebook.com/seoulbistro",
          title: "Seoul Bistro",
        },
      ],
      "Seoul Bistro"
    );

    expect(ranked[0]?.url).toBe("https://www.facebook.com/seoulbistro/");
  });
});

describe("nominatim ranking", () => {
  const items = parseNominatimSearch([
    {
      address: {
        amenity: "Seoul Bistro",
        city: "Brisbane",
        state: "Queensland",
        suburb: "South Brisbane",
      },
      category: "amenity",
      display_name: "Seoul Bistro, 12 Example Street, South Brisbane, QLD",
      extratags: { website: "https://seoulbistro.example" },
      importance: 0.1,
      name: "Seoul Bistro",
      osm_id: 11,
      osm_type: "node",
      place_id: 1,
      type: "restaurant",
    },
    {
      address: {
        amenity: "Seoul Bistro West End",
        city: "Brisbane",
        suburb: "West End",
      },
      category: "amenity",
      display_name: "Seoul Bistro West End, West End, QLD",
      name: "Seoul Bistro West End",
      osm_id: 12,
      osm_type: "node",
      place_id: 2,
      type: "restaurant",
    },
    {
      address: { suburb: "South Brisbane" },
      category: "place",
      display_name: "South Brisbane, QLD",
      name: "South Brisbane",
      osm_id: 13,
      osm_type: "way",
      place_id: 3,
      type: "suburb",
    },
  ]);

  it("keeps businesses and drops suburbs", () => {
    const ranked = rankNominatimMatches(
      "Seoul Bistro",
      "South Brisbane",
      items
    );
    expect(ranked.map((match) => match.name)).toStrictEqual([
      "Seoul Bistro",
      "Seoul Bistro West End",
    ]);
    expect(ranked[0]?.categoryId).toBe("food");
    expect(ranked[0]?.websiteUrl).toBe("https://seoulbistro.example");
  });

  it("picks a strong match when one result is clearly better", () => {
    const ranked = rankNominatimMatches(
      "Seoul Bistro",
      "South Brisbane",
      items
    );
    const strong = pickStrongMatch(ranked);
    expect(strong?.name).toBe("Seoul Bistro");
  });

  it("does not invent a business from a street or suburb", () => {
    expect(categoryFromOsm("place", "suburb")).toBe("other");
    const suburbItem = items.at(2);
    expect(
      suburbItem
        ? rankNominatimMatches("South Brisbane", "Brisbane", [suburbItem])
        : []
    ).toStrictEqual([]);
  });
});

describe("listing evidence", () => {
  it("reads LocalBusiness facts and does not invent missing reviews", () => {
    const evidence = evidenceFromHtml(
      `
      <html><body>
        <a href="tel:+61730000000">Call</a>
        <script type="application/ld+json">
          {"@type":"Restaurant","name":"Seoul Bistro","telephone":"+61 7 3000 0000","url":"https://seoulbistro.example","openingHours":"Mo-Su 11:00-22:00"}
        </script>
      </body></html>
    `,
      "https://maps.example/listing"
    );

    expect(evidence).toMatchObject({
      fetched: true,
      hours: expect.stringContaining("11:00"),
      name: "Seoul Bistro",
      phone: "+61 7 3000 0000",
      reviewCount: undefined,
      website: "https://seoulbistro.example",
    });
    expect(
      urlsMatch(evidence.website, "https://www.seoulbistro.example/menu")
    ).toBeTruthy();
  });
});

describe("location and performance helpers", () => {
  it("reads suburb and state from a typed Australian address", () => {
    const parts = locationPartsFromAddress(
      "12 Example Street, South Brisbane QLD 4101, Australia"
    );
    expect(parts.state).toBe("QLD");
    expect(parts.locationParts.length).toBeGreaterThan(0);
  });

  it("parses synthetic LCP from Browser Rendering HTML", () => {
    const timing = parseSyntheticTiming(
      '<html data-listwell-lcp="2100" data-listwell-timing-kind="lcp"><body></body></html>'
    );
    expect(timing).toStrictEqual({ kind: "lcp", value: 2100 });
    const result = performanceFromTiming(timing.value, timing.kind);
    expect(result.passes).toBeTruthy();
    expect(result.message).toContain("Synthetic browser load");
    expect(result.message).not.toContain("Chrome UX Report data.");
  });
});
