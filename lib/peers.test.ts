import type { GooglePlace } from "@listwell/audit-engine";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  NEARBY_RADIUS_METERS,
  WIDENED_RADIUS_METERS,
  choosePeerPlaces,
  competitorCheckStatus,
  findPeerPlaces,
  isPeerJobReusable,
  mapPackLeaders,
  orderPeerCheckRows,
  scoreFromCheckValues,
  searchSourcedCheckIds,
  selectCompetitorPlaces,
  sharedPeerCacheKey,
  snapshotForPeer,
  whereCompetitorsBeatYou,
} from "./peers";
import { SCAN_REUSE_WINDOW_MS } from "./scan-freshness";

const place = (id: string, primaryType: string, name = id): GooglePlace => ({
  displayName: { text: name },
  id,
  primaryType,
});

const mapPackCell = (placeId: string) => ({ top: [{ placeId }] });

const requestBodySchema = z.object({
  includedTypes: z.array(z.string()).optional(),
  locationBias: z
    .object({
      circle: z.object({ radius: z.number() }),
    })
    .optional(),
  locationRestriction: z
    .object({
      circle: z.object({ radius: z.number() }),
    })
    .optional(),
  textQuery: z.string().optional(),
});

const subjectPlace = (): GooglePlace => ({
  addressComponents: [{ longText: "Sydney", types: ["locality"] }],
  displayName: { text: "Sample Cafe" },
  formattedAddress: "1 George St, Sydney NSW",
  id: "subject",
  location: { latitude: -33.87, longitude: 151.21 },
  primaryType: "cafe",
  primaryTypeDisplayName: { text: "Cafe" },
});

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

const readBody = (init?: RequestInit) =>
  requestBodySchema.parse(JSON.parse(String(init?.body ?? "{}")));

const jsonResponse = (places: GooglePlace[]): Response =>
  Response.json({ places });

describe(choosePeerPlaces, () => {
  it("drops the subject and other place types, keeps popularity order, and caps at 4", () => {
    const selected = choosePeerPlaces({
      closePlaces: [
        place("a", "cafe", "Alpha"),
        place("places/subject", "cafe", "Self"),
        place("bakery", "restaurant", "Bakery"),
        place("c", "cafe", "Charlie"),
        place("d", "cafe", "Delta"),
        place("e", "cafe", "Echo"),
        place("f", "cafe", "Foxtrot"),
      ],
      farPlaces: [place("far", "cafe", "Far Cafe")],
      primaryType: "cafe",
      selfPlaceId: "subject",
      textPlaces: [],
    });

    expect({
      ids: selected.peers.map((peer) => peer.id),
      radiusMeters: selected.radiusMeters,
      source: selected.source,
    }).toStrictEqual({
      ids: ["a", "c", "d", "e"],
      radiusMeters: NEARBY_RADIUS_METERS,
      source: "nearby",
    });
  });

  it("uses the wider search only when the close search has fewer than two peers", () => {
    const selected = choosePeerPlaces({
      closePlaces: [place("only", "cafe", "Only")],
      farPlaces: [
        place("b", "cafe", "Bravo"),
        place("a", "cafe", "Alpha"),
        place("c", "cafe", "Charlie"),
      ],
      primaryType: "cafe",
      selfPlaceId: "subject",
      textPlaces: [place("text", "cafe", "Text")],
    });

    expect({
      names: selected.peers.map((peer) => peer.displayName?.text),
      radiusMeters: selected.radiusMeters,
      source: selected.source,
    }).toStrictEqual({
      names: ["Bravo", "Alpha", "Charlie"],
      radiusMeters: WIDENED_RADIUS_METERS,
      source: "nearby",
    });
  });

  it("falls back to biased text search when nearby search finds nobody", () => {
    const selected = choosePeerPlaces({
      closePlaces: [place("subject", "cafe", "Self")],
      farPlaces: [place("bakery", "restaurant", "Bakery")],
      primaryType: "cafe",
      selfPlaceId: "subject",
      textPlaces: [place("text", "cafe", "Text Cafe")],
    });

    expect({
      ids: selected.peers.map((peer) => peer.id),
      radiusMeters: selected.radiusMeters,
      source: selected.source,
    }).toStrictEqual({
      ids: ["text"],
      radiusMeters: WIDENED_RADIUS_METERS,
      source: "text",
    });
  });
});

