import {
  businessSnapshotSchema,
  checksForCategory as engineChecksForCategory,
  fetchGooglePlace,
  isHttpUrl,
  locationPartsFromPlace,
  runChecks,
  searchGooglePlacesNear,
  searchNearbyPlaces,
  specificPrimaryType,
} from "@listwell/audit-engine";
import type {
  AuditEngineEnv,
  BusinessSnapshot,
  CheckResult,
  FetchWebsiteOptions,
  GooglePlace,
} from "@listwell/audit-engine";
import { z } from "zod";

import {
  getAuditEngineEnv,
  getCloudflareEnv,
  getExecutionContext,
  getFetchWebsiteOptions,
} from "./audit-env";
import {
  getCategoryIdFromGooglePlaceTypes,
  primaryGooglePlaceTypeLabel,
} from "./category";
import type { DiscoveredProfile } from "./channel";
import { scorePercent } from "./chat-onboarding";
import {
  addUniqueProfile,
  profilesFromWebsite,
  socialProfiles,
} from "./discover";
import { mapProfilesToBusinessData } from "./profiles";
import { runInSeries } from "./run-in-series";
import { SCAN_REUSE_WINDOW_MS } from "./scan-freshness";
import type { Business } from "./schema";

export const PEER_LIMIT = 4;
export const NEARBY_RADIUS_METERS = 5000;
export const WIDENED_RADIUS_METERS = 15_000;
const NEARBY_RESULT_COUNT = 10;
const PEER_JOB_TTL_SECONDS = 60 * 60 * 24;
const PEER_RUNNING_WINDOW_MS = 30 * 60 * 1000;
const PLACE_ID_PREFIX = /^places\//u;

export const PEER_ORDER_CAPTION =
  "Peers are ordered by how Google ranks similar places nearby. That is local prominence, not a keyword ranking.";

const peerCheckSchema = z.object({
  label: z.string().optional(),
  value: z.boolean().nullable(),
});

export const peerColumnSchema = z.object({
  checks: z.record(z.string(), peerCheckSchema),
  fail: z.number(),
  name: z.string(),
  pass: z.number(),
  placeId: z.string(),
  score: z.number(),
  skipped: z.number(),
});
export type PeerColumn = z.infer<typeof peerColumnSchema>;

export const peerAuditReasonSchema = z.enum([
  "no_place",
  "no_api_key",
  "no_type",
  "no_location",
  "no_peers",
]);
export type PeerAuditReason = z.infer<typeof peerAuditReasonSchema>;

export const peerAuditJobSchema = z.object({
  businessId: z.string(),
  createdAt: z.number(),
  error: z.string().optional(),
  id: z.string(),
  peers: z.array(peerColumnSchema),
  placeTypeLabel: z.string().optional(),
  primaryType: z.string().optional(),
  radiusMeters: z.number().optional(),
  reason: peerAuditReasonSchema.optional(),
  source: z.enum(["nearby", "text"]).optional(),
  status: z.enum(["queued", "running", "complete", "error"]),
  updatedAt: z.number(),
});
export type PeerAuditJob = z.infer<typeof peerAuditJobSchema>;

export interface PeerSelection {
  peers: GooglePlace[];
  radiusMeters: number;
  source: "nearby" | "text";
}

export interface PeerSearchResult extends PeerSelection {
  placeTypeLabel: string | null;
  primaryType: string | null;
  unavailable: "no_location" | "no_type" | null;
}

export interface PeerCheckRow {
  id: string;
  peerValues: (boolean | null)[];
  subjectValue: boolean | null;
}

export interface PeerScore {
  fail: number;
  pass: number;
  score: number;
  skipped: number;
}

