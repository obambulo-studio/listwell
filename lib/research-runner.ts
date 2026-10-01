/* eslint-disable no-await-in-loop -- each paid call waits so a ceiling can stop the rest */
import { z } from "zod";

import { getDataForSeoEnv } from "./audit-env";
import {
  getBusiness,
  getLatestCompleteScanDetails,
  getResearchEntitlement,
} from "./data";
import {
  aiMentionFor,
  backlinksFromResults,
  bareDomain,
  cacheJsonFromResult,
  callLive,
  dataForSeoClientFromEnv,
  defaultTaskStore,
  domainIntersectionResultSchema,
  domainOverviewFromResult,
  domainRankOverviewResultSchema,
  estimateCostUsdMicros,
  keywordRowsFromResult,
  keywordRowsSchema,
  linkGapFromResult,
  mapsPlacesFromResult,
  mapsPlacesSchema,
  organicPositionFor,
  organicResultSchema,
  organicSnapshotFromResult,
  organicSnapshotSchema,
  postQueuedTask,
  postsQaFromResults,
  postsResultSchema,
  questionsResultSchema,
  rankGridCell,
  reviewSampleFromResult,
  reviewsResultSchema,
  supportsMode,
} from "./dataforseo";
import type {
  DataForSeoClient,
  DataForSeoEndpoint,
  DataForSeoInput,
  DataForSeoMode,
  DataForSeoResult,
  MapsPlace,
  QueuedTaskMeta,
  QueuedTaskRecord,
  TaskStore,
} from "./dataforseo";
import { persistMissingBusinessPin } from "./persist-place-pin";
import { businessPin, businessPlaceId } from "./place-pin";
import type { PlacePin } from "./place-pin";
import {
  convexObservationStore,
  observationPayloadJson,
} from "./research-observations";
import type { ObservationStore } from "./research-observations";
import { SCAN_INTERVAL_MS } from "./scan-config";
import type { Business, ScanTrigger } from "./schema";
import {
  convexResearchStore,
  keywordMetricsFingerprint,
  organicSerpFingerprint,
  rankGridCellFingerprint,
  researchBudget,
  runQueuedResearchCall,
  runResearchCall,
} from "./seo-budget";
import type {
  QueuedResearchOutcome,
  ResearchBudget,
  ResearchCache,
  ResearchCallOutcome,
  ResearchStore,
} from "./seo-budget";
import {
  aiMentionPayloadSchema,
  backlinksPayloadSchema,
  coordinatesSchema,
  competitorSnapshotPayloadSchema,
  domainOverviewPayloadSchema,
  entitlementAllowsResearch,
  GRID_SPACING_METRES,
  gridPoints,
  gridTop3Count,
  keywordMetricsPayloadSchema,
  LINK_GAP_COMPETITORS,
  LINK_PROSPECTS_KEPT,
  linkGapPayloadSchema,
  normalisePhrase,
  organicSerpPayloadSchema,
  rankGridPayloadSchema,
  readObservationPayload,
  reviewSamplePayloadSchema,
  SEO_LOCATION_CODE_AU,
} from "./seo-schema";
import type {
  BacklinksPayload,
  LinkGapPayload,
  PeriodSummaryPayload,
  RankGridPayload,
  ReviewSamplePayload,
  SearchPhrase,
  SeoObservationKind,
  SeoObservationPayloadInput,
  SeoObservationRow,
  SeoSkipReason,
} from "./seo-schema";

const RANK_GRID_PHRASES = 2;
const WORK_TTL_SECONDS = 7 * 24 * 60 * 60;
const GOOGLE_BASICS: readonly string[] = [
  "google-listing",
  "google-listing-primary-category",
  "google-listing-opening-times",
  "google-listing-photos",
  "google-listing-rating",
  "google-listing-review-count",
];

const readJson = (value: string): unknown => JSON.parse(value);

const workSchema = z.object({
  center: coordinatesSchema.nullable(),
  domain: z.string().nullable(),
  isSelf: z.boolean().nullable(),
  month: z.string(),
  phrase: z.string().nullable(),
  placeId: z.string().nullable(),
  postsJson: z.string().nullable(),
  questionsJson: z.string().nullable(),
  selfPlaceId: z.string().nullable(),
});
type ResearchWork = z.infer<typeof workSchema>;

const placeNoteSchema = z.object({
  domain: z.string().nullable(),
  name: z.string(),
  placeId: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
});
type PlaceNote = z.infer<typeof placeNoteSchema>;

const entitlementInputSchema = z.object({
  kind: z.string(),
  nextScanAt: z.string().nullable(),
  status: z.string(),
});

export const researchWorkKey = (observationId: string): string =>
  `seo:work:${observationId}`;

const competitorsKey = (
  businessExternalId: string,
  periodStart: string
): string => `seo:competitors:${businessExternalId}:${periodStart}`;

const blankWork = (month: string): ResearchWork => ({
  center: null,
  domain: null,
  isSelf: null,
  month,
  phrase: null,
  placeId: null,
  postsJson: null,
  questionsJson: null,
  selfPlaceId: null,
});

const readWork = async (
  store: TaskStore,
  observationId: string
): Promise<ResearchWork | null> => {
  const raw = await store.get(researchWorkKey(observationId));
  if (!raw) {
    return null;
  }
  return workSchema.parse(readJson(raw));
};

const writeWork = async (
  store: TaskStore,
  observationId: string,
  work: ResearchWork
): Promise<void> => {
  await store.put(
    researchWorkKey(observationId),
    JSON.stringify(workSchema.parse(work)),
    WORK_TTL_SECONDS
  );
};

const readNotes = async (
  store: TaskStore,
  businessExternalId: string,
  periodStart: string
): Promise<PlaceNote[]> => {
  const raw = await store.get(competitorsKey(businessExternalId, periodStart));
  if (!raw) {
    return [];
  }
  return z.array(placeNoteSchema).parse(readJson(raw));
};

type StepResult<Value> =
  | { costUsdMicros: number; status: "complete"; value: Value }
  | { costUsdMicros: number; status: "queued" }
  | { reason: "allowance" | "ceiling"; status: "skipped" }
  | { costUsdMicros: number; error: Error; status: "error" };

interface ResearchContext {
  budget: ResearchBudget;
  business: Business;
  checkResults: Record<string, { value: boolean | null }>;
  client: DataForSeoClient | null;
  gridPending: boolean;
  listingScore: number | null;
  mode: "live" | "queued";
  now: Date;
  observations: ObservationStore;
  phrases: SearchPhrase[];
  pin: PlacePin | null;
  placeId: string | null;
  stop: "allowance" | "ceiling" | null;
  store: ResearchStore;
  taskStore: TaskStore;
  websiteDomain: string | null;
}

const endpointMode = (
  preferred: "live" | "queued",
  endpoint: DataForSeoEndpoint
): DataForSeoMode => {
  if (preferred === "queued" && supportsMode(endpoint, "queued")) {
    return "queued";
  }
  if (supportsMode(endpoint, "live")) {
    return "live";
  }
  return "queued";
};

const basicsPass = (
  results: Record<string, { value: boolean | null }>
): boolean => GOOGLE_BASICS.every((id) => results[id]?.value === true);

