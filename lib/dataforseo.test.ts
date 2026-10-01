import { afterEach, describe, expect, it, vi } from "vitest";

import {
  aiMentionFor,
  bareDomain,
  cacheJsonFromResult,
  callLive,
  createDataForSeoClient,
  DATAFORSEO_API_HOST,
  DATAFORSEO_SANDBOX_HOST,
  dataForSeoBaseUrl,
  dataForSeoClientFromEnv,
  estimateCostUsdMicros,
  getTaskResult,
  linkGapFromResult,
  mapsPlacesFromResult,
  organicPositionFor,
  organicSnapshotFromResult,
  parseDataForSeoTimestamp,
  postQueuedTask,
  rankGridCell,
  readQueuedTask,
  receiveDataForSeoPostback,
  reviewSampleFromResult,
} from "./dataforseo";
import type { TaskStore } from "./dataforseo";

const apiKey = btoa("login:password");

interface SentRequest {
  body: unknown;
  headers: Headers;
  method: string;
  url: string;
}

const envelope = (task: {
  cost?: number;
  id?: string;
  result?: unknown[] | null;
  statusCode?: number;
}) => ({
  cost: task.cost ?? 0,
  status_code: 20_000,
  tasks: [
    {
      cost: task.cost ?? 0,
      id: task.id ?? "task-1",
      result: task.result ?? null,
      status_code: task.statusCode ?? 20_000,
      status_message: "Ok.",
    },
  ],
});

const fakeFetch = (responses: unknown[]) => {
  const sent: SentRequest[] = [];
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    (url, init) => {
      sent.push({
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        headers: new Headers(init.headers),
        method: init.method ?? "GET",
        url,
      });
      return Promise.resolve(Response.json(responses.shift()));
    }
  );
  return { fetch, sent };
};

const requestTasks = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null
      )
    : [];

const memoryStore = (): TaskStore & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(values.get(key) ?? null),
    put: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    values,
  };
};

const gzip = (value: unknown): Promise<ArrayBuffer> =>
  new Response(
    new Blob([JSON.stringify(value)])
      .stream()
      .pipeThrough(new CompressionStream("gzip"))
  ).arrayBuffer();

const organicItems = [
  {
    items: [
      {
        references: [
          {
            domain: "broadsheet.com.au",
            source: "Broadsheet",
            title: "Best cafes",
            url: "https://broadsheet.com.au/cafes",
          },
        ],
        type: "ai_overview_element",
      },
      {
        components: [
          {
            references: [
              {
                domain: "www.ourcafe.com.au",
                source: "Our cafe",
                title: "Menu",
                url: "https://www.ourcafe.com.au/menu",
              },
            ],
          },
        ],
        type: "ai_overview_expanded_element",
      },
    ],
    references: [
      {
        domain: "broadsheet.com.au",
        source: "Broadsheet",
        title: "Best cafes",
        url: "https://broadsheet.com.au/cafes",
      },
    ],
    type: "ai_overview",
  },
  {
    domain: "broadsheet.com.au",
    rank_group: 1,
    title: "Best cafes",
    type: "organic",
    url: "https://broadsheet.com.au/cafes",
  },
  { items: ["cafe near me", "brunch"], type: "related_searches" },
  {
    domain: "www.ourcafe.com.au",
    rank_group: 2,
    title: "Our cafe",
    type: "organic",
    url: "https://www.ourcafe.com.au/",
  },
];

describe("dataforseo host", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects the sandbox host when sandbox is on", () => {
    expect(dataForSeoBaseUrl(true)).toBe(`${DATAFORSEO_SANDBOX_HOST}/v3`);
    expect(dataForSeoBaseUrl(false)).toBe(`${DATAFORSEO_API_HOST}/v3`);
  });

  it("reads DATAFORSEO_SANDBOX=1 from the environment", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", apiKey);
    vi.stubEnv("DATAFORSEO_SANDBOX", "1");
    vi.stubEnv("SITE_URL", "https://listwell.example");
    const client = await dataForSeoClientFromEnv();
    expect(client?.sandbox).toBeTruthy();
    expect(client?.baseUrl).toBe(`${DATAFORSEO_SANDBOX_HOST}/v3`);
    expect(client?.postbackUrl).toBe(
      "https://listwell.example/api/internal/dataforseo/postback"
    );
  });

  it("returns no client without an API key", async () => {
    vi.stubEnv("DATAFORSEO_API_KEY", "");
    await expect(dataForSeoClientFromEnv()).resolves.toBeNull();
  });

  it("rejects an API key that is not base64 login:password", () => {
    expect(() => createDataForSeoClient({ apiKey: "not-a-key" })).toThrow(
      "base64"
    );
  });

  it("sends sandbox calls to the sandbox host at no cost", async () => {
    const { fetch, sent } = fakeFetch([
      envelope({ cost: 0.0101, result: [{ backlinks: 5, rank: 12 }] }),
    ]);
    const client = createDataForSeoClient({ apiKey, fetch, sandbox: true });
    expect(estimateCostUsdMicros(client, "backlinksSummary", "live")).toBe(0);
    const call = await callLive(client, "backlinksSummary", {
      target: "ourcafe.com.au",
    });
    expect(sent[0]?.url).toBe(
      `${DATAFORSEO_SANDBOX_HOST}/v3/backlinks/summary/live`
    );
    expect(call.costUsdMicros).toBe(0);
    expect(call.result?.backlinks).toBe(5);
  });
});