const canonicalPlaceId = (id: string): string => id.replace(/^places\//u, "");

const placeDisplayName = (place: GooglePlace): string => {
  const name = place.displayName?.text?.trim() ?? "";
  return name.length > 0 ? name : "Nearby business";
};

const placeTypeList = (place: GooglePlace): string[] => {
  const types: string[] = [];
  if (place.primaryType) {
    types.push(place.primaryType);
  }
  for (const type of place.types ?? []) {
    types.push(type);
  }
  return types;
};

const placeTypeLabelFor = (place: GooglePlace, primaryType: string): string => {
  const display = place.primaryTypeDisplayName?.text?.trim() ?? "";
  if (display.length > 0) {
    return display;
  }
  return primaryGooglePlaceTypeLabel([primaryType]) ?? primaryType;
};

const placeMatchesType = (place: GooglePlace, primaryType: string): boolean => {
  if (place.primaryType) {
    return place.primaryType === primaryType;
  }
  return (place.types ?? []).includes(primaryType);
};

const emptySearch = (
  unavailable: PeerSearchResult["unavailable"]
): PeerSearchResult => ({
  peers: [],
  placeTypeLabel: null,
  primaryType: null,
  radiusMeters: NEARBY_RADIUS_METERS,
  source: "nearby",
  unavailable,
});

const filterPeerPlaces = (
  places: readonly GooglePlace[],
  selfPlaceId: string,
  primaryType: string
): GooglePlace[] => {
  const self = canonicalPlaceId(selfPlaceId);
  const selected: GooglePlace[] = [];
  for (const place of places) {
    if (!place.id || canonicalPlaceId(place.id) === self) {
      continue;
    }
    if (!placeMatchesType(place, primaryType)) {
      continue;
    }
    selected.push(place);
    if (selected.length >= PEER_LIMIT) {
      break;
    }
  }
  return selected;
};

export const choosePeerPlaces = (input: {
  closePlaces: readonly GooglePlace[];
  farPlaces: readonly GooglePlace[];
  primaryType: string;
  selfPlaceId: string;
  textPlaces: readonly GooglePlace[];
}): PeerSelection => {
  const close = filterPeerPlaces(
    input.closePlaces,
    input.selfPlaceId,
    input.primaryType
  );
  if (close.length >= 2) {
    return {
      peers: close,
      radiusMeters: NEARBY_RADIUS_METERS,
      source: "nearby",
    };
  }

  const far = filterPeerPlaces(
    input.farPlaces,
    input.selfPlaceId,
    input.primaryType
  );
  if (far.length > 0) {
    return {
      peers: far,
      radiusMeters: WIDENED_RADIUS_METERS,
      source: "nearby",
    };
  }

  if (close.length > 0) {
    return {
      peers: close,
      radiusMeters: NEARBY_RADIUS_METERS,
      source: "nearby",
    };
  }

  return {
    peers: filterPeerPlaces(
      input.textPlaces,
      input.selfPlaceId,
      input.primaryType
    ),
    radiusMeters: WIDENED_RADIUS_METERS,
    source: "text",
  };
};

export const findPeerPlaces = async (input: {
  fetchImpl?: typeof fetch;
  googleApiKey: string;
  place: GooglePlace;
  selfPlaceId: string;
}): Promise<PeerSearchResult> => {
  const primaryType = specificPrimaryType(input.place.primaryType);
  if (!primaryType) {
    return emptySearch("no_type");
  }
  const { location } = input.place;
  if (!location) {
    return emptySearch("no_location");
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const searchAt = (radiusMeters: number) =>
    searchNearbyPlaces(
      {
        googleApiKey: input.googleApiKey,
        includedTypes: [primaryType],
        latitude: location.latitude,
        longitude: location.longitude,
        maxResultCount: NEARBY_RESULT_COUNT,
        radiusMeters,
      },
      fetchImpl
    );

  const closePlaces = await searchAt(NEARBY_RADIUS_METERS);
  const close = filterPeerPlaces(closePlaces, input.selfPlaceId, primaryType);
  const farPlaces =
    close.length < 2 ? await searchAt(WIDENED_RADIUS_METERS) : [];
  let selection = choosePeerPlaces({
    closePlaces,
    farPlaces,
    primaryType,
    selfPlaceId: input.selfPlaceId,
    textPlaces: [],
  });

  if (selection.peers.length === 0) {
    const parts = locationPartsFromPlace(input.place);
    const near = parts.suburb ?? parts.city ?? "";
    const label = placeTypeLabelFor(input.place, primaryType);
    const query = near.length > 0 ? `${label} near ${near}` : label;
    const textPlaces = await searchGooglePlacesNear(
      query,
      input.googleApiKey,
      location,
      WIDENED_RADIUS_METERS,
      fetchImpl
    );
    selection = choosePeerPlaces({
      closePlaces,
      farPlaces,
      primaryType,
      selfPlaceId: input.selfPlaceId,
      textPlaces,
    });
  }

  return {
    ...selection,
    placeTypeLabel: placeTypeLabelFor(input.place, primaryType),
    primaryType,
    unavailable: null,
  };
};

export const scoreFromCheckValues = (
  values: readonly (boolean | null)[]
): PeerScore => {
  let pass = 0;
  let fail = 0;
  let skipped = 0;
  for (const value of values) {
    if (value === true) {
      pass += 1;
    } else if (value === false) {
      fail += 1;
    } else {
      skipped += 1;
    }
  }
  return {
    fail,
    pass,
    score: scorePercent({ fail, pass }),
    skipped,
  };
};

export const orderPeerCheckRows = <T extends PeerCheckRow>(
  rows: readonly T[]
): T[] => {
  const gap: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const behind =
      row.subjectValue === false &&
      row.peerValues.some((value) => value === true);
    if (behind) {
      gap.push(row);
    } else {
      rest.push(row);
    }
  }
  return [...gap, ...rest];
};

export const snapshotForPeer = (
  place: GooglePlace,
  extraProfiles: readonly DiscoveredProfile[] = []
): BusinessSnapshot => {
  const name = placeDisplayName(place);
  const category = getCategoryIdFromGooglePlaceTypes(placeTypeList(place));
  const profiles: DiscoveredProfile[] = [];
  if (place.id) {
    profiles.push({
      googlePlaceId: place.id,
      subtitle: place.formattedAddress,
      title: name,
      type: "google-maps",
    });
  }
  if (place.websiteUri) {
    profiles.push({ title: place.websiteUri, type: "website" });
  }
  for (const profile of extraProfiles) {
    addUniqueProfile(profiles, profile);
  }
  const data = mapProfilesToBusinessData(name, category, profiles);
  return businessSnapshotSchema.parse({
    ...data,
    id: place.id ?? name,
  });
};

export const googlePlaceIdFromLocations = (
  locations: readonly { googlePlaceId?: string | null }[]
): string | null => {
  for (const location of locations) {
    const id = location.googlePlaceId?.trim() ?? "";
    if (id.length > 0 && !isHttpUrl(id)) {
      return id;
    }
  }
  return null;
};

export const peerAuditCaption = (job: PeerAuditJob): string => {
  if (job.source === "text") {
    return "Peers came from a search for the same place type near this business. That is local prominence, not a keyword ranking.";
  }
  return PEER_ORDER_CAPTION;
};

export const peerAuditHeading = (job: PeerAuditJob): string => {
  if (!job.placeTypeLabel || job.radiusMeters === undefined) {
    return "Nearby businesses";
  }
  const kilometres = job.radiusMeters / 1000;
  return `${job.placeTypeLabel} within ${kilometres} km`;
};

export const peerAuditMessage = (job: PeerAuditJob): string | null => {
  switch (job.reason) {
    case "no_place": {
      return "This audit has no Google place, so nearby businesses cannot be compared.";
    }
    case "no_api_key": {
      return "Google Places is not configured, so nearby businesses cannot be compared.";
    }
    case "no_type": {
      return "Google did not return a specific place type, so nearby businesses cannot be compared.";
    }
    case "no_location": {
      return "Google did not return a map location, so nearby businesses cannot be compared.";
    }
    case "no_peers": {
      return "No other businesses with this place type were found nearby.";
    }
    default: {
      if (job.status === "error") {
        return "Nearby comparison could not finish.";
      }
      return null;
    }
  }
};

const peerCacheKey = (businessId: string, placeId: string | null): string =>
  `${businessId}:${placeId ?? "none"}`;

/** Same place shares one peer audit across business ids. */
export const sharedPeerCacheKey = (placeId: string): string =>
  `place:${placeId.trim().replace(PLACE_ID_PREFIX, "")}`;

export const isPeerJobReusable = (
  job: Pick<PeerAuditJob, "createdAt" | "status" | "updatedAt">,
  now: number
): boolean => {
  if (job.status === "error") {
    return false;
  }
  if (job.status === "complete") {
    const age = now - job.updatedAt;
    return age >= 0 && age < SCAN_REUSE_WINDOW_MS;
  }
  const age = now - job.createdAt;
  return age >= 0 && age < PEER_RUNNING_WINDOW_MS;
};

const peerCacheKeys = (
  businessId: string,
  placeId: string | null
): string[] => {
  const keys = [peerCacheKey(businessId, placeId)];
  if (placeId) {
    keys.unshift(sharedPeerCacheKey(placeId));
  }
  return keys;
};

const peerJobStorageKey = (id: string): string => `peer-job:${id}`;

const peerLatestStorageKey = (cacheKey: string): string =>
  `peer-latest:${cacheKey}`;

interface PeerJobMemory {
  jobs: Map<string, PeerAuditJob>;
  latest: Map<string, string>;
}

declare global {
  var listwellPeerJobs: PeerJobMemory | undefined;
}

const peerMemory: PeerJobMemory = globalThis.listwellPeerJobs ?? {
  jobs: new Map<string, PeerAuditJob>(),
  latest: new Map<string, string>(),
};
globalThis.listwellPeerJobs = peerMemory;

const blankJob = (businessId: string): PeerAuditJob =>
  peerAuditJobSchema.parse({
    businessId,
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    peers: [],
    status: "queued",
    updatedAt: Date.now(),
  });

const writePeerJob = async (
  job: PeerAuditJob,
  cacheKeys: readonly string[]
): Promise<PeerAuditJob> => {
  const parsed = peerAuditJobSchema.parse(job);
  peerMemory.jobs.set(parsed.id, parsed);
  for (const cacheKey of cacheKeys) {
    peerMemory.latest.set(cacheKey, parsed.id);
  }
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return parsed;
  }
  await kv.put(peerJobStorageKey(parsed.id), JSON.stringify(parsed), {
    expirationTtl: PEER_JOB_TTL_SECONDS,
  });
  await Promise.all(
    cacheKeys.map((cacheKey) =>
      kv.put(peerLatestStorageKey(cacheKey), parsed.id, {
        expirationTtl: PEER_JOB_TTL_SECONDS,
      })
    )
  );
  return parsed;
};