const recordRow = (
  ctx: ResearchContext,
  input: {
    costUsdMicros: number;
    kind: SeoObservationKind;
    payload?: Parameters<typeof observationPayloadJson>[0];
    phraseId?: string;
    pinId?: string;
    skipReason?: SeoSkipReason;
    status: "complete" | "skipped" | "error" | "queued";
  }
): Promise<string> =>
  ctx.observations.record({
    businessExternalId: ctx.budget.businessExternalId,
    costUsdMicros: input.costUsdMicros,
    kind: input.kind,
    periodStart: ctx.budget.periodStart,
    phraseId: input.phraseId,
    pinId: input.pinId,
    skipReason: input.skipReason,
    status: input.status,
    ...(input.payload
      ? { payloadJson: observationPayloadJson(input.payload) }
      : {}),
  });

const skip = async (
  ctx: ResearchContext,
  kind: SeoObservationKind,
  reason: SeoSkipReason,
  ids?: { phraseId?: string; pinId?: string }
): Promise<void> => {
  await recordRow(ctx, {
    costUsdMicros: 0,
    kind,
    phraseId: ids?.phraseId,
    pinId: ids?.pinId,
    skipReason: reason,
    status: "skipped",
  });
};

const blockReason = (ctx: ResearchContext): SeoSkipReason | null => {
  if (ctx.stop) {
    return ctx.stop;
  }
  if (!ctx.client) {
    return "no_api_key";
  }
  return null;
};