describe(findPeerPlaces, () => {
  it("does not widen the radius when the first search already has peers", async () => {
    const radii: number[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      const url = requestUrl(input);
      if (!url.includes("searchNearby")) {
        return Promise.reject(new Error(`Unexpected ${url}`));
      }
      const body = readBody(init);
      radii.push(body.locationRestriction?.circle.radius ?? 0);
      return Promise.resolve(
        jsonResponse([
          place("subject", "cafe", "Self"),
          place("a", "cafe", "Alpha"),
          place("b", "cafe", "Bravo"),
          place("other", "restaurant", "Not a cafe"),
        ])
      );
    };

    const result = await findPeerPlaces({
      fetchImpl,
      googleApiKey: "test-key",
      place: subjectPlace(),
      selfPlaceId: "subject",
    });

    expect({
      ids: result.peers.map((peer) => peer.id),
      label: result.placeTypeLabel,
      radii,
      unavailable: result.unavailable,
    }).toStrictEqual({
      ids: ["a", "b"],
      label: "Cafe",
      radii: [NEARBY_RADIUS_METERS],
      unavailable: null,
    });
  });

  it("retries a wider circle, then a text search, only when nearby results stay thin", async () => {
    const calls: string[] = [];
    let textQuery = "";
    const fetchImpl: typeof fetch = (input, init) => {
      const url = requestUrl(input);
      const body = readBody(init);
      if (url.includes("searchText")) {
        textQuery = body.textQuery ?? "";
        calls.push(`text:${body.locationBias?.circle.radius ?? 0}`);
        return Promise.resolve(
          jsonResponse([place("text", "cafe", "Text Cafe")])
        );
      }
      const radius = body.locationRestriction?.circle.radius ?? 0;
      calls.push(`nearby:${radius}`);
      return Promise.resolve(jsonResponse([]));
    };

    const result = await findPeerPlaces({
      fetchImpl,
      googleApiKey: "test-key",
      place: subjectPlace(),
      selfPlaceId: "subject",
    });

    expect({
      calls,
      ids: result.peers.map((peer) => peer.id),
      source: result.source,
      textQuery,
    }).toStrictEqual({
      calls: [
        `nearby:${NEARBY_RADIUS_METERS}`,
        `nearby:${WIDENED_RADIUS_METERS}`,
        `text:${WIDENED_RADIUS_METERS}`,
      ],
      ids: ["text"],
      source: "text",
      textQuery: "Cafe near Sydney",
    });
  });

  it("does not invent peers when Google has no specific place type", async () => {
    let called = false;
    const fetchImpl: typeof fetch = () => {
      called = true;
      return Promise.resolve(jsonResponse([]));
    };

    const result = await findPeerPlaces({
      fetchImpl,
      googleApiKey: "test-key",
      place: { ...subjectPlace(), primaryType: "establishment" },
      selfPlaceId: "subject",
    });

    expect({
      called,
      peers: result.peers,
      unavailable: result.unavailable,
    }).toStrictEqual({
      called: false,
      peers: [],
      unavailable: "no_type",
    });
  });
});

describe(snapshotForPeer, () => {
  it("maps the place website and Google place id through the profile mapper", () => {
    const snapshot = snapshotForPeer(
      {
        displayName: { text: "Other Cafe" },
        formattedAddress: "2 George St, Sydney NSW",
        id: "peer-1",
        primaryType: "cafe",
        websiteUri: "https://other.example",
      },
      [{ title: "othercafe", type: "instagram" }]
    );

    expect({
      address: snapshot.locations[0]?.address,
      category: snapshot.category,
      instagramUsername: snapshot.instagramUsername,
      name: snapshot.name,
      placeId: snapshot.locations[0]?.googlePlaceId,
      websiteUrl: snapshot.websiteUrl,
    }).toStrictEqual({
      address: "2 George St, Sydney NSW",
      category: "food",
      instagramUsername: "othercafe",
      name: "Other Cafe",
      placeId: "peer-1",
      websiteUrl: "https://other.example",
    });
  });
});

