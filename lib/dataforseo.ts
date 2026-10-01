import { z } from "zod";

import { getCloudflareEnv, getDataForSeoEnv } from "./audit-env";
import {
  AI_CITATIONS_KEPT,
  GRID_PLACES_PER_CELL,
  LINK_GAP_DOMAINS_KEPT,
  ORGANIC_RESULTS_KEPT,
  REFERRING_DOMAINS_KEPT,
  SEO_LANGUAGE_CODE,
  SEO_LOCATION_CODE_AU,
  seoObservationKindSchema,
  usdToMicros,
} from "./seo-schema";
import type {
  AiOverviewStatus,
  BacklinksPayload,
  Coordinates,
  DomainOverviewPayload,
  GbpPostsQaPayload,
  LinkGapPayload,
  ReviewSamplePayload,
} from "./seo-schema";

export const DATAFORSEO_API_HOST = "https://api.dataforseo.com";
export const DATAFORSEO_SANDBOX_HOST = "https://sandbox.dataforseo.com";
export const DATAFORSEO_POSTBACK_PATH = "/api/internal/dataforseo/postback";

export const DATAFORSEO_OK = 20_000;
export const DATAFORSEO_TASK_CREATED = 20_100;
const DATAFORSEO_NOT_READY = new Set([40_601, 40_602]);

const REQUEST_TIMEOUT_MS = 120_000;
const QUEUED_TASK_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAPS_DEPTH = 20;
const MAPS_ZOOM = "15z";
const MAPS_PLACES_KEPT = 20;
const REVIEWS_DEPTH = 20;
const RECENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

const TIMESTAMP_PATTERN =
  /^(?<date>\d{4}-\d{2}-\d{2}) (?<time>\d{2}:\d{2}:\d{2}) ?(?<zone>[+-]\d{2}:\d{2})$/u;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:\/\//iu;
const LEADING_WWW_PATTERN = /^www\./u;

export const dataForSeoBaseUrl = (sandbox: boolean): string =>
  `${sandbox ? DATAFORSEO_SANDBOX_HOST : DATAFORSEO_API_HOST}/v3`;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DataForSeoClient {
  apiKey: string;
  baseUrl: string;
  fetch: FetchLike;
  postbackUrl: string | null;
  sandbox: boolean;
}

const isBasicCredential = (value: string): boolean => {
  try {
    return atob(value).includes(":");
  } catch {
    return false;
  }
};

const apiKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    isBasicCredential,
    "DATAFORSEO_API_KEY must be base64 of login:password"
  );

export const createDataForSeoClient = (input: {
  apiKey: string;
  fetch?: FetchLike;
  sandbox?: boolean;
  siteUrl?: string | null;
}): DataForSeoClient => ({
  apiKey: apiKeySchema.parse(input.apiKey),
  baseUrl: dataForSeoBaseUrl(input.sandbox ?? false),
  fetch: input.fetch ?? ((url, init) => fetch(url, init)),
  postbackUrl: input.siteUrl
    ? new URL(DATAFORSEO_POSTBACK_PATH, input.siteUrl).toString()
    : null,
  sandbox: input.sandbox ?? false,
});

/** Null when `DATAFORSEO_API_KEY` is unset; the runner skips with `no_api_key`. */
export const dataForSeoClientFromEnv =
  async (): Promise<DataForSeoClient | null> => {
    const env = await getDataForSeoEnv();
    if (!env.apiKey) {
      return null;
    }
    return createDataForSeoClient({
      apiKey: env.apiKey,
      sandbox: env.sandbox,
      siteUrl: env.siteUrl,
    });
  };

export class DataForSeoError extends Error {
  readonly costUsdMicros: number;
  readonly statusCode: number | null;

  constructor(
    message: string,
    options: { costUsdMicros?: number; statusCode?: number | null } = {}
  ) {
    super(message);
    this.name = "DataForSeoError";
    this.costUsdMicros = options.costUsdMicros ?? 0;
    this.statusCode = options.statusCode ?? null;
  }
}

const nullishNumber = z.number().nullish();
const nullishString = z.string().nullish();
const ratingSchema = z
  .object({ value: nullishNumber, votes_count: nullishNumber })
  .nullish();

const taskSchema = z.object({
  cost: nullishNumber,
  id: z.string(),
  result: z.array(z.unknown()).nullish(),
  status_code: z.number(),
  status_message: nullishString,
});
export type DataForSeoTask = z.infer<typeof taskSchema>;

const envelopeSchema = z.object({
  status_code: z.number(),
  status_message: nullishString,
  tasks: z.array(taskSchema).nullish(),
});

/** One task per request, so the first task is the answer. */
export const parseDataForSeoEnvelope = (raw: unknown): DataForSeoTask => {
  const envelope = envelopeSchema.parse(raw);
  if (envelope.status_code !== DATAFORSEO_OK) {
    throw new DataForSeoError(
      envelope.status_message ?? "DataForSEO request failed",
      { statusCode: envelope.status_code }
    );
  }
  const [task] = envelope.tasks ?? [];
  if (!task) {
    throw new DataForSeoError("DataForSEO returned no task");
  }
  return task;
};

export const mapsResultSchema = z.object({
  items: z.array(z.unknown()).nullish(),
});

const mapsItemSchema = z.object({
  category: nullishString,
  cid: nullishString,
  domain: nullishString,
  latitude: nullishNumber,
  longitude: nullishNumber,
  place_id: nullishString,
  rank_group: nullishNumber,
  rating: ratingSchema,
  title: nullishString,
  total_photos: nullishNumber,
  type: z.literal("maps_search"),
});