const rememberPlaces = async (
  ctx: ResearchContext,
  places: readonly MapsPlace[]
): Promise<void> => {
  const notes = await readNotes(
    ctx.taskStore,
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  const byId = new Map<string, PlaceNote>();
  for (const note of notes) {
    if (note.placeId) {
      byId.set(note.placeId, note);
    }
  }
  for (const place of places) {
    if (!place.placeId) {
      continue;
    }
    const current = byId.get(place.placeId);
    byId.set(place.placeId, {
      domain: place.domain ?? current?.domain ?? null,
      name: place.title || current?.name || place.placeId,
      placeId: place.placeId,
      rating: place.rating ?? current?.rating ?? null,
      reviewCount: place.reviewCount ?? current?.reviewCount ?? null,
    });
  }
  await ctx.taskStore.put(
    competitorsKey(ctx.budget.businessExternalId, ctx.budget.periodStart),
    JSON.stringify(z.array(placeNoteSchema).parse([...byId.values()])),
    WORK_TTL_SECONDS
  );
};

const applySpendHalt = <Value>(
  ctx: ResearchContext,
  outcome: StepResult<Value>
): void => {
  if (outcome.status === "skipped") {
    ctx.stop = outcome.reason;
  }
};

/** A missing entitlement is the same stop as a used-up allowance. */
const stepFromSpend = <Value>(
  outcome: ResearchCallOutcome<Value> | QueuedResearchOutcome<Value>
): StepResult<Value> => {
  if (outcome.status === "complete") {
    return {
      costUsdMicros: outcome.costUsdMicros,
      status: "complete",
      value: outcome.value,
    };
  }
  if (outcome.status === "queued") {
    return { costUsdMicros: outcome.costUsdMicros, status: "queued" };
  }
  if (outcome.status === "error") {
    return {
      costUsdMicros: outcome.costUsdMicros,
      error: outcome.error,
      status: "error",
    };
  }
  return {
    reason: outcome.reason === "ceiling" ? "ceiling" : "allowance",
    status: "skipped",
  };
};

const runLive = async <Endpoint extends DataForSeoEndpoint, Value>(
  ctx: ResearchContext,
  endpoint: Endpoint,
  input: DataForSeoInput<Endpoint>,
  map: (result: DataForSeoResult<Endpoint> | null) => Value,
  cache?: ResearchCache<Value>
): Promise<StepResult<Value>> => {
  const { client } = ctx;
  if (!client || ctx.stop) {
    return { reason: ctx.stop ?? "allowance", status: "skipped" };
  }
  const outcome = await runResearchCall(
    {
      budget: ctx.budget,
      cache,
      call: async () => {
        const live = await callLive(client, endpoint, input);
        return {
          costUsdMicros: live.costUsdMicros,
          value: map(live.result),
        };
      },
      estimateUsdMicros: estimateCostUsdMicros(client, endpoint, "live"),
    },
    { store: ctx.store }
  );
  return stepFromSpend(outcome);
};

const readCached = async <Value>(
  ctx: ResearchContext,
  cache: ResearchCache<Value>
): Promise<Value | null> => {
  const hit = await ctx.store.latestCompleteCache(cache.fingerprint);
  if (!hit?.payloadJson) {
    return null;
  }
  return cache.parse(hit.payloadJson);
};

const runQueued = async <Endpoint extends DataForSeoEndpoint>(
  ctx: ResearchContext,
  endpoint: Endpoint,
  input: DataForSeoInput<Endpoint>,
  meta: Omit<QueuedTaskMeta, "endpoint">
): Promise<StepResult<never>> => {
  const { client } = ctx;
  if (!client || ctx.stop) {
    return { reason: ctx.stop ?? "allowance", status: "skipped" };
  }
  const outcome = await runQueuedResearchCall<never>(
    {
      budget: ctx.budget,
      estimateUsdMicros: estimateCostUsdMicros(client, endpoint, "queued"),
      post: () => postQueuedTask(client, endpoint, input, meta, ctx.taskStore),
    },
    { store: ctx.store }
  );
  return stepFromSpend(outcome);
};

const mapsCache = (
  ctx: ResearchContext,
  phrase: string,
  cellIndex: number,
  center: PlacePin | { latitude: number; longitude: number }
): ResearchCache<z.infer<typeof mapsPlacesSchema>> => ({
  fingerprint: rankGridCellFingerprint({
    cellIndex,
    center,
    month: ctx.budget.month,
    phrase,
  }),
  parse: (payloadJson) => mapsPlacesSchema.parse(readJson(payloadJson)),
  serialize: (value) => JSON.stringify(mapsPlacesSchema.parse(value)),
});

const organicCache = (
  ctx: ResearchContext,
  phrase: string
): ResearchCache<z.infer<typeof organicSnapshotSchema>> => ({
  fingerprint: organicSerpFingerprint({
    locationCode: SEO_LOCATION_CODE_AU,
    month: ctx.budget.month,
    phrase,
  }),
  parse: (payloadJson) => organicSnapshotSchema.parse(readJson(payloadJson)),
  serialize: (value) => JSON.stringify(organicSnapshotSchema.parse(value)),
});

const keywordCache = (
  ctx: ResearchContext,
  phrases: readonly string[]
): ResearchCache<z.infer<typeof keywordRowsSchema>> => ({
  fingerprint: keywordMetricsFingerprint({
    locationCode: SEO_LOCATION_CODE_AU,
    month: ctx.budget.month,
    phrases,
  }),
  parse: (payloadJson) => keywordRowsSchema.parse(readJson(payloadJson)),
  serialize: (value) => JSON.stringify(keywordRowsSchema.parse(value)),
});

const storeOrganic = async (
  ctx: ResearchContext,
  phrase: SearchPhrase,
  snapshot: z.infer<typeof organicSnapshotSchema>,
  costUsdMicros: number
): Promise<void> => {
  const position = organicPositionFor(snapshot, ctx.websiteDomain);
  const mention = aiMentionFor(snapshot, ctx.websiteDomain);
  await recordRow(ctx, {
    costUsdMicros,
    kind: "organic_serp",
    payload: {
      kind: "organic_serp",
      payload: {
        aiOverview: snapshot.aiOverview,
        checkedAt: ctx.now.toISOString(),
        locationCode: SEO_LOCATION_CODE_AU,
        phrase: phrase.text,
        phraseId: phrase.id,
        position,
        results: snapshot.results,
      },
    },
    phraseId: phrase.id,
    status: "complete",
  });
  await recordRow(ctx, {
    costUsdMicros: 0,
    kind: "ai_mention",
    payload: {
      kind: "ai_mention",
      payload: {
        citedUrl: mention.citedUrl,
        phrase: phrase.text,
        phraseId: phrase.id,
        status: mention.status,
      },
    },
    phraseId: phrase.id,
    status: "complete",
  });
};

const runOneGrid = async (
  ctx: ResearchContext,
  phrase: SearchPhrase
): Promise<void> => {
  const blocked = blockReason(ctx);
  const { pin } = ctx;
  if (blocked || !pin) {
    await skip(ctx, "rank_grid", blocked ?? "no_pin", {
      phraseId: phrase.id,
      pinId: pin?.pinId,
    });
    return;
  }
  const points = gridPoints(pin);
  const mode = endpointMode(ctx.mode, "maps");
  if (mode === "live") {
    const cells: RankGridPayload["cells"] = [];
    let costUsdMicros = 0;
    for (const [index, point] of points.entries()) {
      const outcome = await runLive(
        ctx,
        "maps",
        { keyword: phrase.text, point },
        mapsPlacesFromResult,
        mapsCache(ctx, phrase.text, index, pin)
      );
      applySpendHalt(ctx, outcome);
      if (outcome.status === "skipped") {
        await skip(ctx, "rank_grid", outcome.reason, {
          phraseId: phrase.id,
          pinId: pin.pinId,
        });
        return;
      }
      if (outcome.status !== "complete") {
        await recordRow(ctx, {
          costUsdMicros: outcome.costUsdMicros,
          kind: "rank_grid",
          phraseId: phrase.id,
          pinId: pin.pinId,
          status: "error",
        });
        return;
      }
      costUsdMicros += outcome.costUsdMicros;
      await rememberPlaces(ctx, outcome.value.places);
      cells.push(
        rankGridCell({
          index,
          places: outcome.value,
          point,
          self: { cid: null, placeId: ctx.placeId },
        })
      );
    }
    await recordRow(ctx, {
      costUsdMicros,
      kind: "rank_grid",
      payload: {
        kind: "rank_grid",
        payload: {
          cells,
          center: pin,
          checkedAt: ctx.now.toISOString(),
          phrase: phrase.text,
          phraseId: phrase.id,
          pinId: pin.pinId,
          spacingMetres: GRID_SPACING_METRES,
        },
      },
      phraseId: phrase.id,
      pinId: pin.pinId,
      status: "complete",
    });
    return;
  }

  const observationId = await recordRow(ctx, {
    costUsdMicros: 0,
    kind: "rank_grid",
    phraseId: phrase.id,
    pinId: pin.pinId,
    status: "queued",
  });
  await writeWork(ctx.taskStore, observationId, {
    ...blankWork(ctx.budget.month),
    center: pin,
    phrase: phrase.text,
    selfPlaceId: ctx.placeId,
  });
  let costUsdMicros = 0;
  let pending = 0;
  const ready: RankGridPayload["cells"] = [];
  for (const [index, point] of points.entries()) {
    const cache = mapsCache(ctx, phrase.text, index, pin);
    const cached = await readCached(ctx, cache);
    if (cached) {
      await rememberPlaces(ctx, cached.places);
      ready.push(
        rankGridCell({
          index,
          places: cached,
          point,
          self: { cid: null, placeId: ctx.placeId },
        })
      );
      continue;
    }
    const outcome = await runQueued(
      ctx,
      "maps",
      { keyword: phrase.text, point },
      {
        businessExternalId: ctx.budget.businessExternalId,
        cacheFingerprint: cache.fingerprint,
        cellIndex: index,
        kind: "rank_grid",
        observationId,
        periodStart: ctx.budget.periodStart,
        phraseId: phrase.id,
        pinId: pin.pinId,
      }
    );
    applySpendHalt(ctx, outcome);
    if (outcome.status === "queued") {
      costUsdMicros += outcome.costUsdMicros;
      pending += 1;
      continue;
    }
    await ctx.observations.update({
      costUsdMicros,
      observationId,
      status: outcome.status === "skipped" ? "skipped" : "error",
      ...(outcome.status === "skipped" ? { skipReason: outcome.reason } : {}),
    });
    return;
  }
  if (pending > 0) {
    ctx.gridPending = true;
    await ctx.observations.update({
      costUsdMicros,
      observationId,
      status: "queued",
    });
    return;
  }
  await ctx.observations.update({
    costUsdMicros,
    observationId,
    payloadJson: observationPayloadJson({
      kind: "rank_grid",
      payload: {
        cells: ready,
        center: pin,
        checkedAt: ctx.now.toISOString(),
        phrase: phrase.text,
        phraseId: phrase.id,
        pinId: pin.pinId,
        spacingMetres: GRID_SPACING_METRES,
      },
    }),
    status: "complete",
  });
};

const runRankGrids = async (ctx: ResearchContext): Promise<void> => {
  if (ctx.phrases.length === 0) {
    await skip(ctx, "rank_grid", "no_phrases");
    return;
  }
  if (!ctx.pin) {
    await skip(ctx, "rank_grid", "no_pin");
    return;
  }
  for (const phrase of ctx.phrases.slice(0, RANK_GRID_PHRASES)) {
    if (ctx.stop) {
      await skip(ctx, "rank_grid", ctx.stop, {
        phraseId: phrase.id,
        pinId: ctx.pin.pinId,
      });
      continue;
    }
    await runOneGrid(ctx, phrase);
  }
};

const runOrganic = async (ctx: ResearchContext): Promise<void> => {
  if (ctx.phrases.length === 0) {
    await skip(ctx, "organic_serp", "no_phrases");
    return;
  }
  for (const phrase of ctx.phrases) {
    const blocked = blockReason(ctx);
    if (blocked) {
      await skip(ctx, "organic_serp", blocked, { phraseId: phrase.id });
      continue;
    }
    const cache = organicCache(ctx, phrase.text);
    const mode = endpointMode(ctx.mode, "organic");
    if (mode === "queued") {
      const cached = await readCached(ctx, cache);
      if (cached) {
        await storeOrganic(ctx, phrase, cached, 0);
        continue;
      }
      const observationId = await recordRow(ctx, {
        costUsdMicros: 0,
        kind: "organic_serp",
        phraseId: phrase.id,
        status: "queued",
      });
      await writeWork(ctx.taskStore, observationId, {
        ...blankWork(ctx.budget.month),
        domain: ctx.websiteDomain,
        phrase: phrase.text,
      });
      const outcome = await runQueued(
        ctx,
        "organic",
        { keyword: phrase.text, locationCode: SEO_LOCATION_CODE_AU },
        {
          businessExternalId: ctx.budget.businessExternalId,
          cacheFingerprint: cache.fingerprint,
          cellIndex: null,
          kind: "organic_serp",
          observationId,
          periodStart: ctx.budget.periodStart,
          phraseId: phrase.id,
          pinId: null,
        }
      );
      applySpendHalt(ctx, outcome);
      if (outcome.status === "queued") {
        await ctx.observations.update({
          costUsdMicros: outcome.costUsdMicros,
          observationId,
          status: "queued",
        });
        continue;
      }
      await ctx.observations.update({
        costUsdMicros: outcome.status === "error" ? outcome.costUsdMicros : 0,
        observationId,
        status: outcome.status === "skipped" ? "skipped" : "error",
        ...(outcome.status === "skipped" ? { skipReason: outcome.reason } : {}),
      });
      continue;
    }
    const outcome = await runLive(
      ctx,
      "organic",
      { keyword: phrase.text, locationCode: SEO_LOCATION_CODE_AU },
      organicSnapshotFromResult,
      cache
    );
    applySpendHalt(ctx, outcome);
    if (outcome.status === "complete") {
      await storeOrganic(ctx, phrase, outcome.value, outcome.costUsdMicros);
      continue;
    }
    if (outcome.status === "skipped") {
      await skip(ctx, "organic_serp", outcome.reason, { phraseId: phrase.id });
      continue;
    }
    await recordRow(ctx, {
      costUsdMicros: outcome.costUsdMicros,
      kind: "organic_serp",
      phraseId: phrase.id,
      status: "error",
    });
  }
};

const runKeywords = async (ctx: ResearchContext): Promise<void> => {
  if (ctx.phrases.length === 0) {
    await skip(ctx, "keyword_metrics", "no_phrases");
    return;
  }
  const blocked = blockReason(ctx);
  if (blocked) {
    await skip(ctx, "keyword_metrics", blocked);
    return;
  }
  const texts = ctx.phrases.map((phrase) => phrase.text);
  const outcome = await runLive(
    ctx,
    "keywordOverview",
    { keywords: texts },
    keywordRowsFromResult,
    keywordCache(ctx, texts)
  );
  applySpendHalt(ctx, outcome);
  if (outcome.status === "skipped") {
    await skip(ctx, "keyword_metrics", outcome.reason);
    return;
  }
  if (outcome.status !== "complete") {
    await recordRow(ctx, {
      costUsdMicros: outcome.costUsdMicros,
      kind: "keyword_metrics",
      status: "error",
    });
    return;
  }
  const byText = new Map(
    ctx.phrases.map((phrase) => [normalisePhrase(phrase.text), phrase])
  );
  await recordRow(ctx, {
    costUsdMicros: outcome.costUsdMicros,
    kind: "keyword_metrics",
    payload: {
      kind: "keyword_metrics",
      payload: {
        checkedAt: ctx.now.toISOString(),
        keywords: outcome.value.keywords.flatMap((row) => {
          const phrase = byText.get(normalisePhrase(row.keyword));
          if (!phrase) {
            return [];
          }
          return [
            {
              cpc: row.cpc,
              intent: row.intent,
              keyword: phrase.text,
              keywordDifficulty: row.keywordDifficulty,
              phraseId: phrase.id,
              searchVolume: row.searchVolume,
            },
          ];
        }),
        locationCode: SEO_LOCATION_CODE_AU,
        scope: "national",
      },
    },
    status: "complete",
  });
};

const reviewTargets = (
  ctx: ResearchContext,
  leaderPlaceId: string | null
): { isSelf: boolean; placeId: string }[] => {
  const targets: { isSelf: boolean; placeId: string }[] = [];
  if (ctx.placeId) {
    targets.push({ isSelf: true, placeId: ctx.placeId });
  }
  const pinned = ctx.business.competitors
    .slice(0, LINK_GAP_COMPETITORS)
    .map((competitor) => competitor.placeId);
  const leader = leaderPlaceId ? [leaderPlaceId] : [];
  const others = pinned.length > 0 ? pinned : leader;
  for (const placeId of others) {
    if (placeId !== ctx.placeId) {
      targets.push({ isSelf: false, placeId });
    }
  }
  return targets.slice(0, LINK_GAP_COMPETITORS + 1);
};

const queueReview = async (
  ctx: ResearchContext,
  target: { isSelf: boolean; placeId: string }
): Promise<boolean> => {
  const observationId = await recordRow(ctx, {
    costUsdMicros: 0,
    kind: "review_sample",
    status: "queued",
  });
  await writeWork(ctx.taskStore, observationId, {
    ...blankWork(ctx.budget.month),
    isSelf: target.isSelf,
    placeId: target.placeId,
  });
  const outcome = await runQueued(
    ctx,
    "reviews",
    { cid: null, placeId: target.placeId },
    {
      businessExternalId: ctx.budget.businessExternalId,
      cacheFingerprint: null,
      cellIndex: null,
      kind: "review_sample",
      observationId,
      periodStart: ctx.budget.periodStart,
      phraseId: null,
      pinId: null,
    }
  );
  applySpendHalt(ctx, outcome);
  if (outcome.status === "queued") {
    await ctx.observations.update({
      costUsdMicros: outcome.costUsdMicros,
      observationId,
      status: "queued",
    });
    return true;
  }
  await ctx.observations.update({
    costUsdMicros: outcome.status === "error" ? outcome.costUsdMicros : 0,
    observationId,
    status: outcome.status === "skipped" ? "skipped" : "error",
    ...(outcome.status === "skipped" ? { skipReason: outcome.reason } : {}),
  });
  return false;
};

const runReviews = async (
  ctx: ResearchContext,
  leaderPlaceId: string | null
): Promise<void> => {
  const targets = reviewTargets(ctx, leaderPlaceId);
  if (targets.length === 0) {
    return;
  }
  for (const target of targets) {
    const blocked = blockReason(ctx);
    if (blocked) {
      await skip(ctx, "review_sample", blocked);
      continue;
    }
    await queueReview(ctx, target);
  }
};

const runPosts = async (ctx: ResearchContext): Promise<void> => {
  if (!basicsPass(ctx.checkResults)) {
    await skip(ctx, "gbp_posts_qa", "basics_failed");
    return;
  }
  if (!ctx.placeId) {
    return;
  }
  const blocked = blockReason(ctx);
  if (blocked) {
    await skip(ctx, "gbp_posts_qa", blocked);
    return;
  }
  const observationId = await recordRow(ctx, {
    costUsdMicros: 0,
    kind: "gbp_posts_qa",
    status: "queued",
  });
  let work = {
    ...blankWork(ctx.budget.month),
    placeId: ctx.placeId,
  };
  await writeWork(ctx.taskStore, observationId, work);
  const target = { cid: null, placeId: ctx.placeId };
  if (endpointMode(ctx.mode, "questions") === "live") {
    const questions = await runLive(
      ctx,
      "questions",
      target,
      (result) => result
    );
    applySpendHalt(ctx, questions);
    if (questions.status !== "complete") {
      await ctx.observations.update({
        costUsdMicros:
          questions.status === "error" ? questions.costUsdMicros : 0,
        observationId,
        status: questions.status === "skipped" ? "skipped" : "error",
        ...(questions.status === "skipped"
          ? { skipReason: questions.reason }
          : {}),
      });
      return;
    }
    work = { ...work, questionsJson: JSON.stringify(questions.value) };
    await writeWork(ctx.taskStore, observationId, work);
  } else {
    const questions = await runQueued(ctx, "questions", target, {
      businessExternalId: ctx.budget.businessExternalId,
      cacheFingerprint: null,
      cellIndex: null,
      kind: "gbp_posts_qa",
      observationId,
      periodStart: ctx.budget.periodStart,
      phraseId: null,
      pinId: null,
    });
    applySpendHalt(ctx, questions);
    if (questions.status !== "queued") {
      await ctx.observations.update({
        costUsdMicros:
          questions.status === "error" ? questions.costUsdMicros : 0,
        observationId,
        status: questions.status === "skipped" ? "skipped" : "error",
        ...(questions.status === "skipped"
          ? { skipReason: questions.reason }
          : {}),
      });
      return;
    }
  }
  const posts = await runQueued(ctx, "posts", target, {
    businessExternalId: ctx.budget.businessExternalId,
    cacheFingerprint: null,
    cellIndex: null,
    kind: "gbp_posts_qa",
    observationId,
    periodStart: ctx.budget.periodStart,
    phraseId: null,
    pinId: null,
  });
  applySpendHalt(ctx, posts);
  if (posts.status === "queued") {
    return;
  }
  await ctx.observations.update({
    costUsdMicros: posts.status === "error" ? posts.costUsdMicros : 0,
    observationId,
    status: posts.status === "skipped" ? "skipped" : "error",
    ...(posts.status === "skipped" ? { skipReason: posts.reason } : {}),
  });
};

const runDomain = async (ctx: ResearchContext): Promise<void> => {
  if (!ctx.websiteDomain) {
    await skip(ctx, "domain_overview", "no_website");
    return;
  }
  const blocked = blockReason(ctx);
  if (blocked) {
    await skip(ctx, "domain_overview", blocked);
    return;
  }
  const outcome = await runLive(
    ctx,
    "domainRankOverview",
    { target: ctx.websiteDomain },
    (result) =>
      domainOverviewFromResult(result, {
        domain: ctx.websiteDomain ?? "",
        now: ctx.now,
      })
  );
  applySpendHalt(ctx, outcome);
  if (outcome.status === "complete") {
    await recordRow(ctx, {
      costUsdMicros: outcome.costUsdMicros,
      kind: "domain_overview",
      payload: { kind: "domain_overview", payload: outcome.value },
      status: "complete",
    });
    return;
  }
  if (outcome.status === "skipped") {
    await skip(ctx, "domain_overview", outcome.reason);
    return;
  }
  await recordRow(ctx, {
    costUsdMicros: outcome.costUsdMicros,
    kind: "domain_overview",
    status: "error",
  });
};

const runBacklinks = async (ctx: ResearchContext): Promise<void> => {
  if (!ctx.websiteDomain) {
    await skip(ctx, "backlinks", "no_website");
    return;
  }
  const blocked = blockReason(ctx);
  if (blocked) {
    await skip(ctx, "backlinks", blocked);
    return;
  }
  const domain = ctx.websiteDomain;
  const summary = await runLive(
    ctx,
    "backlinksSummary",
    { target: domain },
    (result) => result
  );
  applySpendHalt(ctx, summary);
  if (summary.status === "skipped") {
    await skip(ctx, "backlinks", summary.reason);
    return;
  }
  const referring = ctx.stop
    ? null
    : await runLive(
        ctx,
        "referringDomains",
        { target: domain },
        (result) => result
      );
  if (referring) {
    applySpendHalt(ctx, referring);
  }
  if (referring?.status === "skipped") {
    await skip(ctx, "backlinks", referring.reason);
    return;
  }
  const summaryResult = summary.status === "complete" ? summary.value : null;
  const referringResult =
    referring?.status === "complete" ? referring.value : null;
  if (!summaryResult && !referringResult) {
    const cost =
      (summary.status === "error" ? summary.costUsdMicros : 0) +
      (referring?.status === "error" ? referring.costUsdMicros : 0);
    await recordRow(ctx, {
      costUsdMicros: cost,
      kind: "backlinks",
      status: "error",
    });
    return;
  }
  const cost =
    (summary.status === "complete" ? summary.costUsdMicros : 0) +
    (referring?.status === "complete" ? referring.costUsdMicros : 0);
  await recordRow(ctx, {
    costUsdMicros: cost,
    kind: "backlinks",
    payload: {
      kind: "backlinks",
      payload: backlinksFromResults({
        domain,
        now: ctx.now,
        referringDomains: referringResult,
        summary: summaryResult,
      }),
    },
    status: "complete",
  });
};

const competitorIds = (
  business: Business,
  leaderPlaceId: string | null
): string[] => {
  const pinned = business.competitors
    .slice(0, LINK_GAP_COMPETITORS)
    .map((competitor) => competitor.placeId);
  if (pinned.length > 0) {
    return pinned;
  }
  return leaderPlaceId ? [leaderPlaceId] : [];
};

const domainsFor = (
  notes: readonly PlaceNote[],
  placeIds: readonly string[],
  selfDomain: string | null
): string[] => {
  const domains: string[] = [];
  for (const placeId of placeIds) {
    const domain = notes.find((note) => note.placeId === placeId)?.domain;
    if (!domain) {
      continue;
    }
    const bare = bareDomain(domain);
    if (!bare || bare === selfDomain || domains.includes(bare)) {
      continue;
    }
    domains.push(bare);
    if (domains.length >= LINK_GAP_COMPETITORS) {
      break;
    }
  }
  return domains;
};

const leaderPlaceId = (
  rows: readonly SeoObservationRow[],
  selfPlaceId: string | null
): string | null => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.kind !== "rank_grid" || row.status !== "complete") {
      continue;
    }
    const parsed = readObservationPayload(row);
    if (!parsed || parsed.kind !== "rank_grid") {
      continue;
    }
    for (const cell of parsed.payload.cells) {
      for (const place of cell.top) {
        if (!place.placeId || place.placeId === selfPlaceId) {
          continue;
        }
        counts.set(place.placeId, (counts.get(place.placeId) ?? 0) + 1);
      }
    }
  }
  let best: { count: number; id: string } | null = null;
  for (const [id, count] of counts) {
    if (!best || count > best.count) {
      best = { count, id };
    }
  }
  return best?.id ?? null;
};

