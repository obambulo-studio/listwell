import { z } from "zod";

import type { Id } from "../convex/_generated/dataModel";
import { getCloudflareEnv } from "./audit-env";
import { runConvexRead } from "./convex-read";
import {
  api,
  convexMutation,
  convexPublicQuery,
  convexQuery,
  getConvexClient,
} from "./convex/server";
import {
  businessSchema,
  checkResultSchema,
  createBusinessRequestSchema,
  entitlementKindSchema,
  entitlementRowSchema,
  entitlementStatusSchema,
  scanRowSchema,
  scanStatusSchema,
  scanTriggerSchema,
} from "./schema";
import type {
  Business,
  CreateBusinessRequest,
  EntitlementKind,
  EntitlementRow,
  EntitlementStatus,
  ScanRow,
  ScanTrigger,
  UpdateBusinessRequest,
  UserRow,
} from "./schema";
import {
  hiddenCompetitorPlaceIdsSchema,
  pinIdFromCoordinates,
  pinnedCompetitorsSchema,
  searchPhrasesSchema,
} from "./seo-schema";
import type { PinnedCompetitor, SearchPhrase } from "./seo-schema";
import {
  coerceStoredWebsiteUrl,
  normalizeBusinessName,
  normalizeWebsiteInput,
} from "./text-normalize";
import { zNullableString } from "./zod-coerce";

export const idListQuerySchema = z.object({
  ids: z.string().optional(),
});

export const MAX_BULK_IDS = 50;
export const BUSINESS_KV_TTL_SECONDS = 7 * 24 * 60 * 60;
export const BUSINESS_KV_TTL_DAYS = 7;
const BUSINESS_MEMORY_MAX = 500;

const locationPinId = (
  location: CreateBusinessRequest["locations"][number]
): string | undefined => {
  if (location.latitude === undefined || location.longitude === undefined) {
    return undefined;
  }
  return (
    location.pinId ??
    pinIdFromCoordinates({
      latitude: location.latitude,
      longitude: location.longitude,
    })
  );
};

const mapLocations = (locations: CreateBusinessRequest["locations"]) =>
  locations.map((location) => ({
    address: location.address,
    appleMapsId: location.appleMapsId,
    googlePlaceId: location.googlePlaceId,
    latitude: location.latitude,
    longitude: location.longitude,
    name: location.name,
    pinId: locationPinId(location),
  }));

const storedBusinessKey = (id: string): string => `business:${id}`;

declare global {
  var listwellBusinesses: Map<string, Business> | undefined;
}

const businessMemory: Map<string, Business> =
  globalThis.listwellBusinesses ?? new Map<string, Business>();
globalThis.listwellBusinesses = businessMemory;

const evictBusinessMemoryIfNeeded = (): void => {
  if (businessMemory.size <= BUSINESS_MEMORY_MAX) {
    return;
  }
  const overflow = businessMemory.size - BUSINESS_MEMORY_MAX;
  const iterator = businessMemory.keys();
  for (let index = 0; index < overflow; index += 1) {
    const next = iterator.next();
    if (next.done) {
      break;
    }
    businessMemory.delete(next.value);
  }
};

const optionalUrl = (value: string | undefined): string | null =>
  value === undefined
    ? null
    : coerceStoredWebsiteUrl(normalizeWebsiteInput(value));

const storedWebsiteUrlArg = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const coerced = coerceStoredWebsiteUrl(normalizeWebsiteInput(value));
  return coerced ?? undefined;
};