export const organicResultSchema = z.object({
  items: z.array(z.unknown()).nullish(),
});

const organicItemSchema = z.object({
  domain: nullishString,
  rank_group: z.number(),
  title: nullishString,
  type: z.literal("organic"),
  url: nullishString,
});

const aiReferenceSchema = z.object({
  domain: nullishString,
  source: nullishString,
  title: nullishString,
  url: nullishString,
});

const typedItemSchema = z.object({ type: z.string() });

export const keywordOverviewResultSchema = z.object({
  items: z
    .array(
      z.object({
        keyword: z.string(),
        keyword_info: z
          .object({ cpc: nullishNumber, search_volume: nullishNumber })
          .nullish(),
        keyword_properties: z
          .object({ keyword_difficulty: nullishNumber })
          .nullish(),
        search_intent_info: z.object({ main_intent: nullishString }).nullish(),
      })
    )
    .nullish(),
});

/** Review text and reviewer names are dropped by the schema, never stored. */
export const reviewsResultSchema = z.object({
  cid: nullishString,
  items: z
    .array(
      z.object({
        owner_answer: nullishString,
        rating: ratingSchema,
        timestamp: nullishString,
      })
    )
    .nullish(),
  place_id: nullishString,
  rating: ratingSchema,
  reviews_count: nullishNumber,
  title: nullishString,
});

export const postsResultSchema = z.object({
  items: z
    .array(z.object({ timestamp: nullishString, type: nullishString }))
    .nullish(),
});

const questionSchema = z.object({ timestamp: nullishString });

export const questionsResultSchema = z.object({
  items: z.array(questionSchema).nullish(),
  items_without_answers: z.array(questionSchema).nullish(),
});

export const domainRankOverviewResultSchema = z.object({
  items: z
    .array(
      z.object({
        metrics: z
          .object({
            organic: z
              .object({
                count: nullishNumber,
                etv: nullishNumber,
                pos_1: nullishNumber,
                pos_2_3: nullishNumber,
                pos_4_10: nullishNumber,
              })
              .nullish(),
          })
          .nullish(),
      })
    )
    .nullish(),
});

export const backlinksSummaryResultSchema = z.object({
  backlinks: nullishNumber,
  rank: nullishNumber,
  referring_domains: nullishNumber,
});

export const referringDomainsResultSchema = z.object({
  items: z
    .array(
      z.object({
        backlinks: nullishNumber,
        domain: nullishString,
        rank: nullishNumber,
      })
    )
    .nullish(),
});

const intersectionEntrySchema = z.object({
  backlinks: nullishNumber,
  rank: nullishNumber,
  target: nullishString,
});

export const domainIntersectionResultSchema = z.object({
  items: z
    .array(
      z.object({
        domain_intersection: z
          .record(z.string(), intersectionEntrySchema.nullish())
          .nullish(),
      })
    )
    .nullish(),
});

export interface PlaceTarget {
  cid: string | null;
  placeId: string | null;
}

interface EndpointInputs {
  backlinksSummary: { target: string };
  domainIntersection: { competitors: string[]; target: string };
  domainRankOverview: { target: string };
  keywordOverview: { keywords: string[] };
  maps: { keyword: string; point: Coordinates };
  organic: { keyword: string; locationCode: number };
  posts: PlaceTarget;
  questions: PlaceTarget;
  referringDomains: { target: string };
  reviews: PlaceTarget;
}

export type DataForSeoEndpoint = keyof EndpointInputs;
export type DataForSeoInput<Endpoint extends DataForSeoEndpoint> =
  EndpointInputs[Endpoint];
export type DataForSeoMode = "live" | "queued";

export const DATAFORSEO_ENDPOINTS = [
  "backlinksSummary",
  "domainIntersection",
  "domainRankOverview",
  "keywordOverview",
  "maps",
  "organic",
  "posts",
  "questions",
  "referringDomains",
  "reviews",
] as const satisfies readonly DataForSeoEndpoint[];

interface EndpointResults {
  backlinksSummary: z.infer<typeof backlinksSummaryResultSchema>;
  domainIntersection: z.infer<typeof domainIntersectionResultSchema>;
  domainRankOverview: z.infer<typeof domainRankOverviewResultSchema>;
  keywordOverview: z.infer<typeof keywordOverviewResultSchema>;
  maps: z.infer<typeof mapsResultSchema>;
  organic: z.infer<typeof organicResultSchema>;
  posts: z.infer<typeof postsResultSchema>;
  questions: z.infer<typeof questionsResultSchema>;
  referringDomains: z.infer<typeof referringDomainsResultSchema>;
  reviews: z.infer<typeof reviewsResultSchema>;
}

export type DataForSeoResult<Endpoint extends DataForSeoEndpoint> =
  EndpointResults[Endpoint];

interface EndpointDefinition<Input, Result> {
  body: (input: Input) => Record<string, unknown>;
  /** Conservative USD per call at the request sizes below. Null when the mode does not exist. */
  estimateUsd: { live: number | null; queued: number | null };
  paths: {
    live: string | null;
    taskGet: string | null;
    taskPost: string | null;
  };
  postbackData: "advanced" | null;
  result: z.ZodType<Result>;
}