describe("dataforseo live calls", () => {
  it("authenticates, posts one task, and records the returned cost", async () => {
    const { fetch, sent } = fakeFetch([
      envelope({
        cost: 0.0123,
        result: [{ items: [{ keyword: "cafe fitzroy" }] }],
      }),
    ]);
    const client = createDataForSeoClient({ apiKey, fetch });
    const call = await callLive(client, "keywordOverview", {
      keywords: ["cafe fitzroy"],
    });
    expect(sent[0]?.headers.get("authorization")).toBe(`Basic ${apiKey}`);
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).toStrictEqual([
      { keywords: ["cafe fitzroy"], language_code: "en", location_code: 2036 },
    ]);
    expect(call.costUsdMicros).toBe(12_300);
    expect(estimateCostUsdMicros(client, "keywordOverview", "live")).toBe(
      12_300
    );
  });

  it("throws a DataForSeoError when the task fails", async () => {
    const { fetch } = fakeFetch([
      envelope({ cost: 0, result: null, statusCode: 40_501 }),
    ]);
    const client = createDataForSeoClient({ apiKey, fetch });
    await expect(
      callLive(client, "domainRankOverview", { target: "ourcafe.com.au" })
    ).rejects.toMatchObject({ name: "DataForSeoError", statusCode: 40_501 });
  });

  it("sends Maps grid points as coordinates with zoom", async () => {
    const { fetch, sent } = fakeFetch([envelope({ result: [{ items: [] }] })]);
    const client = createDataForSeoClient({ apiKey, fetch });
    await callLive(client, "maps", {
      keyword: "cafe",
      point: { latitude: -37.8, longitude: 144.96 },
    });
    expect(sent[0]?.body).toStrictEqual([
      expect.objectContaining({
        location_coordinate: "-37.8000000,144.9600000,15z",
      }),
    ]);
  });

  it("reports a queued task that is not ready", async () => {
    const { fetch, sent } = fakeFetch([envelope({ statusCode: 40_602 })]);
    const client = createDataForSeoClient({ apiKey, fetch });
    await expect(
      getTaskResult(client, "reviews", "abc")
    ).resolves.toStrictEqual({
      ready: false,
    });
    expect(sent[0]?.method).toBe("GET");
    expect(sent[0]?.url).toContain("business_data/google/reviews/task_get/abc");
  });
});

const postMapsTask = async (store: TaskStore) => {
  const { fetch, sent } = fakeFetch([
    envelope({ cost: 0.0006, id: "task-9", statusCode: 20_100 }),
  ]);
  const client = createDataForSeoClient({
    apiKey,
    fetch,
    siteUrl: "https://listwell.example",
  });
  const posted = await postQueuedTask(
    client,
    "maps",
    { keyword: "cafe", point: { latitude: -37.8, longitude: 144.96 } },
    {
      businessExternalId: "biz_1",
      cacheFingerprint: "seo:rank_grid:2026-10:cafe:-37.800,144.960:4",
      cellIndex: 4,
      kind: "rank_grid",
      observationId: null,
      periodStart: "2026-10-01T00:00:00.000Z",
      phraseId: "phrase_1",
      pinId: "pin_1",
    },
    store
  );
  return { posted, sent };
};