export const businessFromCreateRequest = (
  input: CreateBusinessRequest
): Business => {
  const data = createBusinessRequestSchema.parse(input);
  const timestamp = new Date().toISOString();
  const id = data.id ?? crypto.randomUUID();
  return businessSchema.parse({
    category: data.category,
    categoryLabel: data.categoryLabel ?? null,
    createdAt: timestamp,
    deliverooUrl: optionalUrl(data.deliverooUrl),
    doorDashUrl: optionalUrl(data.doorDashUrl),
    facebookUsername: optionalUrl(data.facebookUsername),
    id,
    instagramUsername: optionalUrl(data.instagramUsername),
    linkedinUrl: optionalUrl(data.linkedinUrl),
    locations: data.locations.map((location, index) => ({
      address: location.address ?? null,
      appleMapsId: location.appleMapsId ?? null,
      businessId: id,
      createdAt: timestamp,
      googlePlaceId: location.googlePlaceId ?? null,
      id: index + 1,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      name: location.name ?? null,
      pinId: locationPinId(location) ?? null,
      updatedAt: timestamp,
    })),
    menulogUrl: optionalUrl(data.menulogUrl),
    name: data.name,
    tiktokUsername: optionalUrl(data.tiktokUsername),
    uberEatsUrl: optionalUrl(data.uberEatsUrl),
    updatedAt: timestamp,
    userId: null,
    websiteUrl: optionalUrl(data.websiteUrl),
    xUsername: optionalUrl(data.xUsername),
    youtubeUrl: optionalUrl(data.youtubeUrl),
  });
};

export const writeStoredBusiness = async (
  business: Business
): Promise<Business> => {
  const parsed = businessSchema.parse(business);
  businessMemory.set(parsed.id, parsed);
  evictBusinessMemoryIfNeeded();
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    await env.AUDIT_KV.put(
      storedBusinessKey(parsed.id),
      JSON.stringify(parsed),
      { expirationTtl: BUSINESS_KV_TTL_SECONDS }
    );
  }
  return parsed;
};

export const purgeStoredBusiness = async (id: string): Promise<void> => {
  businessMemory.delete(id);
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    await env.AUDIT_KV.delete(storedBusinessKey(id));
  }
};

export const readStoredBusiness = async (
  id: string
): Promise<Business | null> => {
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    const raw = await env.AUDIT_KV.get(storedBusinessKey(id), "json");
    const parsed = businessSchema.safeParse(raw);
    if (parsed.success) {
      businessMemory.set(parsed.data.id, parsed.data);
      return parsed.data;
    }
  }
  return businessMemory.get(id) ?? null;
};

export const hasAuditKv = async (): Promise<boolean> => {
  const env = await getCloudflareEnv();
  return Boolean(env?.AUDIT_KV);
};

const tryConvexQuery = async <T>(
  run: () => Promise<T>
): Promise<T | undefined> => {
  try {
    return await run();
  } catch {
    return undefined;
  }
};

export const listBusinesses = async (ids: string[]): Promise<Business[]> => {
  const capped = ids.slice(0, MAX_BULK_IDS);
  const rows = await tryConvexQuery(() =>
    convexPublicQuery(api.businesses.listByExternalIds, {
      externalIds: capped,
    })
  );
  if (rows) {
    const parsed = z.array(businessSchema).parse(rows);
    await Promise.all(parsed.map((business) => writeStoredBusiness(business)));
    return parsed;
  }
  const stored = await Promise.all(capped.map((id) => readStoredBusiness(id)));
  return stored.filter((business): business is Business => business !== null);
};

export const getBusiness = async (id: string): Promise<Business | null> => {
  const row = await tryConvexQuery(() =>
    convexPublicQuery(api.businesses.getByExternalId, {
      externalId: id,
    })
  );
  if (row) {
    return writeStoredBusiness(businessSchema.parse(row));
  }
  return readStoredBusiness(id);
};

export const createBusiness = async (
  input: CreateBusinessRequest
): Promise<Business> => {
  const data = createBusinessRequestSchema.parse(input);
  const created = await tryConvexQuery(() =>
    getConvexClient().mutation(api.businesses.create, {
      category: data.category,
      categoryLabel: data.categoryLabel ?? undefined,
      deliverooUrl: data.deliverooUrl,
      doorDashUrl: data.doorDashUrl,
      externalId: data.id,
      facebookUsername: data.facebookUsername,
      instagramUsername: data.instagramUsername,
      linkedinUrl: data.linkedinUrl,
      locations: mapLocations(data.locations),
      menulogUrl: data.menulogUrl,
      name: data.name,
      tiktokUsername: data.tiktokUsername,
      uberEatsUrl: data.uberEatsUrl,
      websiteUrl: storedWebsiteUrlArg(data.websiteUrl),
      xUsername: data.xUsername,
      youtubeUrl: data.youtubeUrl,
    })
  );
  if (created) {
    return writeStoredBusiness(businessSchema.parse(created));
  }
  return writeStoredBusiness(businessFromCreateRequest(data));
};