type EndpointDefinitions = {
  [Endpoint in DataForSeoEndpoint]: EndpointDefinition<
    EndpointInputs[Endpoint],
    EndpointResults[Endpoint]
  >;
};

/** Domains go to DataForSEO without scheme, `www.`, or path. */
export const bareDomain = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const withScheme = URL_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withScheme).hostname.replace(LEADING_WWW_PATTERN, "");
  } catch {
    return trimmed.replace(LEADING_WWW_PATTERN, "");
  }
};

const placeKeyword = (target: PlaceTarget): string => {
  if (target.placeId) {
    return `place_id:${target.placeId}`;
  }
  if (target.cid) {
    return `cid:${target.cid}`;
  }
  throw new Error("A Google place id or cid is required");
};

const placeBody = (target: PlaceTarget) => ({
  keyword: placeKeyword(target),
  language_code: SEO_LANGUAGE_CODE,
  location_code: SEO_LOCATION_CODE_AU,
});

const SERP_PATHS = (engine: "maps" | "organic") => ({
  live: `serp/google/${engine}/live/advanced`,
  taskGet: `serp/google/${engine}/task_get/advanced`,
  taskPost: `serp/google/${engine}/task_post`,
});

const BUSINESS_PATHS = (name: string, live: boolean) => ({
  live: live ? `business_data/google/${name}/live` : null,
  taskGet: `business_data/google/${name}/task_get`,
  taskPost: `business_data/google/${name}/task_post`,
});

const LIVE_ONLY = (path: string) => ({
  live: path,
  taskGet: null,
  taskPost: null,
});

const DEFINITIONS: EndpointDefinitions = {
  backlinksSummary: {
    body: ({ target }) => ({ rank_scale: "one_hundred", target }),
    estimateUsd: { live: 0.0201, queued: null },
    paths: LIVE_ONLY("backlinks/summary/live"),
    postbackData: null,
    result: backlinksSummaryResultSchema,
  },
  domainIntersection: {
    body: ({ competitors, target }) => ({
      exclude_targets: [target],
      limit: LINK_GAP_DOMAINS_KEPT,
      rank_scale: "one_hundred",
      targets: Object.fromEntries(
        competitors.map((competitor, index) => [`${index + 1}`, competitor])
      ),
    }),
    estimateUsd: { live: 0.021, queued: null },
    paths: LIVE_ONLY("backlinks/domain_intersection/live"),
    postbackData: null,
    result: domainIntersectionResultSchema,
  },
  domainRankOverview: {
    body: ({ target }) => ({
      language_code: SEO_LANGUAGE_CODE,
      location_code: SEO_LOCATION_CODE_AU,
      target,
    }),
    estimateUsd: { live: 0.0101, queued: null },
    paths: LIVE_ONLY("dataforseo_labs/google/domain_rank_overview/live"),
    postbackData: null,
    result: domainRankOverviewResultSchema,
  },
  keywordOverview: {
    body: ({ keywords }) => ({
      keywords,
      language_code: SEO_LANGUAGE_CODE,
      location_code: SEO_LOCATION_CODE_AU,
    }),
    estimateUsd: { live: 0.0104, queued: null },
    paths: LIVE_ONLY("dataforseo_labs/google/keyword_overview/live"),
    postbackData: null,
    result: keywordOverviewResultSchema,
  },
  maps: {
    body: ({ keyword, point }) => ({
      depth: MAPS_DEPTH,
      keyword,
      language_code: SEO_LANGUAGE_CODE,
      location_coordinate: `${point.latitude.toFixed(7)},${point.longitude.toFixed(7)},${MAPS_ZOOM}`,
    }),
    estimateUsd: { live: 0.002, queued: 0.0006 },
    paths: SERP_PATHS("maps"),
    postbackData: "advanced",
    result: mapsResultSchema,
  },
  organic: {
    body: ({ keyword, locationCode }) => ({
      depth: ORGANIC_RESULTS_KEPT,
      keyword,
      language_code: SEO_LANGUAGE_CODE,
      load_async_ai_overview: true,
      location_code: locationCode,
    }),
    estimateUsd: { live: 0.006, queued: 0.0032 },
    paths: SERP_PATHS("organic"),
    postbackData: "advanced",
    result: organicResultSchema,
  },
  posts: {
    body: placeBody,
    estimateUsd: { live: null, queued: 0.00225 },
    paths: BUSINESS_PATHS("my_business_updates", false),
    postbackData: null,
    result: postsResultSchema,
  },
  questions: {
    body: placeBody,
    estimateUsd: { live: 0.006, queued: 0.003 },
    paths: BUSINESS_PATHS("questions_and_answers", true),
    postbackData: null,
    result: questionsResultSchema,
  },
  referringDomains: {
    body: ({ target }) => ({
      limit: REFERRING_DOMAINS_KEPT,
      order_by: ["rank,desc"],
      rank_scale: "one_hundred",
      target,
    }),
    estimateUsd: { live: 0.0204, queued: null },
    paths: LIVE_ONLY("backlinks/referring_domains/live"),
    postbackData: null,
    result: referringDomainsResultSchema,
  },
  reviews: {
    body: (target) => ({
      ...placeBody(target),
      depth: REVIEWS_DEPTH,
      sort_by: "newest",
    }),
    estimateUsd: { live: null, queued: 0.0015 },
    paths: BUSINESS_PATHS("reviews", false),
    postbackData: null,
    result: reviewsResultSchema,
  },
};

