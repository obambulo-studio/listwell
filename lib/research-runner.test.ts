import { describe, expect, it } from "vitest";

import { businessFromCreateRequest } from "./data";
import { createDataForSeoClient } from "./dataforseo";
import type { DataForSeoClient, TaskStore } from "./dataforseo";
import type { ObservationStore } from "./research-observations";
import { runBusinessResearch } from "./research-runner";
import type { Business } from "./schema";
import { saveSearchPhraseDraft } from "./search-phrases";
import type { ResearchStore } from "./seo-budget";
import { seoObservationRowSchema } from "./seo-schema";
import type { SeoObservationRow } from "./seo-schema";

const entitlement = {
  kind: "report_monthly",
  nextScanAt: "2026-10-31T00:00:00.000Z",
  status: "active",
};

const phrases = saveSearchPhraseDraft(
  [],
  [
    { suggested: true, text: "cafe Newtown" },
    { suggested: true, text: "cafe near me" },
  ]
);

const businessWith = (
  input: Parameters<typeof businessFromCreateRequest>[0],
  extra?: Partial<Business>
): Business => ({
  ...businessFromCreateRequest(input),
  searchPhrases: phrases,
  ...extra,
});

const monthlyBusiness = businessWith({
  category: "food",
  categoryLabel: "Cafe",
  id: "biz-research",
  locations: [
    {
      address: "1 King Street, Newtown NSW 2042",
      googlePlaceId: "ChIJself",
      latitude: -33.898,
      longitude: 151.18,
      name: "Cafe",
    },
  ],
  name: "King Street Cafe",
  websiteUrl: "https://cafe.example",
});

const openStore = (): ResearchStore => ({
  claimCache: (fingerprint) =>
    Promise.resolve({
      action: "run",
      entry: {
        cacheId: `cache-${fingerprint}`,
        costUsdMicros: 0,
        finishedAt: null,
        payloadJson: null,
        startedAt: "2026-10-01T00:00:00.000Z",
        status: "running",
      },
    }),
  finishCache: () => Promise.resolve(),
  getCache: () => Promise.resolve(null),
  latestCompleteCache: () => Promise.resolve(null),
  publishCache: () => Promise.resolve(),
  reserveSpend: (input) =>
    Promise.resolve({ ok: true, reservedUsdMicros: input.estimateUsdMicros }),
  settleSpend: () => Promise.resolve(),
});

const observationMemory = () => {
  const rows: SeoObservationRow[] = [];
  const store: ObservationStore = {
    listForPeriod: (businessExternalId, periodStart) =>
      Promise.resolve(
        rows.filter(
          (row) =>
            row.businessExternalId === businessExternalId &&
            row.periodStart === periodStart
        )
      ),
    record: (input) => {
      const row = seoObservationRowSchema.parse({
        businessExternalId: input.businessExternalId,
        costUsdMicros: input.costUsdMicros,
        id: `obs_${rows.length + 1}`,
        kind: input.kind,
        observedAt: "2026-10-01T00:00:00.000Z",
        payloadJson: input.payloadJson ?? null,
        periodStart: input.periodStart,
        phraseId: input.phraseId ?? null,
        pinId: input.pinId ?? null,
        skipReason: input.skipReason ?? null,
        status: input.status,
      });
      rows.push(row);
      return Promise.resolve(row.id);
    },
    update: (input) => {
      const row = rows.find((item) => item.id === input.observationId);
      if (row) {
        row.status = input.status;
        if (input.costUsdMicros !== undefined) {
          row.costUsdMicros = input.costUsdMicros;
        }
        if (input.payloadJson !== undefined) {
          row.payloadJson = input.payloadJson;
        }
        if (input.skipReason !== undefined) {
          row.skipReason = input.skipReason;
        }
      }
      return Promise.resolve();
    },
  };
  return { rows, store };
};

const taskMemory = (): TaskStore => {
  const values = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(values.get(key) ?? null),
    put: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
};