const locationInputsFromBusiness = (
  business: Business
): CreateBusinessRequest["locations"] =>
  business.locations.map((location) => ({
    address: location.address ?? undefined,
    appleMapsId: location.appleMapsId ?? undefined,
    googlePlaceId: location.googlePlaceId ?? undefined,
    latitude: location.latitude ?? undefined,
    longitude: location.longitude ?? undefined,
    name: location.name ?? undefined,
    pinId: location.pinId ?? undefined,
  }));

const keepUrl = (
  next: string | undefined,
  current: string | null
): string | undefined => next ?? current ?? undefined;

const mergeBusinessUpdate = (
  existing: Business,
  input: UpdateBusinessRequest
): Business => {
  const next = businessFromCreateRequest({
    category: input.category ?? existing.category,
    categoryLabel:
      input.categoryLabel === undefined
        ? existing.categoryLabel
        : input.categoryLabel,
    deliverooUrl: keepUrl(input.deliverooUrl, existing.deliverooUrl),
    doorDashUrl: keepUrl(input.doorDashUrl, existing.doorDashUrl),
    facebookUsername: keepUrl(
      input.facebookUsername,
      existing.facebookUsername
    ),
    id: existing.id,
    instagramUsername: keepUrl(
      input.instagramUsername,
      existing.instagramUsername
    ),
    linkedinUrl: keepUrl(input.linkedinUrl, existing.linkedinUrl),
    locations: input.locations ?? locationInputsFromBusiness(existing),
    menulogUrl: keepUrl(input.menulogUrl, existing.menulogUrl),
    name:
      input.name === undefined
        ? existing.name
        : normalizeBusinessName(input.name),
    tiktokUsername: keepUrl(input.tiktokUsername, existing.tiktokUsername),
    uberEatsUrl: keepUrl(input.uberEatsUrl, existing.uberEatsUrl),
    websiteUrl: keepUrl(input.websiteUrl, existing.websiteUrl),
    xUsername: keepUrl(input.xUsername, existing.xUsername),
    youtubeUrl: keepUrl(input.youtubeUrl, existing.youtubeUrl),
  });
  return {
    ...next,
    competitors: existing.competitors,
    createdAt: existing.createdAt,
    hiddenCompetitorPlaceIds: existing.hiddenCompetitorPlaceIds,
    searchPhrases: existing.searchPhrases,
    userId: existing.userId,
  };
};

export const updateBusiness = async (
  id: string,
  input: UpdateBusinessRequest
): Promise<Business> => {
  const updated = await tryConvexQuery(() =>
    convexMutation(api.businesses.update, {
      category: input.category,
      categoryLabel: input.categoryLabel,
      deliverooUrl: input.deliverooUrl,
      doorDashUrl: input.doorDashUrl,
      externalId: id,
      facebookUsername: input.facebookUsername,
      instagramUsername: input.instagramUsername,
      linkedinUrl: input.linkedinUrl,
      locations: input.locations ? mapLocations(input.locations) : undefined,
      menulogUrl: input.menulogUrl,
      name: input.name,
      tiktokUsername: input.tiktokUsername,
      uberEatsUrl: input.uberEatsUrl,
      websiteUrl: storedWebsiteUrlArg(input.websiteUrl),
      xUsername: input.xUsername,
      youtubeUrl: input.youtubeUrl,
    })
  );
  if (updated) {
    return writeStoredBusiness(businessSchema.parse(updated));
  }
  const existing = await readStoredBusiness(id);
  if (!existing) {
    throw new Error("Business not found");
  }
  return writeStoredBusiness(mergeBusinessUpdate(existing, input));
};