export const supportsMode = (
  endpoint: DataForSeoEndpoint,
  mode: DataForSeoMode
): boolean => DEFINITIONS[endpoint].estimateUsd[mode] !== null;

declare global {
  var listwellDataForSeoObservedCosts: Map<string, number> | undefined;
  var listwellDataForSeoTasks: Map<string, string> | undefined;
}

const observedCosts: Map<string, number> =
  globalThis.listwellDataForSeoObservedCosts ?? new Map<string, number>();
globalThis.listwellDataForSeoObservedCosts = observedCosts;

const observedKey = (endpoint: DataForSeoEndpoint, mode: DataForSeoMode) =>
  `${endpoint}:${mode}`;

/** Zero in sandbox. Otherwise the larger of the static estimate and the last real cost. */
export const estimateCostUsdMicros = (
  client: Pick<DataForSeoClient, "sandbox">,
  endpoint: DataForSeoEndpoint,
  mode: DataForSeoMode
): number => {
  const estimate = DEFINITIONS[endpoint].estimateUsd[mode];
  if (estimate === null) {
    throw new Error(`${endpoint} has no ${mode} endpoint`);
  }
  if (client.sandbox) {
    return 0;
  }
  return Math.max(
    usdToMicros(estimate),
    observedCosts.get(observedKey(endpoint, mode)) ?? 0
  );
};

const recordCost = (
  client: Pick<DataForSeoClient, "sandbox">,
  endpoint: DataForSeoEndpoint,
  mode: DataForSeoMode,
  costUsd: number | null | undefined
): number => {
  if (client.sandbox) {
    return 0;
  }
  const micros = usdToMicros(costUsd ?? 0);
  observedCosts.set(observedKey(endpoint, mode), micros);
  return micros;
};

const send = async (
  client: DataForSeoClient,
  path: string,
  body?: Record<string, unknown>
): Promise<DataForSeoTask> => {
  const response = await client.fetch(`${client.baseUrl}/${path}`, {
    body: body ? JSON.stringify([body]) : undefined,
    headers: {
      authorization: `Basic ${client.apiKey}`,
      "content-type": "application/json",
    },
    method: body ? "POST" : "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new DataForSeoError(`DataForSEO returned HTTP ${response.status}`, {
      statusCode: response.status,
    });
  }
  return parseDataForSeoEnvelope(await response.json());
};

const parseTaskResult = <Result>(
  schema: z.ZodType<Result>,
  task: DataForSeoTask
): Result | null => {
  const [first] = task.result ?? [];
  return first === undefined || first === null ? null : schema.parse(first);
};

const parseEndpointResult = <Endpoint extends DataForSeoEndpoint>(
  endpoint: Endpoint,
  task: DataForSeoTask
): EndpointResults[Endpoint] | null => {
  const definition: EndpointDefinitions[Endpoint] = DEFINITIONS[endpoint];
  return parseTaskResult(definition.result, task);
};

export interface DataForSeoLiveResult<Result> {
  costUsdMicros: number;
  result: Result | null;
  taskId: string;
}

export const callLive = async <Endpoint extends DataForSeoEndpoint>(
  client: DataForSeoClient,
  endpoint: Endpoint,
  input: EndpointInputs[Endpoint]
): Promise<DataForSeoLiveResult<EndpointResults[Endpoint]>> => {
  const definition: EndpointDefinitions[Endpoint] = DEFINITIONS[endpoint];
  if (!definition.paths.live) {
    throw new Error(`${endpoint} has no live endpoint`);
  }
  const task = await send(
    client,
    definition.paths.live,
    definition.body(input)
  );
  const costUsdMicros = recordCost(client, endpoint, "live", task.cost);
  if (task.status_code !== DATAFORSEO_OK) {
    throw new DataForSeoError(task.status_message ?? `${endpoint} failed`, {
      costUsdMicros,
      statusCode: task.status_code,
    });
  }
  return {
    costUsdMicros,
    result: parseTaskResult(definition.result, task),
    taskId: task.id,
  };
};

export type DataForSeoTaskResult<Result> =
  | { ready: false }
  | { ready: true; result: Result | null };

/** For polling when no postback is wanted. task_get itself is free. */
export const getTaskResult = async <Endpoint extends DataForSeoEndpoint>(
  client: DataForSeoClient,
  endpoint: Endpoint,
  taskId: string
): Promise<DataForSeoTaskResult<EndpointResults[Endpoint]>> => {
  const definition: EndpointDefinitions[Endpoint] = DEFINITIONS[endpoint];
  if (!definition.paths.taskGet) {
    throw new Error(`${endpoint} has no queued endpoint`);
  }
  const task = await send(
    client,
    `${definition.paths.taskGet}/${encodeURIComponent(taskId)}`
  );
  if (DATAFORSEO_NOT_READY.has(task.status_code)) {
    return { ready: false };
  }
  if (task.status_code !== DATAFORSEO_OK) {
    throw new DataForSeoError(task.status_message ?? `${endpoint} failed`, {
      statusCode: task.status_code,
    });
  }
  return { ready: true, result: parseTaskResult(definition.result, task) };
};

const endpointSchema = z.enum(DATAFORSEO_ENDPOINTS);

