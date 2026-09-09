import { describe, expect, it } from "vitest";

import { listingLookupSkipMessage } from "./chat-onboarding";
import {
  addUniqueProfile,
  appleAddress,
  buildPlaceSearchQueries,
  candidateFromGooglePlace,
  candidateFromNominatim,
  dedupePlaceCandidates,
  discoverBusiness,
  filterProfilesForCandidate,
  namesMatch,
  pickSocialHit,
  profilesFromCandidates,
  profilesFromUserInput,
  rankPlaceCandidates,
  socialProfileFromHit,
} from "./discover";

describe("discover helpers", () => {
  it("explains when listing lookup is skipped because providers are unavailable", () => {
    expect(listingLookupSkipMessage("unavailable")).toContain("not configured");
    expect(listingLookupSkipMessage("empty")).toContain(
      "could not find a matching listing"
    );
  });

  it("builds location-aware search query variants", () => {
    expect(
      buildPlaceSearchQueries("Willow Whip Gelato", "South Brisbane")
    ).toStrictEqual([
      "Willow Whip Gelato, South Brisbane",
      "Willow Whip Gelato South Brisbane",
      "Willow Whip Gelato, South Brisbane, Australia",
      "Willow Whip Gelato",
    ]);
    expect(buildPlaceSearchQueries("Seoul Bistro", "")).toStrictEqual([
      "Seoul Bistro",
    ]);
  });

  it("dedupes candidates by source and id", () => {
    const candidates = dedupePlaceCandidates([
      { id: "places/abc", name: "Seoul Bistro", source: "google" },
      { id: "places/abc", name: "Seoul Bistro", source: "google" },
      { id: "apple.1", name: "Seoul Bistro", source: "apple" },
    ]);
    expect(candidates).toHaveLength(2);
  });

  it("ranks candidates with matching suburb higher", () => {
    const ranked = rankPlaceCandidates(
      [
        {
          address: "1 Queen St, Melbourne",
          id: "places/far",
          name: "Seoul Bistro",
          source: "google",
        },
        {
          address: "12 Smith St, South Brisbane",
          id: "places/near",
          name: "Seoul Bistro",
          source: "google",
        },
      ],
      "Seoul Bistro",
      "South Brisbane"
    );
    expect(ranked[0]?.id).toBe("places/near");
  });

  it("matches business names after accent folding", () => {
    expect(namesMatch("Cafe", "Café Luna")).toBeTruthy();
    expect(
      namesMatch("Seoul Bistro", "Seoul Bistro South Brisbane")
    ).toBeTruthy();
    expect(namesMatch("Seoul Bistro", "Another Cafe")).toBeFalsy();
  });

  it("builds map and website profiles from candidates", () => {
    const profiles = profilesFromCandidates(
      [
        {
          address: "12 Smith St",
          id: "places/abc",
          name: "Seoul Bistro",
          source: "google",
          websiteUrl: "https://seoulbistro.example",
        },
        {
          address: "12 Smith Street",
          id: "apple.1",
          name: "Seoul Bistro",
          source: "apple",
        },
      ],
      "https://manual.example"
    );

    expect(profiles).toStrictEqual([
      { title: "https://manual.example", type: "website" },
      {
        googlePlaceId: "places/abc",
        subtitle: "12 Smith St",
        title: "Seoul Bistro",
        type: "google-maps",
      },
      { title: "https://seoulbistro.example", type: "website" },
      {
        appleMapsId: "apple.1",
        subtitle: "12 Smith Street",
        title: "Seoul Bistro",
        type: "apple-maps",
      },
    ]);
  });

  it("treats a Facebook websiteUri as a Facebook profile", () => {
    const profiles = profilesFromCandidates([
      {
        id: "places/abc",
        name: "Seoul Bistro",
        source: "google",
        websiteUrl: "https://www.facebook.com/seoulbistro",
      },
    ]);

    expect(
      profiles.some((profile) => profile.type === "facebook")
    ).toBeTruthy();
    expect(profiles.some((profile) => profile.type === "website")).toBeFalsy();
  });

  it("keeps only the selected map listing and shared socials", () => {
    const filtered = filterProfilesForCandidate(
      [
        {
          googlePlaceId: "places/abc",
          title: "Seoul Bistro",
          type: "google-maps",
        },
        {
          googlePlaceId: "places/other",
          title: "Other Bistro",
          type: "google-maps",
        },
        { appleMapsId: "apple.1", title: "Seoul Bistro", type: "apple-maps" },
        { title: "seoulbistro", type: "instagram" },
      ],
      { id: "places/abc", name: "Seoul Bistro", source: "google" }
    );

    expect(filtered.map((profile) => profile.type)).toStrictEqual([
      "google-maps",
      "apple-maps",
      "instagram",
    ]);
    expect(
      filtered.find((profile) => profile.type === "google-maps")?.googlePlaceId
    ).toBe("places/abc");
  });

  it("picks the highest-scoring social hit above 0.7", () => {
    expect(
      pickSocialHit([
        { score: 0.4, title: "Low", url: "https://facebook.com/low" },
        { score: 0.72, title: "Mid", url: "https://facebook.com/mid" },
        { score: 0.91, title: "High", url: "https://facebook.com/high" },
      ])?.url
    ).toBe("https://facebook.com/high");
    expect(
      pickSocialHit([
        { score: 0.4, title: "Low", url: "https://facebook.com/low" },
      ])
    ).toBeNull();
  });

  it("stores usernames for Instagram and URLs for Facebook", () => {
    expect(
      socialProfileFromHit("instagram", {
        score: 0.9,
        title: "Seoul Bistro",
        url: "https://instagram.com/seoulbistro",
        username: "seoulbistro",
      })
    ).toStrictEqual({ title: "seoulbistro", type: "instagram" });
    expect(
      socialProfileFromHit("facebook", {
        score: 0.9,
        title: "Seoul Bistro",
        url: "https://www.facebook.com/seoulbistro/",
      })
    ).toStrictEqual({
      title: "https://www.facebook.com/seoulbistro/",
      type: "facebook",
    });
  });

  it("maps a Nominatim match to an OSM candidate", () => {
    expect(
      candidateFromNominatim({
        address: "12 Example Street, South Brisbane",
        categoryId: "food",
        id: "osm:node:11",
        name: "Seoul Bistro",
        osmClass: "amenity",
        osmType: "restaurant",
        score: 0.91,
        suburb: "South Brisbane",
        websiteUrl: "https://seoulbistro.example",
      })
    ).toStrictEqual({
      address: "12 Example Street, South Brisbane",
      categoryId: "food",
      id: "osm:node:11",
      name: "Seoul Bistro",
      score: 0.91,
      source: "osm",
      suburb: "South Brisbane",
      types: ["restaurant", "amenity"],
      websiteUrl: "https://seoulbistro.example",
    });
  });

  it("builds profiles from pasted website, listing, and social URLs", () => {
    const profiles = profilesFromUserInput({
      address: "12 Example Street",
      businessName: "Seoul Bistro",
      facebookUrl: "https://www.facebook.com/seoulbistro",
      instagramUsername: "seoulbistro",
      listingUrl: "https://maps.example/seoul-bistro",
      websiteUrl: "https://seoulbistro.example",
    });

    expect(profiles).toStrictEqual([
      { title: "https://seoulbistro.example", type: "website" },
      {
        googlePlaceId: "https://maps.example/seoul-bistro",
        subtitle: "12 Example Street",
        title: "https://maps.example/seoul-bistro",
        type: "google-maps",
      },
      { title: "https://www.facebook.com/seoulbistro", type: "facebook" },
      { title: "seoulbistro", type: "instagram" },
    ]);
  });

  it("dedupes profiles by type and title", () => {
    const profiles = profilesFromUserInput({
      businessName: "Seoul Bistro",
      websiteUrl: "https://seoulbistro.example",
    });
    addUniqueProfile(profiles, {
      title: "https://seoulbistro.example",
      type: "website",
    });
    expect(profiles).toHaveLength(1);
  });

  it("joins Apple formatted address lines", () => {
    expect(appleAddress(["12 Smith St", "Brisbane"])).toBe(
      "12 Smith St, Brisbane"
    );
    expect(appleAddress()).toBeUndefined();
  });

  it("maps a Google place to a candidate", () => {
    expect(
      candidateFromGooglePlace({
        displayName: { text: "Seoul Bistro" },
        formattedAddress: "12 Smith St",
        id: "places/abc",
        types: ["restaurant"],
      })
    ).toMatchObject({
      id: "places/abc",
      name: "Seoul Bistro",
      source: "google",
    });
  });

  it("returns user-supplied profiles without paid lookup APIs", async () => {
    const result = await discoverBusiness(
      {
        businessName: "Seoul Bistro",
        categoryId: "food",
        listingUrl: "https://maps.example/seoul-bistro",
        websiteUrl: "https://seoulbistro.example",
      },
      {},
      {
        fetchImpl: () =>
          Promise.resolve(new Response("not found", { status: 404 })),
      }
    );

    expect(
      result.profiles.some((profile) => profile.type === "website")
    ).toBeTruthy();
    expect(
      result.profiles.some((profile) => profile.type === "google-maps")
    ).toBeTruthy();
    expect(result.categoryId).toBe("food");
  });
});