const runLinkGap = async (
  ctx: ResearchContext,
  domains: readonly string[]
): Promise<void> => {
  if (!ctx.websiteDomain || domains.length === 0) {
    await skip(ctx, "link_gap", "no_website");
    return;
  }
  const blocked = blockReason(ctx);
  if (blocked) {
    await skip(ctx, "link_gap", blocked);
    return;
  }
  const domain = ctx.websiteDomain;
  const outcome = await runLive(
    ctx,
    "domainIntersection",
    { competitors: [...domains], target: domain },
    (result) =>
      linkGapFromResult(result, {
        competitorDomains: [...domains],
        domain,
        now: ctx.now,
      })
  );
  applySpendHalt(ctx, outcome);
  if (outcome.status === "complete") {
    await recordRow(ctx, {
      costUsdMicros: outcome.costUsdMicros,
      kind: "link_gap",
      payload: { kind: "link_gap", payload: outcome.value },
      status: "complete",
    });
    return;
  }
  if (outcome.status === "skipped") {
    await skip(ctx, "link_gap", outcome.reason);
    return;
  }
  await recordRow(ctx, {
    costUsdMicros: outcome.costUsdMicros,
    kind: "link_gap",
    status: "error",
  });
};

const completePayloads = <Schema extends z.ZodType>(
  rows: readonly SeoObservationRow[],
  kind: SeoObservationKind,
  schema: Schema
): z.output<Schema>[] =>
  rows.flatMap((row) => {
    if (row.kind !== kind || row.status !== "complete" || !row.payloadJson) {
      return [];
    }
    const parsed = schema.safeParse(readJson(row.payloadJson));
    return parsed.success ? [parsed.data] : [];
  });