export const queuedTaskMetaSchema = z.object({
  businessExternalId: z.string().nullable(),
  cacheFingerprint: z.string().nullable(),
  cellIndex: z.number().int().nullable(),
  endpoint: endpointSchema,
  kind: seoObservationKindSchema,
  observationId: z.string().nullable(),
  periodStart: z.string().nullable(),
  phraseId: z.string().nullable(),
  pinId: z.string().nullable(),
});
export type QueuedTaskMeta = z.infer<typeof queuedTaskMetaSchema>;

export const queuedTaskRecordSchema = z.object({
  costUsdMicros: z.number().int().nonnegative(),
  meta: queuedTaskMetaSchema,
  postedAt: z.string(),
  receivedAt: z.string().nullable(),
  resultJson: z.string().nullable(),
  status: z.enum(["posting", "posted", "complete", "error"]),
  taskId: z.string().nullable(),
});
export type QueuedTaskRecord = z.infer<typeof queuedTaskRecordSchema>;

export interface TaskStore {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, ttlSeconds: number) => Promise<void>;
}

const memoryTasks: Map<string, string> =
  globalThis.listwellDataForSeoTasks ?? new Map<string, string>();
globalThis.listwellDataForSeoTasks = memoryTasks;

export const memoryTaskStore: TaskStore = {
  get: async (key) => {
    await Promise.resolve();
    return memoryTasks.get(key) ?? null;
  },
  put: async (key, value) => {
    await Promise.resolve();
    memoryTasks.set(key, value);
  },
};

const storedTextSchema = z.string().nullable();

/** `AUDIT_KV` on the Worker, memory in local dev without the Cloudflare context. */
export const defaultTaskStore = async (): Promise<TaskStore> => {
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return memoryTaskStore;
  }
  return {
    get: async (key) => storedTextSchema.parse(await kv.get(key, "text")),
    put: (key, value, ttlSeconds) =>
      kv.put(key, value, { expirationTtl: ttlSeconds }),
  };
};

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const taskKey = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return `dataforseo:task:${toHex(new Uint8Array(digest))}`;
};

const writeTaskRecord = (
  store: TaskStore,
  key: string,
  record: QueuedTaskRecord
): Promise<void> =>
  store.put(
    key,
    JSON.stringify(queuedTaskRecordSchema.parse(record)),
    QUEUED_TASK_TTL_SECONDS
  );

const readTaskRecordByKey = async (
  store: TaskStore,
  key: string
): Promise<QueuedTaskRecord | null> => {
  const raw = await store.get(key);
  if (!raw) {
    return null;
  }
  return queuedTaskRecordSchema.parse(JSON.parse(raw));
};

export const readQueuedTask = async (
  token: string,
  store?: TaskStore
): Promise<QueuedTaskRecord | null> =>
  readTaskRecordByKey(
    store ?? (await defaultTaskStore()),
    await taskKey(token)
  );

export interface QueuedTaskPosted {
  costUsdMicros: number;
  taskId: string;
  token: string;
}

/**
 * Posts a queued task whose result comes back to the postback route. The token
 * is stored before posting so an early postback still finds it.
 */
export const postQueuedTask = async <Endpoint extends DataForSeoEndpoint>(
  client: DataForSeoClient,
  endpoint: Endpoint,
  input: EndpointInputs[Endpoint],
  meta: Omit<QueuedTaskMeta, "endpoint">,
  store?: TaskStore
): Promise<QueuedTaskPosted> => {
  const definition: EndpointDefinitions[Endpoint] = DEFINITIONS[endpoint];
  if (!definition.paths.taskPost) {
    throw new Error(`${endpoint} has no queued endpoint`);
  }
  if (!client.postbackUrl) {
    throw new Error("SITE_URL is required for DataForSEO postbacks");
  }
  const taskStore = store ?? (await defaultTaskStore());
  const token = toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const key = await taskKey(token);
  const record: QueuedTaskRecord = {
    costUsdMicros: 0,
    meta: { ...meta, endpoint },
    postedAt: new Date().toISOString(),
    receivedAt: null,
    resultJson: null,
    status: "posting",
    taskId: null,
  };
  await writeTaskRecord(taskStore, key, record);

  const postback = {
    postback_url: `${client.postbackUrl}?id=$id&token=${token}`,
    ...(definition.postbackData
      ? { postback_data: definition.postbackData }
      : {}),
  };
  const task = await send(client, definition.paths.taskPost, {
    ...definition.body(input),
    ...postback,
  });
  const costUsdMicros = recordCost(client, endpoint, "queued", task.cost);
  if (task.status_code !== DATAFORSEO_TASK_CREATED) {
    await writeTaskRecord(taskStore, key, {
      ...record,
      costUsdMicros,
      status: "error",
      taskId: task.id,
    });
    throw new DataForSeoError(task.status_message ?? `${endpoint} not queued`, {
      costUsdMicros,
      statusCode: task.status_code,
    });
  }
  const latest = (await readTaskRecordByKey(taskStore, key)) ?? record;
  if (latest.status === "posting") {
    await writeTaskRecord(taskStore, key, {
      ...latest,
      costUsdMicros,
      status: "posted",
      taskId: task.id,
    });
  }
  return { costUsdMicros, taskId: task.id, token };
};

const decodePostbackBody = async (body: ArrayBuffer): Promise<unknown> => {
  const bytes = new Uint8Array(body);
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = isGzip
    ? await new Response(
        new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"))
      ).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text);
};

export type PostbackOutcome =
  | { ok: true; record: QueuedTaskRecord; status: 200 }
  | { error: string; ok: false; status: 400 | 401 };