/** Use `reviseSearchPhrases` first so edited wording gets a new id. */
export const setBusinessSearchPhrases = async (
  businessId: string,
  phrases: SearchPhrase[]
): Promise<Business> => {
  const searchPhrases = searchPhrasesSchema.parse(phrases);
  const updated = await convexMutation(api.businesses.setSearchPhrases, {
    externalId: businessId,
    searchPhrases,
  });
  return writeStoredBusiness(businessSchema.parse(updated));
};

export const setBusinessCompetitors = async (
  businessId: string,
  input: { competitors: PinnedCompetitor[]; hiddenCompetitorPlaceIds: string[] }
): Promise<Business> => {
  const updated = await convexMutation(api.businesses.setCompetitors, {
    competitors: pinnedCompetitorsSchema.parse(input.competitors),
    externalId: businessId,
    hiddenCompetitorPlaceIds: hiddenCompetitorPlaceIdsSchema.parse(
      input.hiddenCompetitorPlaceIds
    ),
  });
  return writeStoredBusiness(businessSchema.parse(updated));
};

export const getBusinessOwnerId = async (
  businessId: string
): Promise<string | null> => {
  const ownerId = await tryConvexQuery(() =>
    convexPublicQuery(api.businesses.getOwnerId, {
      externalId: businessId,
    })
  );
  if (ownerId !== undefined) {
    return ownerId;
  }
  const stored = await readStoredBusiness(businessId);
  return stored?.userId ?? null;
};

export const claimBusinesses = (
  ids: string[],
  userId: string
): Promise<number> =>
  convexMutation(api.businesses.claimInternal, {
    externalIds: ids,
    userId,
  });

export const hasActiveEntitlement = async (
  businessId: string
): Promise<boolean> => {
  const active = await tryConvexQuery(() =>
    convexPublicQuery(api.entitlements.hasActive, {
      businessExternalId: businessId,
    })
  );
  return active ?? false;
};

export const claimPurchaseEmail = async (
  businessId: string,
  kind: EntitlementKind
): Promise<boolean> => {
  const claimed = await convexMutation(api.entitlements.claimPurchaseEmail, {
    businessExternalId: businessId,
    kind,
  });
  return z.boolean().parse(claimed);
};

export const releasePurchaseEmail = async (
  businessId: string,
  kind: EntitlementKind
): Promise<void> => {
  await convexMutation(api.entitlements.releasePurchaseEmail, {
    businessExternalId: businessId,
    kind,
  });
};

export const grantEntitlement = async (input: {
  businessId: string;
  kind: EntitlementKind;
  polarCustomerId?: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  purchaserEmail?: string;
  userId?: string;
}): Promise<EntitlementRow> => {
  const row = await convexMutation(api.entitlements.grant, {
    businessExternalId: input.businessId,
    kind: input.kind,
    polarCustomerId: input.polarCustomerId,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
    purchaserEmail: input.purchaserEmail,
    userId: input.userId,
  });
  return entitlementRowSchema.parse({
    ...row,
    kind: entitlementKindSchema.parse(row.kind),
    polarCustomerId: row.polarCustomerId ?? null,
    polarOrderId: row.polarOrderId ?? null,
    polarSubscriptionId: row.polarSubscriptionId ?? null,
    status: entitlementStatusSchema.parse(row.status),
    userId: row.userId ?? null,
  });
};

export const revokeEntitlements = async (input: {
  businessId?: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
}): Promise<void> => {
  await convexMutation(api.entitlements.revoke, {
    businessExternalId: input.businessId,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
  });
};

/** Ends a monthly subscription but keeps stored scans readable. */
export const lapseEntitlements = async (input: {
  businessId?: string;
  polarSubscriptionId?: string;
}): Promise<void> => {
  await convexMutation(api.entitlements.lapse, {
    businessExternalId: input.businessId,
    polarSubscriptionId: input.polarSubscriptionId,
  });
};