const derivedReviewGap = (
  samples: readonly ReviewSamplePayload[],
  notes: readonly PlaceNote[]
): SeoObservationPayloadInput => ({
  kind: "review_gap",
  payload: {
    rows: samples.map((sample) => {
      const note = notes.find((item) => item.placeId === sample.placeId);
      return {
        isSelf: sample.isSelf,
        latestReviewAt: sample.latestReviewAt,
        name: note?.name ?? null,
        ownerReplyRate: sample.ownerReplyRate,
        placeId: sample.placeId,
        rating: note?.rating ?? sample.averageSampleRating,
        reviewCount: note?.reviewCount ?? null,
      };
    }),
  },
});

const derivedProspects = (
  linkGap: LinkGapPayload | undefined,
  backlinks: BacklinksPayload | undefined
): SeoObservationPayloadInput | null => {
  if (linkGap) {
    return {
      kind: "link_prospects",
      payload: {
        domains: linkGap.domains
          .slice(0, LINK_PROSPECTS_KEPT)
          .map((domain) => ({
            competitorDomains: domain.linksTo,
            domain: domain.domain,
            rank: domain.rank,
          })),
        source: "link_gap",
      },
    };
  }
  if (!backlinks) {
    return null;
  }
  return {
    kind: "link_prospects",
    payload: {
      domains: backlinks.topReferringDomains
        .slice(0, LINK_PROSPECTS_KEPT)
        .map((domain) => ({
          competitorDomains: [],
          domain: domain.domain,
          rank: domain.rank,
        })),
      source: "own_referring_domains",
    },
  };
};