export interface ReceivePostbackInput {
  body: ArrayBuffer;
  /** Runs after the result is stored, e.g. publish to the period cache. */
  onComplete?: (record: QueuedTaskRecord, result: unknown) => Promise<void>;
  store?: TaskStore;
  taskId: string | null;
  token: string | null;
}

export const receiveDataForSeoPostback = async (
  input: ReceivePostbackInput
): Promise<PostbackOutcome> => {
  if (!input.token) {
    return { error: "Unauthorized", ok: false, status: 401 };
  }
  const store = input.store ?? (await defaultTaskStore());
  const key = await taskKey(input.token);
  const record = await readTaskRecordByKey(store, key);
  if (!record) {
    return { error: "Unauthorized", ok: false, status: 401 };
  }
  if (record.status === "complete" || record.status === "error") {
    return { ok: true, record, status: 200 };
  }

  let task: DataForSeoTask;
  try {
    task = parseDataForSeoEnvelope(await decodePostbackBody(input.body));
  } catch {
    return { error: "Invalid postback body", ok: false, status: 400 };
  }
  const expectedTaskId = record.taskId ?? input.taskId;
  if (expectedTaskId && task.id !== expectedTaskId) {
    return { error: "Task mismatch", ok: false, status: 400 };
  }

  const receivedAt = new Date().toISOString();
  if (task.status_code !== DATAFORSEO_OK) {
    const failed: QueuedTaskRecord = {
      ...record,
      receivedAt,
      status: "error",
      taskId: task.id,
    };
    await writeTaskRecord(store, key, failed);
    return { ok: true, record: failed, status: 200 };
  }

  let result: unknown;
  try {
    result = parseEndpointResult(record.meta.endpoint, task);
  } catch {
    return { error: "Unexpected result shape", ok: false, status: 400 };
  }
  const complete: QueuedTaskRecord = {
    ...record,
    receivedAt,
    resultJson: JSON.stringify(result),
    status: "complete",
    taskId: task.id,
  };
  await writeTaskRecord(store, key, complete);
  await input.onComplete?.(complete, result);
  return { ok: true, record: complete, status: 200 };
};

/** DataForSEO writes `yyyy-mm-dd hh:mm:ss +00:00`. */
export const parseDataForSeoTimestamp = (
  value: string | null | undefined
): string | null => {
  if (!value) {
    return null;
  }
  const groups = TIMESTAMP_PATTERN.exec(value.trim())?.groups;
  const iso = groups ? `${groups.date}T${groups.time}${groups.zone}` : value;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

const latestTimestamp = (values: (string | null)[]): string | null => {
  let latest: string | null = null;
  for (const value of values) {
    if (value && (!latest || value > latest)) {
      latest = value;
    }
  }
  return latest;
};

const countSince = (values: (string | null)[], since: number): number =>
  values.filter((value) => value !== null && Date.parse(value) >= since).length;

const wholeCount = (value: number | null | undefined): number | null =>
  value === null || value === undefined ? null : Math.max(0, Math.round(value));

const domainMatches = (
  candidate: string | null | undefined,
  domain: string
): boolean => {
  if (!candidate) {
    return false;
  }
  const bare = bareDomain(candidate);
  return bare === domain || bare.endsWith(`.${domain}`);
};

export const mapsPlaceSchema = z.object({
  category: z.string().nullable(),
  cid: z.string().nullable(),
  domain: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  photoCount: z.number().int().nonnegative().nullable(),
  placeId: z.string().nullable(),
  rank: z.number().int().positive(),
  rating: z.number().nullable(),
  reviewCount: z.number().int().nonnegative().nullable(),
  title: z.string(),
});
export type MapsPlace = z.infer<typeof mapsPlaceSchema>;

/** Business-independent, so one grid cell is shared through the period cache. */
export const mapsPlacesSchema = z.object({
  places: z.array(mapsPlaceSchema).max(MAPS_PLACES_KEPT),
});
export type MapsPlaces = z.infer<typeof mapsPlacesSchema>;

export const mapsPlacesFromResult = (
  result: DataForSeoResult<"maps"> | null
): MapsPlaces => {
  const places: MapsPlace[] = [];
  for (const raw of result?.items ?? []) {
    const item = mapsItemSchema.safeParse(raw);
    if (!item.success || !item.data.title) {
      continue;
    }
    places.push({
      category: item.data.category ?? null,
      cid: item.data.cid ?? null,
      domain: item.data.domain ?? null,
      latitude: item.data.latitude ?? null,
      longitude: item.data.longitude ?? null,
      photoCount: wholeCount(item.data.total_photos),
      placeId: item.data.place_id ?? null,
      rank: Math.max(1, Math.round(item.data.rank_group ?? places.length + 1)),
      rating: item.data.rating?.value ?? null,
      reviewCount: wholeCount(item.data.rating?.votes_count),
      title: item.data.title,
    });
  }
  return mapsPlacesSchema.parse({ places: places.slice(0, MAPS_PLACES_KEPT) });
};

const isSamePlace = (place: MapsPlace, target: PlaceTarget): boolean =>
  Boolean(
    (target.placeId && place.placeId === target.placeId) ||
    (target.cid && place.cid === target.cid)
  );

/** One `rank_grid` cell for this business from shared Maps places. */
export const rankGridCell = (input: {
  index: number;
  places: MapsPlaces;
  point: Coordinates;
  self: PlaceTarget;
}) => ({
  index: input.index,
  latitude: input.point.latitude,
  longitude: input.point.longitude,
  rank:
    input.places.places.find((place) => isSamePlace(place, input.self))?.rank ??
    null,
  top: input.places.places.slice(0, GRID_PLACES_PER_CELL).map((place) => ({
    cid: place.cid,
    placeId: place.placeId,
    rank: place.rank,
    rating: place.rating,
    reviewCount: place.reviewCount,
    title: place.title,
  })),
});

export const organicSnapshotSchema = z.object({
  aiOverview: z.object({
    citations: z
      .array(
        z.object({
          domain: z.string().nullable(),
          source: z.string().nullable(),
          title: z.string().nullable(),
          url: z.string().nullable(),
        })
      )
      .max(AI_CITATIONS_KEPT),
    present: z.boolean(),
  }),
  results: z
    .array(
      z.object({
        domain: z.string().nullable(),
        position: z.number().int().positive(),
        title: z.string().nullable(),
        url: z.string().nullable(),
      })
    )
    .max(ORGANIC_RESULTS_KEPT),
});
export type OrganicSnapshot = z.infer<typeof organicSnapshotSchema>;

const collectReferences = (
  value: unknown,
  found: z.infer<typeof aiReferenceSchema>[]
): void => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectReferences(entry, found);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "references" && Array.isArray(child)) {
      for (const reference of child) {
        const parsed = aiReferenceSchema.safeParse(reference);
        if (parsed.success) {
          found.push(parsed.data);
        }
      }
    } else {
      collectReferences(child, found);
    }
  }
};