export const readPeerJob = async (id: string): Promise<PeerAuditJob | null> => {
  const memoryJob = peerMemory.jobs.get(id);
  if (memoryJob) {
    return memoryJob;
  }
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return null;
  }
  const raw = await env.AUDIT_KV.get(peerJobStorageKey(id), "json");
  const parsed = peerAuditJobSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  peerMemory.jobs.set(parsed.data.id, parsed.data);
  return parsed.data;
};

const readJobForCacheKey = async (
  cacheKey: string
): Promise<PeerAuditJob | null> => {
  const memoryId = peerMemory.latest.get(cacheKey);
  if (memoryId) {
    return readPeerJob(memoryId);
  }
  const env = await getCloudflareEnv();
  if (!env?.AUDIT_KV) {
    return null;
  }
  const jobId = await env.AUDIT_KV.get(peerLatestStorageKey(cacheKey));
  if (typeof jobId !== "string" || jobId.length === 0) {
    return null;
  }
  return readPeerJob(jobId);
};

export const readLatestPeerJob = async (
  businessId: string,
  placeId: string | null
): Promise<PeerAuditJob | null> => {
  const now = Date.now();
  const jobs = await Promise.all(
    peerCacheKeys(businessId, placeId).map((cacheKey) =>
      readJobForCacheKey(cacheKey)
    )
  );
  return (
    jobs.find((job) => job !== null && isPeerJobReusable(job, now)) ?? null
  );
};