const activeOwnerValueSchema = z.object({
  kind: entitlementKindSchema.nullable(),
  monthlyCancelled: z.boolean(),
  ownerEmail: zNullableString,
  ownerUserId: zNullableString,
  polarOrderId: zNullableString,
  purchaserEmail: zNullableString,
  unlocked: z.boolean(),
});

export const parseActiveEntitlementOwnerValue = (
  value: unknown
): z.infer<typeof activeOwnerValueSchema> =>
  activeOwnerValueSchema.parse(value);

export type EntitlementOwnerSnapshot =
  | { backendAvailable: false }
  | {
      backendAvailable: true;
      unlocked: boolean;
      kind: EntitlementKind | null;
      monthlyCancelled: boolean;
      ownerEmail: string | null;
      ownerUserId: string | null;
      polarOrderId: string | null;
      purchaserEmail: string | null;
    };

export const getResearchEntitlement = async (
  businessId: string
): Promise<{
  kind: EntitlementKind;
  nextScanAt: string | null;
  status: EntitlementStatus;
} | null> => {
  const row = await tryConvexQuery(() =>
    convexQuery(api.entitlements.getReadableForBusiness, {
      businessExternalId: businessId,
    })
  );
  if (!row) {
    return null;
  }
  return z
    .object({
      kind: entitlementKindSchema,
      nextScanAt: zNullableString,
      status: entitlementStatusSchema,
    })
    .parse(row);
};

export const getActiveEntitlementOwner = async (
  businessId: string
): Promise<EntitlementOwnerSnapshot> => {
  const owner = await runConvexRead(() =>
    convexQuery(api.entitlements.getActiveOwner, {
      businessExternalId: businessId,
    })
  );
  if (owner.status === "unavailable") {
    return { backendAvailable: false };
  }
  const value = parseActiveEntitlementOwnerValue(owner.value);
  return {
    backendAvailable: true,
    kind: value.kind,
    monthlyCancelled: value.monthlyCancelled,
    ownerEmail: value.ownerEmail,
    ownerUserId: value.ownerUserId,
    polarOrderId: value.polarOrderId,
    purchaserEmail: value.purchaserEmail,
    unlocked: value.unlocked,
  };
};

export const probeConvexBusinesses = async (): Promise<"ok" | "error"> => {
  const row = await tryConvexQuery(() =>
    convexPublicQuery(api.businesses.getByExternalId, {
      externalId: "health-probe",
    })
  );
  return row === undefined ? "error" : "ok";
};

export const listDueMonthlyEntitlements = async (now: Date, limit: number) => {
  const rows = await convexQuery(api.entitlements.listDueMonthly, {
    limit,
    nowIso: now.toISOString(),
  });
  return z
    .array(
      z.object({
        businessId: z.string(),
        id: z.string(),
        nextScanAt: z.string().nullable(),
      })
    )
    .parse(
      rows.map((row) => ({
        businessId: row.businessExternalId,
        id: row.id,
        nextScanAt: row.nextScanAt,
      }))
    );
};

export const setNextScanAt = async (
  entitlementId: string,
  iso: string
): Promise<void> => {
  await convexMutation(api.entitlements.setNextScanAtInternal, {
    entitlementId: entitlementId as Id<"entitlements">,
    nextScanAt: iso,
  });
};

export const reserveDueMonthlyScan = (
  entitlementId: Id<"entitlements">,
  now: Date
): Promise<{ businessExternalId: string | null; reserved: boolean }> =>
  convexMutation(api.entitlements.reserveDueMonthlyScan, {
    entitlementId,
    nowIso: now.toISOString(),
  });

export interface ScanEmailRecipient {
  email: string;
  monthlyScanEmails: boolean;
  unsubscribeToken: string | null;
}

export const getScanEmailRecipient = async (
  businessId: string
): Promise<ScanEmailRecipient | null> => {
  const row = await convexQuery(api.entitlements.getScanNotificationRecipient, {
    businessExternalId: businessId,
  });
  if (!row) {
    return null;
  }
  return row;
};