const uniqueCitations = (
  references: z.infer<typeof aiReferenceSchema>[]
): OrganicSnapshot["aiOverview"]["citations"] => {
  const seen = new Set<string>();
  const citations: OrganicSnapshot["aiOverview"]["citations"] = [];
  for (const reference of references) {
    const id = reference.url ?? reference.domain ?? reference.title ?? "";
    if (seen.has(id) || citations.length >= AI_CITATIONS_KEPT) {
      continue;
    }
    seen.add(id);
    citations.push({
      domain: reference.domain ?? null,
      source: reference.source ?? null,
      title: reference.title ?? null,
      url: reference.url ?? null,
    });
  }
  return citations;
};

/** Business-independent organic results plus every AI Overview citation, de-duplicated by URL. */
export const organicSnapshotFromResult = (
  result: DataForSeoResult<"organic"> | null
): OrganicSnapshot => {
  const results: OrganicSnapshot["results"] = [];
  const references: z.infer<typeof aiReferenceSchema>[] = [];
  let present = false;
  for (const raw of result?.items ?? []) {
    const typed = typedItemSchema.safeParse(raw);
    if (!typed.success) {
      continue;
    }
    if (typed.data.type === "ai_overview") {
      present = true;
      collectReferences(raw, references);
      continue;
    }
    const organic = organicItemSchema.safeParse(raw);
    if (organic.success && results.length < ORGANIC_RESULTS_KEPT) {
      results.push({
        domain: organic.data.domain ?? null,
        position: Math.max(1, Math.round(organic.data.rank_group)),
        title: organic.data.title ?? null,
        url: organic.data.url ?? null,
      });
    }
  }
  return organicSnapshotSchema.parse({
    aiOverview: { citations: uniqueCitations(references), present },
    results,
  });
};

export const organicPositionFor = (
  snapshot: OrganicSnapshot,
  domain: string | null
): number | null => {
  if (!domain) {
    return null;
  }
  return (
    snapshot.results.find(
      (result) =>
        domainMatches(result.domain, domain) ||
        domainMatches(result.url, domain)
    )?.position ?? null
  );
};

/** "AI mention" means the AI Overview for a saved phrase cited this website. */
export const aiMentionFor = (
  snapshot: OrganicSnapshot,
  domain: string | null
): { citedUrl: string | null; status: AiOverviewStatus } => {
  if (!snapshot.aiOverview.present) {
    return { citedUrl: null, status: "none" };
  }
  const cited = domain
    ? snapshot.aiOverview.citations.find(
        (citation) =>
          domainMatches(citation.domain, domain) ||
          domainMatches(citation.url, domain)
      )
    : undefined;
  return cited
    ? { citedUrl: cited.url, status: "cited" }
    : { citedUrl: null, status: "not_cited" };
};

export const keywordRowSchema = z.object({
  cpc: z.number().nonnegative().nullable(),
  intent: z.string().nullable(),
  keyword: z.string(),
  keywordDifficulty: z.number().min(0).max(100).nullable(),
  searchVolume: z.number().int().nonnegative().nullable(),
});
export type KeywordRow = z.infer<typeof keywordRowSchema>;

export const keywordRowsSchema = z.object({
  keywords: z.array(keywordRowSchema),
});
export type KeywordRows = z.infer<typeof keywordRowsSchema>;

export const keywordRowsFromResult = (
  result: DataForSeoResult<"keywordOverview"> | null
): KeywordRows =>
  keywordRowsSchema.parse({
    keywords: (result?.items ?? []).map((item) => ({
      cpc: item.keyword_info?.cpc ?? null,
      intent: item.search_intent_info?.main_intent ?? null,
      keyword: item.keyword,
      keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
      searchVolume: wholeCount(item.keyword_info?.search_volume),
    })),
  });