const columnFromResults = (
  place: GooglePlace,
  results: Partial<Record<string, CheckResult | undefined>>
): PeerColumn => {
  const checks: PeerColumn["checks"] = {};
  const values: (boolean | null)[] = [];
  for (const [id, result] of Object.entries(results)) {
    if (!result) {
      continue;
    }
    checks[id] = result.label
      ? { label: result.label, value: result.value }
      : { value: result.value };
    values.push(result.value);
  }
  const scored = scoreFromCheckValues(values);
  return peerColumnSchema.parse({
    checks,
    fail: scored.fail,
    name: placeDisplayName(place),
    pass: scored.pass,
    placeId: place.id ?? placeDisplayName(place),
    score: scored.score,
    skipped: scored.skipped,
  });
};

const auditOnePeer = async (
  place: GooglePlace,
  env: AuditEngineEnv,
  options: FetchWebsiteOptions
): Promise<PeerColumn> => {
  const name = placeDisplayName(place);
  const category = getCategoryIdFromGooglePlaceTypes(placeTypeList(place));
  const extra: DiscoveredProfile[] = [];
  if (place.websiteUri && isHttpUrl(place.websiteUri)) {
    try {
      const fromSite = await profilesFromWebsite(place.websiteUri, options);
      for (const profile of fromSite) {
        extra.push(profile);
      }
    } catch {
      // Homepage fetch is best-effort. The Places website URL still runs.
    }
  }
  const parts = locationPartsFromPlace(place);
  const near = parts.suburb ?? parts.city ?? undefined;
  const social = await socialProfiles(name, category, env, near);
  for (const profile of social) {
    extra.push(profile);
  }
  const snapshot = snapshotForPeer(place, extra);
  const checkIds = engineChecksForCategory(category).map(
    (definition) => definition.id
  );
  const results = await runChecks(snapshot, checkIds, {
    ...options,
    env,
    includeQueued: true,
  });
  return columnFromResults(place, results);
};