const vendorClient = () => {
  const urls: string[] = [];
  const fetchImpl: DataForSeoClient["fetch"] = (url) => {
    urls.push(String(url));
    return Promise.reject(new Error("vendor down"));
  };
  const client = createDataForSeoClient({
    apiKey: btoa("login:password"),
    fetch: fetchImpl,
    sandbox: true,
    siteUrl: "https://listwell.test",
  });
  return { client, urls };
};

const run = (
  business: Business,
  trigger: "baseline" | "schedule" | "rescan",
  client: DataForSeoClient,
  observations: ObservationStore,
  entitlementOverride: {
    kind: string;
    nextScanAt: string | null;
    status: string;
  } | null = entitlement
) =>
  runBusinessResearch(
    {
      business,
      checkResults: {},
      listingScore: 80,
      trigger,
    },
    {
      ceilingUsd: 20,
      client,
      entitlement: entitlementOverride,
      now: new Date("2026-10-01T00:00:00.000Z"),
      observations,
      prepare: (current) => Promise.resolve(current),
      store: openStore(),
      taskStore: taskMemory(),
    }
  );

describe(runBusinessResearch, () => {
  it("does not call DataForSEO for a one-off report", async () => {
    const { client, urls } = vendorClient();
    const { store } = observationMemory();
    await run(monthlyBusiness, "baseline", client, store, {
      kind: "report_once",
      nextScanAt: null,
      status: "active",
    });
    expect(urls).toStrictEqual([]);
  });

  it("spends nothing on a rescan or a second run in the same period", async () => {
    const { client, urls } = vendorClient();
    const { store } = observationMemory();
    await run(monthlyBusiness, "rescan", client, store);
    expect(urls).toStrictEqual([]);

    await run(monthlyBusiness, "baseline", client, store);
    const called = urls.length;
    expect(called).toBeGreaterThan(0);
    await run(monthlyBusiness, "baseline", client, store);
    expect(urls).toHaveLength(called);
  });

  it("skips the rank grid when the business has no pin", async () => {
    const { client, urls } = vendorClient();
    const { rows, store } = observationMemory();
    const business = businessWith({
      category: "food",
      categoryLabel: "Cafe",
      id: "biz-no-pin",
      locations: [
        {
          address: "1 King Street, Newtown NSW 2042",
          googlePlaceId: "ChIJself",
          name: "Cafe",
        },
      ],
      name: "King Street Cafe",
      websiteUrl: "https://cafe.example",
    });
    await run(business, "baseline", client, store);
    expect(urls.some((url) => url.includes("/maps/"))).toBeFalsy();
    expect(
      rows.some(
        (row) => row.kind === "rank_grid" && row.skipReason === "no_pin"
      )
    ).toBeTruthy();
  });

  it("skips the link gap when there is no website", async () => {
    const { client, urls } = vendorClient();
    const { rows, store } = observationMemory();
    const business = businessWith({
      category: "food",
      categoryLabel: "Cafe",
      id: "biz-no-site",
      locations: [
        {
          address: "1 King Street, Newtown NSW 2042",
          googlePlaceId: "ChIJself",
          latitude: -33.898,
          longitude: 151.18,
          name: "Cafe",
        },
      ],
      name: "King Street Cafe",
    });
    await run(business, "baseline", client, store);
    expect(urls.some((url) => url.includes("domain_intersection"))).toBeFalsy();
    expect(
      rows.some(
        (row) => row.kind === "link_gap" && row.skipReason === "no_website"
      )
    ).toBeTruthy();
  });

  it("records a vendor failure without throwing", async () => {
    const { client } = vendorClient();
    const { rows, store } = observationMemory();
    await expect(
      run(monthlyBusiness, "baseline", client, store)
    ).resolves.toBeUndefined();
    expect(rows.some((row) => row.status === "error")).toBeTruthy();
  });
});