const optionalNumber = (
  value: number | null | undefined
): number | undefined => (typeof value === "number" ? value : undefined);

const resolveCeiling = async (
  ceilingUsd: number | undefined
): Promise<number> => {
  if (ceilingUsd !== undefined) {
    return ceilingUsd;
  }
  const env = await getDataForSeoEnv();
  return env.monthlyCeilingUsd ?? 0;
};

const assignSummaryNumber = (
  summary: PeriodSummaryPayload,
  key:
    | "estimatedTraffic"
    | "listingScore"
    | "ownerReplyRate"
    | "rating"
    | "referringDomains"
    | "reviewCount",
  value: number | null | undefined
): void => {
  const number = optionalNumber(value);
  if (number !== undefined) {
    summary[key] = number;
  }
};

const gridTop3Summary = (
  rows: readonly SeoObservationRow[],
  selfPlaceId: string | null
): PeriodSummaryPayload["gridTop3Count"] => {
  if (!selfPlaceId) {
    return;
  }
  const gridTop3: Record<string, Record<string, number>> = {};
  for (const grid of completePayloads(
    rows,
    "rank_grid",
    rankGridPayloadSchema
  )) {
    const counts = gridTop3[grid.pinId] ?? {};
    counts[grid.phraseId] = gridTop3Count(grid, selfPlaceId);
    gridTop3[grid.pinId] = counts;
  }
  return Object.keys(gridTop3).length > 0 ? gridTop3 : undefined;
};

const organicPositionSummary = (
  rows: readonly SeoObservationRow[]
): PeriodSummaryPayload["organicPosition"] => {
  const organic: Record<string, number> = {};
  for (const row of completePayloads(
    rows,
    "organic_serp",
    organicSerpPayloadSchema
  )) {
    if (row.position !== null) {
      organic[row.phraseId] = row.position;
    }
  }
  return Object.keys(organic).length > 0 ? organic : undefined;
};

const searchVolumeSummary = (
  rows: readonly SeoObservationRow[]
): PeriodSummaryPayload["searchVolume"] => {
  const volume: Record<string, number> = {};
  for (const metrics of completePayloads(
    rows,
    "keyword_metrics",
    keywordMetricsPayloadSchema
  )) {
    for (const keyword of metrics.keywords) {
      if (keyword.searchVolume !== null) {
        volume[keyword.phraseId] = keyword.searchVolume;
      }
    }
  }
  return Object.keys(volume).length > 0 ? volume : undefined;
};

const aiOverviewSummary = (
  rows: readonly SeoObservationRow[]
): PeriodSummaryPayload["aiOverview"] => {
  const aiOverview: PeriodSummaryPayload["aiOverview"] = {};
  for (const mention of completePayloads(
    rows,
    "ai_mention",
    aiMentionPayloadSchema
  )) {
    aiOverview[mention.phraseId] = mention.status;
  }
  return Object.keys(aiOverview).length > 0 ? aiOverview : undefined;
};

const competitorSummary = (
  rows: readonly SeoObservationRow[]
): PeriodSummaryPayload["competitors"] => {
  const [snapshot] = completePayloads(
    rows,
    "competitor_snapshot",
    competitorSnapshotPayloadSchema
  );
  if (!snapshot) {
    return;
  }
  const competitors: NonNullable<PeriodSummaryPayload["competitors"]> = {};
  for (const entry of snapshot.competitors) {
    const metrics: NonNullable<PeriodSummaryPayload["competitors"]>[string] =
      {};
    if (entry.listingScore !== null) {
      metrics.listingScore = entry.listingScore;
    }
    if (entry.rating !== null) {
      metrics.rating = entry.rating;
    }
    if (entry.reviewCount !== null) {
      metrics.reviewCount = entry.reviewCount;
    }
    if (Object.keys(entry.mapPackCells).length > 0) {
      metrics.gridTop3Count = entry.mapPackCells;
    }
    if (Object.keys(entry.organicPosition).length > 0) {
      metrics.organicPosition = entry.organicPosition;
    }
    if (Object.keys(metrics).length > 0) {
      competitors[entry.placeId] = metrics;
    }
  }
  return Object.keys(competitors).length > 0 ? competitors : undefined;
};

const periodSummaryFrom = (
  rows: readonly SeoObservationRow[],
  notes: readonly PlaceNote[],
  listingScore: number | null,
  selfPlaceId: string | null
): PeriodSummaryPayload => {
  const summary: PeriodSummaryPayload = {
    aiOverview: aiOverviewSummary(rows),
    competitors: competitorSummary(rows),
    gridTop3Count: gridTop3Summary(rows, selfPlaceId),
    organicPosition: organicPositionSummary(rows),
    searchVolume: searchVolumeSummary(rows),
  };
  assignSummaryNumber(summary, "listingScore", listingScore);
  const selfSample = completePayloads(
    rows,
    "review_sample",
    reviewSamplePayloadSchema
  ).find((sample) => sample.isSelf);
  const selfNote = notes.find((note) => note.placeId === selfPlaceId);
  assignSummaryNumber(summary, "ownerReplyRate", selfSample?.ownerReplyRate);
  assignSummaryNumber(summary, "rating", selfNote?.rating);
  assignSummaryNumber(summary, "reviewCount", selfNote?.reviewCount);
  const [domain] = completePayloads(
    rows,
    "domain_overview",
    domainOverviewPayloadSchema
  );
  assignSummaryNumber(summary, "estimatedTraffic", domain?.estimatedTraffic);
  const [links] = completePayloads(rows, "backlinks", backlinksPayloadSchema);
  assignSummaryNumber(summary, "referringDomains", links?.referringDomains);
  return summary;
};

const writeDerived = async (
  ctx: ResearchContext,
  rows: readonly SeoObservationRow[],
  kind: SeoObservationKind,
  payload: SeoObservationPayloadInput
): Promise<void> => {
  const existing = rows.find((row) => row.kind === kind);
  const payloadJson = observationPayloadJson(payload);
  await (existing
    ? ctx.observations.update({
        observationId: existing.id,
        payloadJson,
        status: "complete",
      })
    : recordRow(ctx, {
        costUsdMicros: 0,
        kind,
        payload,
        status: "complete",
      }));
};

