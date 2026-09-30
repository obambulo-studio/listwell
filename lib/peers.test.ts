import type { GooglePlace } from "@listwell/audit-engine";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  NEARBY_RADIUS_METERS,
  WIDENED_RADIUS_METERS,
  choosePeerPlaces,
  findPeerPlaces,
  isPeerJobReusable,
  orderPeerCheckRows,
  scoreFromCheckValues,
  sharedPeerCacheKey,
  snapshotForPeer,
} from "./peers";
import { SCAN_REUSE_WINDOW_MS } from "./scan-freshness";

const place = (id: string, primaryType: string, name = id): GooglePlace => ({
  displayName: { text: name },
  id,
  primaryType,
});

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
