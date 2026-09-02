import { describe, expect, it } from "vitest";
import {
  addUniqueProfile,
  appleAddress,
  candidateFromGooglePlace,
  candidateFromNominatim,
  discoverBusiness,
  filterProfilesForCandidate,
  namesMatch,
  pickSocialHit,
  profilesFromCandidates,
  profilesFromUserInput,
  socialProfileFromHit,
} from "./discover";

describe("discover helpers", () => {
  it("matches business names after accent folding", () => {
    expect(namesMatch("Cafe", "Café Luna")).toBe(true);
    expect(namesMatch("Seoul Bistro", "Seoul Bistro South Brisbane")).toBe(true);
    expect(namesMatch("Seoul Bistro", "Another Cafe")).toBe(false);
  });

  it("builds map and website profiles from candidates", () => {
    const profiles = profilesFromCandidates(
      [
        {
          source: "google",
          id: "places/abc",
          name: "Seoul Bistro",
          address: "12 Smith St",
          websiteUrl: "https://seoulbistro.example",
        },
        {
          source: "apple",
          id: "apple.1",
          name: "Seoul Bistro",
          address: "12 Smith Street",
        },
      ],
      "https://manual.example",
    );

    expect(profiles).toEqual([
      { type: "website", title: "https://manual.example" },
      {
        type: "google-maps",
        title: "Seoul Bistro",
        subtitle: "12 Smith St",
        googlePlaceId: "places/abc",
      },
      { type: "website", title: "https://seoulbistro.example" },
      {
        type: "apple-maps",
        title: "Seoul Bistro",
        subtitle: "12 Smith Street",
        appleMapsId: "apple.1",
      },
    ]);
  });

  it("treats a Facebook websiteUri as a Facebook profile", () => {
    const profiles = profilesFromCandidates([
      {
        source: "google",
        id: "places/abc",
        name: "Seoul Bistro",
        websiteUrl: "https://www.facebook.com/seoulbistro",
      },
    ]);

    expect(profiles.some((profile) => profile.type === "facebook")).toBe(true);
    expect(profiles.some((profile) => profile.type === "website")).toBe(false);
  });

  it("keeps only the selected map listing and shared socials", () => {
    const filtered = filterProfilesForCandidate(
      [
        { type: "google-maps", title: "Seoul Bistro", googlePlaceId: "places/abc" },
        { type: "google-maps", title: "Other Bistro", googlePlaceId: "places/other" },
        { type: "apple-maps", title: "Seoul Bistro", appleMapsId: "apple.1" },
        { type: "instagram", title: "seoulbistro" },
      ],
      { source: "google", id: "places/abc", name: "Seoul Bistro" },
    );

    expect(filtered.map((profile) => profile.type)).toEqual(["google-maps", "apple-maps", "instagram"]);
    expect(filtered.find((profile) => profile.type === "google-maps")?.googlePlaceId).toBe("places/abc");
  });

  it("picks the highest-scoring social hit above 0.7", () => {
    expect(
      pickSocialHit([
        { url: "https://facebook.com/low", title: "Low", score: 0.4 },
        { url: "https://facebook.com/mid", title: "Mid", score: 0.72 },
        { url: "https://facebook.com/high", title: "High", score: 0.91 },
      ])?.url,
    ).toBe("https://facebook.com/high");
    expect(pickSocialHit([{ url: "https://facebook.com/low", title: "Low", score: 0.4 }])).toBeNull();
  });

  it("stores usernames for Instagram and URLs for Facebook", () => {
    expect(
      socialProfileFromHit("instagram", {
        url: "https://instagram.com/seoulbistro",
        title: "Seoul Bistro",
        score: 0.9,
        username: "seoulbistro",
      }),
    ).toEqual({ type: "instagram", title: "seoulbistro" });
    expect(
      socialProfileFromHit("facebook", {
        url: "https://www.facebook.com/seoulbistro/",
        title: "Seoul Bistro",
        score: 0.9,
      }),
    ).toEqual({ type: "facebook", title: "https://www.facebook.com/seoulbistro/" });
  });

  it("maps a Nominatim match to an OSM candidate", () => {
    expect(
      candidateFromNominatim({
        id: "osm:node:11",
        name: "Seoul Bistro",
        address: "12 Example Street, South Brisbane",
        suburb: "South Brisbane",
        websiteUrl: "https://seoulbistro.example",
        osmClass: "amenity",
        osmType: "restaurant",
        categoryId: "food",
        score: 0.91,
      }),
    ).toEqual({
      source: "osm",
      id: "osm:node:11",
      name: "Seoul Bistro",
      address: "12 Example Street, South Brisbane",
      websiteUrl: "https://seoulbistro.example",
      types: ["restaurant", "amenity"],
      suburb: "South Brisbane",
      categoryId: "food",
      score: 0.91,
    });
  });

  it("builds profiles from pasted website, listing, and social URLs", () => {
    const profiles = profilesFromUserInput({
      businessName: "Seoul Bistro",
      websiteUrl: "https://seoulbistro.example",
      listingUrl: "https://maps.example/seoul-bistro",
      address: "12 Example Street",
      facebookUrl: "https://www.facebook.com/seoulbistro",
      instagramUsername: "seoulbistro",
    });

    expect(profiles).toEqual([
      { type: "website", title: "https://seoulbistro.example" },
      {
        type: "google-maps",
        title: "https://maps.example/seoul-bistro",
        subtitle: "12 Example Street",
        googlePlaceId: "https://maps.example/seoul-bistro",
      },
      { type: "facebook", title: "https://www.facebook.com/seoulbistro" },
      { type: "instagram", title: "seoulbistro" },
    ]);
  });

  it("dedupes profiles by type and title", () => {
    const profiles = profilesFromUserInput({
      businessName: "Seoul Bistro",
      websiteUrl: "https://seoulbistro.example",
    });
    addUniqueProfile(profiles, { type: "website", title: "https://seoulbistro.example" });
    expect(profiles).toHaveLength(1);
  });

  it("joins Apple formatted address lines", () => {
    expect(appleAddress(["12 Smith St", "Brisbane"])).toBe("12 Smith St, Brisbane");
    expect(appleAddress(undefined)).toBeUndefined();
  });

  it("maps a Google place to a candidate", () => {
    expect(
      candidateFromGooglePlace({
        id: "places/abc",
        displayName: { text: "Seoul Bistro" },
        formattedAddress: "12 Smith St",
        types: ["restaurant"],
      }),
    ).toMatchObject({
      source: "google",
      id: "places/abc",
      name: "Seoul Bistro",
    });
  });

  it("returns user-supplied profiles without paid lookup APIs", async () => {
    const result = await discoverBusiness(
      {
        businessName: "Seoul Bistro",
        websiteUrl: "https://seoulbistro.example",
        listingUrl: "https://maps.example/seoul-bistro",
        categoryId: "food",
      },
      {},
      {
        fetchImpl: async () => new Response("not found", { status: 404 }),
      },
    );

    expect(result.profiles.some((profile) => profile.type === "website")).toBe(true);
    expect(result.profiles.some((profile) => profile.type === "google-maps")).toBe(true);
    expect(result.categoryId).toBe("food");
  });
});
