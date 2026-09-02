import { describe, expect, it } from "vitest";
import {
  addUniqueProfile,
  candidateFromNominatim,
  discoverBusiness,
  profilesFromUserInput,
} from "./discover";

describe("discover helpers", () => {
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

  it("dedupes profiles by type and title", () => {
    const profiles = profilesFromUserInput({
      businessName: "Seoul Bistro",
      websiteUrl: "https://seoulbistro.example",
    });
    addUniqueProfile(profiles, { type: "website", title: "https://seoulbistro.example" });
    expect(profiles).toHaveLength(1);
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

    expect(result.candidates).toEqual([]);
    expect(result.profiles.some((profile) => profile.type === "website")).toBe(true);
    expect(result.profiles.some((profile) => profile.type === "google-maps")).toBe(true);
    expect(result.categoryId).toBe("food");
  });
});