/** Period-cache value for an endpoint whose result does not depend on the business. */
export const cacheJsonFromResult = (
  endpoint: DataForSeoEndpoint,
  result: unknown
): string | null => {
  if (endpoint === "maps") {
    return JSON.stringify(
      mapsPlacesFromResult(mapsResultSchema.nullable().parse(result))
    );
  }
  if (endpoint === "organic") {
    return JSON.stringify(
      organicSnapshotFromResult(organicResultSchema.nullable().parse(result))
    );
  }
  if (endpoint === "keywordOverview") {
    return JSON.stringify(
      keywordRowsFromResult(
        keywordOverviewResultSchema.nullable().parse(result)
      )
    );
  }
  return null;
};

export const reviewSampleFromResult = (
  result: DataForSeoResult<"reviews"> | null,
  context: { isSelf: boolean; now: Date; placeId: string }
): ReviewSamplePayload => {
  const items = result?.items ?? [];
  const timestamps = items.map((item) =>
    parseDataForSeoTimestamp(item.timestamp)
  );
  const ratings = items
    .map((item) => item.rating?.value)
    .filter((value) => typeof value === "number");
  const replied = items.filter((item) => item.owner_answer?.trim()).length;
  return {
    averageSampleRating:
      ratings.length > 0
        ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
        : null,
    checkedAt: context.now.toISOString(),
    isSelf: context.isSelf,
    latestReviewAt: latestTimestamp(timestamps),
    ownerReplyRate: items.length > 0 ? replied / items.length : null,
    placeId: context.placeId,
    reviewsLast90Days: countSince(
      timestamps,
      context.now.getTime() - RECENT_WINDOW_MS
    ),
    sampleSize: items.length,
  };
};

export const postsQaFromResults = (input: {
  now: Date;
  posts: DataForSeoResult<"posts"> | null;
  questions: DataForSeoResult<"questions"> | null;
}): GbpPostsQaPayload => {
  const posts = (input.posts?.items ?? []).filter(
    (item) => !item.type || item.type === "google_business_post"
  );
  const postTimes = posts.map((item) =>
    parseDataForSeoTimestamp(item.timestamp)
  );
  const answered = input.questions?.items ?? [];
  const unanswered = input.questions?.items_without_answers ?? [];
  const questionTimes = [...answered, ...unanswered].map((item) =>
    parseDataForSeoTimestamp(item.timestamp)
  );
  return {
    checkedAt: input.now.toISOString(),
    latestPostAt: latestTimestamp(postTimes),
    latestQuestionAt: latestTimestamp(questionTimes),
    postsCount: posts.length,
    postsLast90Days: countSince(
      postTimes,
      input.now.getTime() - RECENT_WINDOW_MS
    ),
    questionsCount: answered.length + unanswered.length,
    unansweredCount: unanswered.length,
  };
};

export const domainOverviewFromResult = (
  result: DataForSeoResult<"domainRankOverview"> | null,
  context: { domain: string; now: Date }
): DomainOverviewPayload => {
  const organic = result?.items?.[0]?.metrics?.organic;
  const topPositions = [organic?.pos_1, organic?.pos_2_3, organic?.pos_4_10];
  const hasTop10 = topPositions.some((value) => typeof value === "number");
  return {
    checkedAt: context.now.toISOString(),
    domain: context.domain,
    estimatedTraffic: organic?.etv ?? null,
    locationCode: SEO_LOCATION_CODE_AU,
    rankedKeywords: wholeCount(organic?.count),
    top10Keywords: hasTop10
      ? wholeCount(
          topPositions.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        )
      : null,
  };
};

export const backlinksFromResults = (input: {
  domain: string;
  now: Date;
  referringDomains: DataForSeoResult<"referringDomains"> | null;
  summary: DataForSeoResult<"backlinksSummary"> | null;
}): BacklinksPayload => ({
  backlinks: wholeCount(input.summary?.backlinks),
  checkedAt: input.now.toISOString(),
  domain: input.domain,
  rank: input.summary?.rank ?? null,
  referringDomains: wholeCount(input.summary?.referring_domains),
  topReferringDomains: (input.referringDomains?.items ?? [])
    .filter((item) => Boolean(item.domain))
    .slice(0, REFERRING_DOMAINS_KEPT)
    .map((item) => ({
      backlinks: wholeCount(item.backlinks),
      domain: item.domain ?? "",
      rank: item.rank ?? null,
    })),
});

/**
 * Each intersection row is one referring domain; its numbered entries say which
 * competitor (`targets` key, 1-based) it links to.
 */
export const linkGapFromResult = (
  result: DataForSeoResult<"domainIntersection"> | null,
  context: { competitorDomains: string[]; domain: string; now: Date }
): LinkGapPayload => {
  const domains: LinkGapPayload["domains"] = [];
  for (const item of result?.items ?? []) {
    const entries = Object.entries(item.domain_intersection ?? {});
    const linked = entries.filter(([, entry]) => entry?.target);
    const [first] = linked;
    const referring = first?.[1]?.target;
    if (!referring) {
      continue;
    }
    domains.push({
      domain: bareDomain(referring),
      linksTo: linked
        .map(([position]) => context.competitorDomains[Number(position) - 1])
        .filter((value) => typeof value === "string"),
      rank: Math.max(...linked.map(([, entry]) => entry?.rank ?? 0)),
    });
  }
  return {
    checkedAt: context.now.toISOString(),
    competitorDomains: context.competitorDomains,
    domain: context.domain,
    domains: domains.slice(0, LINK_GAP_DOMAINS_KEPT),
  };
};