const upsertDerived = async (
  ctx: ResearchContext,
  rows: readonly SeoObservationRow[]
): Promise<void> => {
  const notes = await readNotes(
    ctx.taskStore,
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  const samples = completePayloads(
    rows,
    "review_sample",
    reviewSamplePayloadSchema
  );
  if (samples.length > 0) {
    await writeDerived(
      ctx,
      rows,
      "review_gap",
      derivedReviewGap(samples, notes)
    );
  }
  const [linkGap] = completePayloads(rows, "link_gap", linkGapPayloadSchema);
  const [backlinks] = completePayloads(
    rows,
    "backlinks",
    backlinksPayloadSchema
  );
  const prospects = derivedProspects(linkGap, backlinks);
  if (prospects) {
    await writeDerived(ctx, rows, "link_prospects", prospects);
  }
  const summaryPayload = periodSummaryFrom(
    rows,
    notes,
    ctx.listingScore,
    ctx.placeId
  );
  await writeDerived(ctx, rows, "period_summary", {
    kind: "period_summary",
    payload: summaryPayload,
  });
};

export const finalizeResearchPeriod = async (
  ctx: ResearchContext
): Promise<void> => {
  let rows = await ctx.observations.listForPeriod(
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  if (rows.some((row) => row.status === "queued")) {
    return;
  }
  if (!rows.some((row) => row.kind === "link_gap")) {
    const notes = await readNotes(
      ctx.taskStore,
      ctx.budget.businessExternalId,
      ctx.budget.periodStart
    );
    const leader = leaderPlaceId(rows, ctx.placeId);
    const domains = domainsFor(
      notes,
      competitorIds(ctx.business, leader),
      ctx.websiteDomain
    );
    await runLinkGap(ctx, domains);
    rows = await ctx.observations.listForPeriod(
      ctx.budget.businessExternalId,
      ctx.budget.periodStart
    );
  }
  if (rows.some((row) => row.status === "queued")) {
    return;
  }
  const leader = leaderPlaceId(rows, ctx.placeId);
  const sampled = new Set(
    completePayloads(rows, "review_sample", reviewSamplePayloadSchema).map(
      (sample) => sample.placeId
    )
  );
  for (const row of rows) {
    if (row.kind !== "review_sample") {
      continue;
    }
    const work = await readWork(ctx.taskStore, row.id);
    if (work?.placeId) {
      sampled.add(work.placeId);
    }
  }
  const missingLeader =
    ctx.business.competitors.length === 0 &&
    leader !== null &&
    leader !== ctx.placeId &&
    !sampled.has(leader);
  if (missingLeader && ctx.client && !ctx.stop) {
    const queued = await queueReview(ctx, { isSelf: false, placeId: leader });
    if (queued) {
      return;
    }
  }
  rows = await ctx.observations.listForPeriod(
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  if (rows.some((row) => row.status === "queued")) {
    return;
  }
  await upsertDerived(ctx, rows);
};

const runPass = async (ctx: ResearchContext): Promise<void> => {
  await runRankGrids(ctx);
  await runOrganic(ctx);
  await runKeywords(ctx);
  const midway = await ctx.observations.listForPeriod(
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  await runReviews(ctx, leaderPlaceId(midway, ctx.placeId));
  await runPosts(ctx);
  await runDomain(ctx);
  await runBacklinks(ctx);
  if (!ctx.gridPending) {
    const notes = await readNotes(
      ctx.taskStore,
      ctx.budget.businessExternalId,
      ctx.budget.periodStart
    );
    const rows = await ctx.observations.listForPeriod(
      ctx.budget.businessExternalId,
      ctx.budget.periodStart
    );
    const domains = domainsFor(
      notes,
      competitorIds(ctx.business, leaderPlaceId(rows, ctx.placeId)),
      ctx.websiteDomain
    );
    await runLinkGap(ctx, domains);
  }
  await finalizeResearchPeriod(ctx);
};

const buildContext = (input: {
  budget: ResearchBudget;
  business: Business;
  checkResults: Record<string, { value: boolean | null }>;
  client: DataForSeoClient | null;
  listingScore: number | null;
  mode: "live" | "queued";
  now: Date;
  observations: ObservationStore;
  store: ResearchStore;
  taskStore: TaskStore;
}): ResearchContext => ({
  ...input,
  gridPending: false,
  phrases: input.business.searchPhrases,
  pin: businessPin(input.business),
  placeId: businessPlaceId(input.business),
  stop: null,
  websiteDomain: input.business.websiteUrl
    ? bareDomain(input.business.websiteUrl)
    : null,
});

export interface ResearchRunDeps {
  ceilingUsd?: number;
  client?: DataForSeoClient | null;
  entitlement?: z.infer<typeof entitlementInputSchema> | null;
  now?: Date;
  observations?: ObservationStore;
  prepare?: (business: Business) => Promise<Business>;
  store?: ResearchStore;
  taskStore?: TaskStore;
}

/**
 * One research pass after a successful listing scan. `baseline` uses live
 * endpoints when they exist. `schedule` uses queued endpoints when they exist.
 * A vendor failure is recorded and does not escape this function.
 */
export const runBusinessResearch = async (
  input: {
    business: Business;
    checkResults: Record<string, { value: boolean | null }>;
    listingScore: number | null;
    trigger: ScanTrigger;
  },
  deps: ResearchRunDeps = {}
): Promise<void> => {
  if (input.trigger !== "baseline" && input.trigger !== "schedule") {
    return;
  }
  try {
    const entitlement =
      deps.entitlement === undefined
        ? await getResearchEntitlement(input.business.id)
        : entitlementInputSchema.nullable().parse(deps.entitlement);
    if (!entitlement?.nextScanAt || !entitlementAllowsResearch([entitlement])) {
      return;
    }
    const now = deps.now ?? new Date();
    const ceilingUsd = await resolveCeiling(deps.ceilingUsd);
    const budget = researchBudget({
      businessExternalId: input.business.id,
      monthlyCeilingUsd: ceilingUsd,
      nextScanAt: entitlement.nextScanAt,
      now,
    });
    const observations = deps.observations ?? convexObservationStore;
    const existing = await observations.listForPeriod(
      budget.businessExternalId,
      budget.periodStart
    );
    if (existing.length > 0) {
      return;
    }
    const prepare = deps.prepare ?? persistMissingBusinessPin;
    const business = await prepare(input.business);
    const client =
      deps.client === undefined ? await dataForSeoClientFromEnv() : deps.client;
    const ctx = buildContext({
      budget,
      business,
      checkResults: input.checkResults,
      client,
      listingScore: input.listingScore,
      mode: input.trigger === "schedule" ? "queued" : "live",
      now,
      observations,
      store: deps.store ?? convexResearchStore,
      taskStore: deps.taskStore ?? (await defaultTaskStore()),
    });
    await runPass(ctx);
  } catch (error) {
    console.error("SEO research failed after the listing scan", error);
  }
};

const publishQueuedCache = async (
  record: QueuedTaskRecord,
  result: unknown,
  store: ResearchStore
): Promise<void> => {
  const fingerprint = record.meta.cacheFingerprint;
  if (!fingerprint) {
    return;
  }
  const existing = await store.latestCompleteCache(fingerprint);
  if (existing?.payloadJson) {
    return;
  }
  const payloadJson = cacheJsonFromResult(record.meta.endpoint, result);
  if (!payloadJson) {
    return;
  }
  await store.publishCache({
    costUsdMicros: record.costUsdMicros,
    fingerprint,
    payloadJson,
  });
};

const gridFromCaches = async (
  ctx: ResearchContext,
  work: ResearchWork,
  phraseId: string,
  pinId: string
): Promise<RankGridPayload | null> => {
  if (!work.center || !work.phrase) {
    return null;
  }
  const points = gridPoints(work.center);
  const cells: RankGridPayload["cells"] = [];
  for (const [index, point] of points.entries()) {
    const cached = await readCached(
      ctx,
      mapsCache(ctx, work.phrase, index, work.center)
    );
    if (!cached) {
      return null;
    }
    await rememberPlaces(ctx, cached.places);
    cells.push(
      rankGridCell({
        index,
        places: cached,
        point,
        self: { cid: null, placeId: work.selfPlaceId },
      })
    );
  }
  return {
    cells,
    center: work.center,
    checkedAt: ctx.now.toISOString(),
    phrase: work.phrase,
    phraseId,
    pinId,
    spacingMetres: GRID_SPACING_METRES,
  };
};

const completeQueuedMaps = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  phraseId: string,
  pinId: string
): Promise<void> => {
  const payload = await gridFromCaches(ctx, work, phraseId, pinId);
  if (!payload) {
    return;
  }
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({ kind: "rank_grid", payload }),
    status: "complete",
  });
};

const completeQueuedOrganic = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  phraseId: string,
  result: unknown
): Promise<void> => {
  if (!work.phrase) {
    return;
  }
  const snapshot = organicSnapshotFromResult(
    organicResultSchema.nullable().parse(result)
  );
  const phrase = ctx.phrases.find((item) => item.id === phraseId) ?? {
    id: phraseId,
    suggested: true,
    text: work.phrase,
  };
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({
      kind: "organic_serp",
      payload: {
        aiOverview: snapshot.aiOverview,
        checkedAt: ctx.now.toISOString(),
        locationCode: SEO_LOCATION_CODE_AU,
        phrase: phrase.text,
        phraseId: phrase.id,
        position: organicPositionFor(snapshot, work.domain),
        results: snapshot.results,
      },
    }),
    status: "complete",
  });
  const mention = aiMentionFor(snapshot, work.domain);
  await recordRow(ctx, {
    costUsdMicros: 0,
    kind: "ai_mention",
    payload: {
      kind: "ai_mention",
      payload: {
        citedUrl: mention.citedUrl,
        phrase: phrase.text,
        phraseId: phrase.id,
        status: mention.status,
      },
    },
    phraseId: phrase.id,
    status: "complete",
  });
};