describe(scoreFromCheckValues, () => {
  it("ignores skipped checks the same way the report score does", () => {
    expect(scoreFromCheckValues([true, true, false, null])).toStrictEqual({
      fail: 1,
      pass: 2,
      score: 67,
      skipped: 1,
    });
  });
});

describe(orderPeerCheckRows, () => {
  it("leads with checks the subject fails and a peer passes", () => {
    const ordered = orderPeerCheckRows([
      {
        id: "website",
        peerValues: [true],
        subjectValue: true,
      },
      {
        id: "google-listing-rating",
        peerValues: [true],
        subjectValue: false,
      },
      {
        id: "website-title",
        peerValues: [false],
        subjectValue: false,
      },
    ]);

    expect(ordered.map((row) => row.id)).toStrictEqual([
      "google-listing-rating",
      "website",
      "website-title",
    ]);
  });
});

describe(selectCompetitorPlaces, () => {
  it("puts pinned places first, then nearby, and keeps at most four", () => {
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: [],
      nearbyPlaces: [
        place("near-1", "cafe", "Near 1"),
        place("near-2", "cafe", "Near 2"),
        place("near-3", "cafe", "Near 3"),
        place("pinned-1", "cafe", "Already nearby"),
      ],
      pinnedPlaces: [
        place("pinned-1", "restaurant", "Pinned cafe"),
        place("pinned-2", "bar", "Pinned bar"),
      ],
      preview: false,
      selfPlaceId: "subject",
    });

    expect(
      selected.map((item) => ({ id: item.place.id, source: item.source }))
    ).toStrictEqual([
      { id: "pinned-1", source: "pinned" },
      { id: "pinned-2", source: "pinned" },
      { id: "near-1", source: "nearby" },
      { id: "near-2", source: "nearby" },
    ]);
  });

  it("never returns a hidden place", () => {
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: ["places/near-1", "pinned-1"],
      nearbyPlaces: [
        place("near-1", "cafe", "Hidden nearby"),
        place("near-2", "cafe", "Kept"),
      ],
      pinnedPlaces: [place("pinned-1", "bar", "Hidden pin")],
      preview: false,
      selfPlaceId: "subject",
    });

    expect(selected.map((item) => item.place.id)).toStrictEqual(["near-2"]);
  });

  it("uses nearby places only in a preview", () => {
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: ["near-2"],
      nearbyPlaces: [
        place("near-1", "cafe", "Near 1"),
        place("near-2", "cafe", "Hidden"),
        place("near-3", "cafe", "Near 3"),
      ],
      pinnedPlaces: [place("pinned-1", "cafe", "Pinned")],
      preview: true,
      selfPlaceId: "subject",
    });

    expect(
      selected.map((item) => ({ id: item.place.id, source: item.source }))
    ).toStrictEqual([
      { id: "near-1", source: "nearby" },
      { id: "near-3", source: "nearby" },
    ]);
  });

  it("fills remaining slots with map-pack leaders, then nearby, and caps at four", () => {
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: ["hidden-pack"],
      mapPackPlaces: [
        {
          phrase: "cafe Newtown",
          place: place("pack-1", "coffee_shop", "Pack 1"),
        },
        { phrase: "coffee", place: place("pack-2", "cafe", "Pack 2") },
        {
          phrase: "coffee",
          place: place("hidden-pack", "cafe", "Hidden pack"),
        },
      ],
      nearbyPlaces: [
        place("near-1", "cafe", "Near 1"),
        place("near-2", "cafe", "Near 2"),
        place("pack-1", "cafe", "Also nearby"),
      ],
      pinnedPlaces: [place("pinned-1", "bar", "Pinned")],
      preview: false,
      selfPlaceId: "subject",
    });

    expect(
      selected.map((item) => ({
        id: item.place.id,
        phrase: item.mapPackPhrase,
        source: item.source,
      }))
    ).toStrictEqual([
      { id: "pinned-1", phrase: undefined, source: "pinned" },
      { id: "pack-1", phrase: "cafe Newtown", source: "map_pack" },
      { id: "pack-2", phrase: "coffee", source: "map_pack" },
      { id: "near-1", phrase: undefined, source: "nearby" },
    ]);
  });

  it("keeps a preview on nearby places when map-pack leaders are supplied", () => {
    const selected = selectCompetitorPlaces({
      hiddenPlaceIds: [],
      mapPackPlaces: [
        {
          phrase: "cafe Newtown",
          place: place("pack-1", "coffee_shop", "Pack"),
        },
      ],
      nearbyPlaces: [place("near-1", "cafe", "Near 1")],
      pinnedPlaces: [place("pinned-1", "bar", "Pinned")],
      preview: true,
      selfPlaceId: "subject",
    });

    expect(selected.map((item) => item.place.id)).toStrictEqual(["near-1"]);
  });
});