describe("dataforseo queued tasks", () => {
  it("posts with a postback URL carrying a per-task token", async () => {
    const store = memoryStore();
    const { posted, sent } = await postMapsTask(store);
    const [body] = requestTasks(sent[0]?.body);
    expect(posted.costUsdMicros).toBe(600);
    expect(body?.postback_data).toBe("advanced");
    expect(body?.postback_url).toBe(
      `https://listwell.example/api/internal/dataforseo/postback?id=$id&token=${posted.token}`
    );
    expect([...store.values.keys()].join(",")).not.toContain(posted.token);
  });

  it("accepts the gzip postback and stores the parsed result", async () => {
    const store = memoryStore();
    const { posted } = await postMapsTask(store);
    const onComplete = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const outcome = await receiveDataForSeoPostback({
      body: await gzip(
        envelope({
          id: "task-9",
          result: [
            {
              items: [
                {
                  place_id: "place_a",
                  rank_group: 1,
                  title: "Cafe A",
                  type: "maps_search",
                },
              ],
            },
          ],
        })
      ),
      onComplete,
      store,
      taskId: "task-9",
      token: posted.token,
    });
    expect(outcome.ok).toBeTruthy();
    expect(onComplete).toHaveBeenCalledOnce();
    const record = await readQueuedTask(posted.token, store);
    expect(record).toMatchObject({ status: "complete", taskId: "task-9" });
    expect(
      cacheJsonFromResult("maps", JSON.parse(record?.resultJson ?? "null"))
    ).toContain("Cafe A");
  });

  it("rejects an unknown postback token", async () => {
    const outcome = await receiveDataForSeoPostback({
      body: await gzip(envelope({})),
      store: memoryStore(),
      taskId: "task-1",
      token: "nope",
    });
    expect(outcome).toMatchObject({ ok: false, status: 401 });
  });

  it("needs a site URL for postbacks", async () => {
    const { fetch } = fakeFetch([]);
    const client = createDataForSeoClient({ apiKey, fetch });
    await expect(
      postQueuedTask(
        client,
        "reviews",
        { cid: "123", placeId: null },
        {
          businessExternalId: null,
          cacheFingerprint: null,
          cellIndex: null,
          kind: "review_sample",
          observationId: null,
          periodStart: null,
          phraseId: null,
          pinId: null,
        },
        memoryStore()
      )
    ).rejects.toThrow("SITE_URL");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("dataforseo mappers", () => {
  it("keeps organic results and every nested AI Overview citation", () => {
    const snapshot = organicSnapshotFromResult({ items: organicItems });
    expect(snapshot.aiOverview.present).toBeTruthy();
    expect(snapshot.aiOverview.citations).toHaveLength(2);
    expect(snapshot.results.map((result) => result.position)).toStrictEqual([
      1, 2,
    ]);
    expect(organicPositionFor(snapshot, "ourcafe.com.au")).toBe(2);
  });

  it("checks whether the AI Overview cited this website", () => {
    const snapshot = organicSnapshotFromResult({ items: organicItems });
    expect(aiMentionFor(snapshot, "ourcafe.com.au")).toStrictEqual({
      citedUrl: "https://www.ourcafe.com.au/menu",
      status: "cited",
    });
    expect(aiMentionFor(snapshot, "other.com.au").status).toBe("not_cited");
    expect(
      aiMentionFor(organicSnapshotFromResult({ items: [] }), "ourcafe.com.au")
        .status
    ).toBe("none");
  });

  it("ranks this business in a shared Maps cell", () => {
    const places = mapsPlacesFromResult({
      items: [
        { place_id: "a", rank_group: 1, title: "A", type: "maps_search" },
        { rank_group: 1, title: "Ad", type: "maps_paid_item" },
        { cid: "99", rank_group: 2, title: "Us", type: "maps_search" },
        { place_id: "c", rank_group: 3, title: "C", type: "maps_search" },
        { place_id: "d", rank_group: 4, title: "D", type: "maps_search" },
      ],
    });
    const cell = rankGridCell({
      index: 0,
      places,
      point: { latitude: -37.8, longitude: 144.96 },
      self: { cid: "99", placeId: null },
    });
    expect(places.places).toHaveLength(4);
    expect(cell.rank).toBe(2);
    expect(cell.top.map((place) => place.title)).toStrictEqual([
      "A",
      "Us",
      "C",
    ]);
  });

  it("aggregates a review sample without text", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const sample = reviewSampleFromResult(
      {
        items: [
          {
            owner_answer: "Thanks!",
            rating: { value: 5 },
            timestamp: "2026-09-20 10:00:00 +00:00",
          },
          { rating: { value: 3 }, timestamp: "2026-01-02 10:00:00 +00:00" },
        ],
      },
      { isSelf: true, now, placeId: "place_self" }
    );
    expect(sample).toStrictEqual({
      averageSampleRating: 4,
      checkedAt: now.toISOString(),
      isSelf: true,
      latestReviewAt: "2026-09-20T10:00:00.000Z",
      ownerReplyRate: 0.5,
      placeId: "place_self",
      reviewsLast90Days: 1,
      sampleSize: 2,
    });
  });

  it("maps the backlink intersection to referring domains per competitor", () => {
    const gap = linkGapFromResult(
      {
        items: [
          {
            domain_intersection: {
              "1": { rank: 40, target: "www.broadsheet.com.au" },
              "2": { rank: 45, target: "www.broadsheet.com.au" },
            },
          },
        ],
      },
      {
        competitorDomains: ["cafea.com.au", "cafeb.com.au"],
        domain: "ourcafe.com.au",
        now: new Date("2026-10-01T00:00:00.000Z"),
      }
    );
    expect(gap.domains).toStrictEqual([
      {
        domain: "broadsheet.com.au",
        linksTo: ["cafea.com.au", "cafeb.com.au"],
        rank: 45,
      },
    ]);
  });

  it("normalises domains and timestamps", () => {
    expect(bareDomain("https://www.OurCafe.com.au/menu")).toBe(
      "ourcafe.com.au"
    );
    expect(bareDomain("ourcafe.com.au")).toBe("ourcafe.com.au");
    expect(parseDataForSeoTimestamp("2019-11-15 12:57:46 +00:00")).toBe(
      "2019-11-15T12:57:46.000Z"
    );
    expect(parseDataForSeoTimestamp("garbage")).toBeNull();
  });
});