const completeQueuedReviews = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  result: unknown
): Promise<void> => {
  if (!work.placeId) {
    return;
  }
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({
      kind: "review_sample",
      payload: reviewSampleFromResult(
        reviewsResultSchema.nullable().parse(result),
        {
          isSelf: work.isSelf ?? false,
          now: ctx.now,
          placeId: work.placeId,
        }
      ),
    }),
    status: "complete",
  });
};

const completeQueuedPosts = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  endpoint: "posts" | "questions",
  result: unknown
): Promise<void> => {
  const next = {
    ...work,
    postsJson:
      endpoint === "posts"
        ? JSON.stringify(postsResultSchema.nullable().parse(result))
        : work.postsJson,
    questionsJson:
      endpoint === "questions"
        ? JSON.stringify(questionsResultSchema.nullable().parse(result))
        : work.questionsJson,
  };
  await writeWork(ctx.taskStore, observationId, next);
  if (next.postsJson === null || next.questionsJson === null) {
    return;
  }
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({
      kind: "gbp_posts_qa",
      payload: postsQaFromResults({
        now: ctx.now,
        posts: postsResultSchema.nullable().parse(readJson(next.postsJson)),
        questions: questionsResultSchema
          .nullable()
          .parse(readJson(next.questionsJson)),
      }),
    }),
    status: "complete",
  });
};

const completeQueuedDomain = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  result: unknown
): Promise<void> => {
  if (!work.domain) {
    return;
  }
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({
      kind: "domain_overview",
      payload: domainOverviewFromResult(
        domainRankOverviewResultSchema.nullable().parse(result),
        { domain: work.domain, now: ctx.now }
      ),
    }),
    status: "complete",
  });
};

const completeQueuedLinkGap = async (
  ctx: ResearchContext,
  observationId: string,
  work: ResearchWork,
  result: unknown
): Promise<void> => {
  if (!work.domain) {
    return;
  }
  await ctx.observations.update({
    observationId,
    payloadJson: observationPayloadJson({
      kind: "link_gap",
      payload: linkGapFromResult(
        domainIntersectionResultSchema.nullable().parse(result),
        {
          competitorDomains: [],
          domain: work.domain,
          now: ctx.now,
        }
      ),
    }),
    status: "complete",
  });
};

const completeQueuedObservation = async (
  ctx: ResearchContext,
  record: QueuedTaskRecord,
  result: unknown
): Promise<void> => {
  const { observationId, phraseId, pinId, endpoint } = record.meta;
  if (!observationId) {
    return;
  }
  const rows = await ctx.observations.listForPeriod(
    ctx.budget.businessExternalId,
    ctx.budget.periodStart
  );
  const row = rows.find((item) => item.id === observationId);
  if (!row || row.status !== "queued") {
    return;
  }
  if (record.status === "error") {
    await ctx.observations.update({ observationId, status: "error" });
    return;
  }
  if (record.status !== "complete" || record.resultJson === null) {
    return;
  }
  const stored = await readWork(ctx.taskStore, observationId);
  const work = stored ?? blankWork(ctx.budget.month);
  if (endpoint === "maps" && phraseId && pinId) {
    await completeQueuedMaps(ctx, observationId, work, phraseId, pinId);
    return;
  }
  if (endpoint === "organic" && phraseId) {
    await completeQueuedOrganic(ctx, observationId, work, phraseId, result);
    return;
  }
  if (endpoint === "reviews") {
    await completeQueuedReviews(ctx, observationId, work, result);
    return;
  }
  if (
    (endpoint === "posts" || endpoint === "questions") &&
    row.kind === "gbp_posts_qa"
  ) {
    await completeQueuedPosts(ctx, observationId, work, endpoint, result);
    return;
  }
  if (endpoint === "domainRankOverview") {
    await completeQueuedDomain(ctx, observationId, work, result);
    return;
  }
  if (endpoint === "domainIntersection") {
    await completeQueuedLinkGap(ctx, observationId, work, result);
  }
};

/** Called when a postback arrives. Writes derived rows once nothing is queued. */
export const finishQueuedResearchTask = async (
  record: QueuedTaskRecord,
  deps: ResearchRunDeps = {}
): Promise<void> => {
  const { businessExternalId, periodStart } = record.meta;
  if (!businessExternalId || !periodStart) {
    return;
  }
  const business = await getBusiness(businessExternalId);
  if (!business) {
    return;
  }
  const now = deps.now ?? new Date();
  const ceilingUsd = await resolveCeiling(deps.ceilingUsd);
  const budget = researchBudget({
    businessExternalId,
    monthlyCeilingUsd: ceilingUsd,
    nextScanAt: new Date(
      Date.parse(periodStart) + SCAN_INTERVAL_MS
    ).toISOString(),
    now,
  });
  const observations = deps.observations ?? convexObservationStore;
  const store = deps.store ?? convexResearchStore;
  const taskStore = deps.taskStore ?? (await defaultTaskStore());
  const client =
    deps.client === undefined ? await dataForSeoClientFromEnv() : deps.client;
  const details = await getLatestCompleteScanDetails(businessExternalId);
  const ctx = buildContext({
    budget,
    business,
    checkResults: {},
    client,
    listingScore: details?.score ?? null,
    mode: "queued",
    now,
    observations,
    store,
    taskStore,
  });
  if (record.resultJson !== null) {
    await publishQueuedCache(record, readJson(record.resultJson), store);
  }
  await completeQueuedObservation(
    ctx,
    record,
    record.resultJson === null ? null : readJson(record.resultJson)
  );
  await finalizeResearchPeriod(ctx);
};