describe(mapPackLeaders, () => {
  it("ranks places by map-pack cells and drops hidden places", () => {
    const leaders = mapPackLeaders({
      grids: [
        {
          cells: [
            mapPackCell("pack-1"),
            mapPackCell("pack-1"),
            mapPackCell("hidden"),
          ],
          phrase: "cafe Newtown",
        },
        {
          cells: [mapPackCell("pack-2"), mapPackCell("subject")],
          phrase: "coffee",
        },
      ],
      hiddenPlaceIds: ["places/hidden"],
      selfPlaceId: "subject",
    });

    expect(leaders.map((leader) => leader.placeId)).toStrictEqual([
      "pack-1",
      "pack-2",
    ]);
    expect(leaders[0]?.phrase).toBe("cafe Newtown");
  });
});

describe(searchSourcedCheckIds, () => {
  it("labels social checks that came from search, not the website", () => {
    const ids = searchSourcedCheckIds(["instagram", "website"]);

    expect(ids.has("instagram-profile")).toBeTruthy();
    expect(ids.has("social-profile-banner")).toBeTruthy();
    expect(ids.has("website")).toBeFalsy();
  });
});

describe(competitorCheckStatus, () => {
  it("treats an unknown competitor check as unknown, not a fail", () => {
    expect(competitorCheckStatus(null)).toBe("unknown");
    expect(competitorCheckStatus(null)).not.toBe("fail");
    expect(competitorCheckStatus(false)).toBe("fail");
    expect(competitorCheckStatus(true)).toBe("pass");
  });
});

describe(whereCompetitorsBeatYou, () => {
  it("summarises a check that 2 of 3 competitors pass and this business fails", () => {
    const lines = whereCompetitorsBeatYou({
      checks: [
        {
          peerValues: [true, true, false],
          subjectValue: false,
          title: "Photo gallery",
        },
        {
          peerValues: [true, false, null],
          subjectValue: false,
          title: "Opening hours",
        },
      ],
      numbers: [
        {
          higherIsBetter: true,
          kind: "photoCount",
          peers: [80, 60, null],
          subject: 8,
        },
      ],
    });

    expect(lines).toStrictEqual([
      "2 of 3 competitors pass Photo gallery. You do not.",
      "2 of 3 competitors have more photos than you. You have 8.",
    ]);
  });
});

describe(sharedPeerCacheKey, () => {
  it("shares one place id across businesses and only keeps a finished job for an hour", () => {
    expect(sharedPeerCacheKey("places/ChIJCafe")).toBe("place:ChIJCafe");
    expect(sharedPeerCacheKey("ChIJCafe")).toBe(
      sharedPeerCacheKey("places/ChIJCafe")
    );

    const now = 1_700_000_000_000;
    const recent = {
      createdAt: now - 2 * 60 * 60 * 1000,
      status: "complete",
      updatedAt: now - 30 * 60 * 1000,
    } satisfies {
      createdAt: number;
      status: "complete" | "error";
      updatedAt: number;
    };
    expect(isPeerJobReusable(recent, now)).toBeTruthy();
    expect(
      isPeerJobReusable(
        { ...recent, updatedAt: now - SCAN_REUSE_WINDOW_MS },
        now
      )
    ).toBeFalsy();
    expect(
      isPeerJobReusable({ ...recent, status: "error", updatedAt: now }, now)
    ).toBeFalsy();
  });
});