const saveJob = async (
  jobId: string,
  cacheKeys: readonly string[],
  patch: Partial<PeerAuditJob>
): Promise<PeerAuditJob | null> => {
  const current = await readPeerJob(jobId);
  if (!current) {
    return null;
  }
  return writePeerJob(
    peerAuditJobSchema.parse({
      ...current,
      ...patch,
      businessId: current.businessId,
      id: current.id,
      updatedAt: Date.now(),
    }),
    cacheKeys
  );
};

const auditSelectedPeers = async (
  jobId: string,
  cacheKeys: readonly string[],
  peers: readonly GooglePlace[],
  env: AuditEngineEnv,
  options: FetchWebsiteOptions
): Promise<boolean> => {
  let failed = false;
  await runInSeries(peers, async (place) => {
    try {
      const column = await auditOnePeer(place, env, options);
      const current = await readPeerJob(jobId);
      if (!current) {
        return column;
      }
      await writePeerJob(
        peerAuditJobSchema.parse({
          ...current,
          peers: [...current.peers, column],
          status: "running",
          updatedAt: Date.now(),
        }),
        cacheKeys
      );
      return column;
    } catch {
      failed = true;
      return null;
    }
  });
  return failed;
};

const executePeerAudit = async (
  jobId: string,
  cacheKeys: readonly string[],
  placeId: string | null
): Promise<void> => {
  try {
    if (!placeId) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_place",
        status: "complete",
      });
      return;
    }

    await saveJob(jobId, cacheKeys, { status: "running" });

    const [env, options] = await Promise.all([
      getAuditEngineEnv(),
      getFetchWebsiteOptions(),
    ]);
    if (!env.googleApiKey) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_api_key",
        status: "complete",
      });
      return;
    }

    const place = await fetchGooglePlace(
      placeId,
      env.googleApiKey,
      options.fetchImpl
    );
    if (!place) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_place",
        status: "complete",
      });
      return;
    }

    const search = await findPeerPlaces({
      fetchImpl: options.fetchImpl,
      googleApiKey: env.googleApiKey,
      place,
      selfPlaceId: place.id ?? placeId,
    });
    await saveJob(jobId, cacheKeys, {
      placeTypeLabel: search.placeTypeLabel ?? undefined,
      primaryType: search.primaryType ?? undefined,
      radiusMeters: search.radiusMeters,
      source: search.source,
      status: "running",
    });

    if (search.unavailable) {
      await saveJob(jobId, cacheKeys, {
        reason: search.unavailable,
        status: "complete",
      });
      return;
    }
    if (search.peers.length === 0) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_peers",
        status: "complete",
      });
      return;
    }

    const failed = await auditSelectedPeers(
      jobId,
      cacheKeys,
      search.peers,
      env,
      options
    );
    const current = await readPeerJob(jobId);
    if (!current) {
      return;
    }
    if (current.peers.length === 0 && failed) {
      await saveJob(jobId, cacheKeys, {
        error: "Nearby businesses could not be audited",
        status: "error",
      });
      return;
    }
    if (current.peers.length === 0) {
      await saveJob(jobId, cacheKeys, {
        reason: "no_peers",
        status: "complete",
      });
      return;
    }
    await saveJob(jobId, cacheKeys, { status: "complete" });
  } catch (error) {
    await saveJob(jobId, cacheKeys, {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "error",
    });
  }
};

export const ensurePeerAudit = async (
  business: Business
): Promise<PeerAuditJob> => {
  const placeId = googlePlaceIdFromLocations(business.locations);
  const cacheKeys = peerCacheKeys(business.id, placeId);
  const existing = await readLatestPeerJob(business.id, placeId);
  if (existing && isPeerJobReusable(existing, Date.now())) {
    await writePeerJob(existing, cacheKeys);
    return existing;
  }

  const job = await writePeerJob(blankJob(business.id), cacheKeys);
  const run = async () => {
    await executePeerAudit(job.id, cacheKeys, placeId);
  };
  const execution = await getExecutionContext();
  if (execution) {
    execution.waitUntil(run());
    return job;
  }
  await run();
  return (await readPeerJob(job.id)) ?? job;
};