export const ensureNotificationPrefs = (userId: string): Promise<string> =>
  convexMutation(api.notificationPreferences.ensureForUserInternal, {
    userId,
  });

export const getLatestCompleteScanDetails = async (
  businessId: string
): Promise<{
  score: number | null;
  results: ScanRow["results"];
  finishedAt: string | null;
} | null> => {
  const row = await convexQuery(api.scans.getLatestCompleteDetails, {
    businessExternalId: businessId,
  });
  if (!row) {
    return null;
  }
  const results =
    row.results && typeof row.results === "object"
      ? z.record(z.string(), checkResultSchema).parse(row.results)
      : null;
  return {
    finishedAt: row.finishedAt,
    results,
    score: row.score,
  };
};

export const tryConsumeOnceRescan = (
  businessId: string,
  now: Date
): Promise<{
  allowed: boolean;
  reason:
    | "limit_reached"
    | "no_active_once_entitlement"
    | "window_expired"
    | null;
}> =>
  convexMutation(api.entitlements.tryConsumeOnceRescan, {
    businessExternalId: businessId,
    nowIso: now.toISOString(),
  });

export const getOnceRescanStatus = (businessId: string, now: Date) =>
  convexPublicQuery(api.entitlements.getOnceRescanStatus, {
    businessExternalId: businessId,
    nowIso: now.toISOString(),
  });

const parseScanRow = (row: {
  id: string;
  businessId: string;
  trigger: string;
  status: string;
  score: number | null;
  passCount: number;
  failCount: number;
  errorCount: number;
  results: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}): ScanRow => {
  const results =
    row.results && typeof row.results === "object"
      ? z.record(z.string(), checkResultSchema).parse(row.results)
      : null;
  return scanRowSchema.parse({
    ...row,
    results,
    status: scanStatusSchema.parse(row.status),
    trigger: scanTriggerSchema.parse(row.trigger),
  });
};

export const insertScan = async (input: {
  businessId: string;
  trigger: ScanTrigger;
  status: ScanRow["status"];
  startedAt: string;
}): Promise<ScanRow> => {
  const row = await convexMutation(api.scans.insert, {
    businessExternalId: input.businessId,
    startedAt: input.startedAt,
    status: input.status,
    trigger: input.trigger,
  });
  return parseScanRow(row);
};

export const updateScan = async (
  scanId: string,
  patch: Partial<
    Pick<
      ScanRow,
      | "status"
      | "score"
      | "passCount"
      | "failCount"
      | "errorCount"
      | "error"
      | "finishedAt"
    > & {
      results: ScanRow["results"];
    }
  >
): Promise<ScanRow> => {
  const resultsJson = patch.results
    ? JSON.stringify(patch.results).slice(0, 400_000)
    : undefined;
  const row = await convexMutation(api.scans.update, {
    error: patch.error ?? undefined,
    errorCount: patch.errorCount,
    failCount: patch.failCount,
    finishedAt: patch.finishedAt ?? undefined,
    passCount: patch.passCount,
    resultsJson,
    scanId: scanId as Id<"scans">,
    score: patch.score ?? undefined,
    status: patch.status ?? "running",
  });
  return parseScanRow(row);
};

export const getLatestCompleteScan = (businessId: string) =>
  convexPublicQuery(api.scans.getLatestComplete, {
    businessExternalId: businessId,
  });

export const findUserIdByEmail = (email: string): Promise<string | null> =>
  convexQuery(api.users.findIdByEmail, { email });

export const getUserById = async (id: string): Promise<UserRow | null> => {
  const user = await convexQuery(api.users.getById, { userId: id });
  return user
    ? z
        .object({ createdAt: z.string(), email: z.string(), id: z.string() })
        .parse(user)
    : null;
};

export const listScansForBusiness = (businessId: string, limit = 12) =>
  convexQuery(api.scans.listForBusiness, {
    businessExternalId: businessId,
    limit,
  });

export { nextScanAtFrom } from "./schema";
