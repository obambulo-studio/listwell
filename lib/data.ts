import { z } from "zod";

import type { Id } from "../convex/_generated/dataModel";
import { getCloudflareEnv } from "./audit-env";
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
  ScanRow,
  ScanTrigger,
  UpdateBusinessRequest,
  UserRow,
} from "./schema";

export const idListQuerySchema = z.object({
  ids: z.string().optional(),
});

export const MAX_BULK_IDS = 50;
const BUSINESS_KV_TTL_SECONDS = 7 * 24 * 60 * 60;
const BUSINESS_MEMORY_MAX = 500;

const mapLocations = (locations: CreateBusinessRequest["locations"]) =>
  locations.map((location) => ({
    address: location.address,
    appleMapsId: location.appleMapsId,
    googlePlaceId: location.googlePlaceId,
    name: location.name,
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

const optionalUrl = (value: string | undefined): string | null => value ?? null;

export const businessFromCreateRequest = (
  input: CreateBusinessRequest
): Business => {
  const data = createBusinessRequestSchema.parse(input);
  const timestamp = new Date().toISOString();
  const id = data.id ?? crypto.randomUUID();
  return businessSchema.parse({
    category: data.category,
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
      name: location.name ?? null,
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
      websiteUrl: data.websiteUrl,
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
    name: location.name ?? undefined,
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
    name: input.name ?? existing.name,
    tiktokUsername: keepUrl(input.tiktokUsername, existing.tiktokUsername),
    uberEatsUrl: keepUrl(input.uberEatsUrl, existing.uberEatsUrl),
    websiteUrl: keepUrl(input.websiteUrl, existing.websiteUrl),
    xUsername: keepUrl(input.xUsername, existing.xUsername),
    youtubeUrl: keepUrl(input.youtubeUrl, existing.youtubeUrl),
  });
  return {
    ...next,
    createdAt: existing.createdAt,
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
      websiteUrl: input.websiteUrl,
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

export const grantEntitlement = async (input: {
  businessId: string;
  kind: EntitlementKind;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  userId?: string;
}): Promise<EntitlementRow> => {
  const row = await convexMutation(api.entitlements.grant, {
    businessExternalId: input.businessId,
    kind: input.kind,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
    userId: input.userId,
  });
  return entitlementRowSchema.parse({
    ...row,
    kind: entitlementKindSchema.parse(row.kind),
    status: entitlementStatusSchema.parse(row.status),
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

export const getActiveEntitlementOwner = async (
  businessId: string
): Promise<{
  unlocked: boolean;
  kind: EntitlementKind | null;
  ownerEmail: string | null;
  ownerUserId: string | null;
}> => {
  const owner = await tryConvexQuery(() =>
    convexQuery(api.entitlements.getActiveOwner, {
      businessExternalId: businessId,
    })
  );
  if (!owner) {
    return {
      kind: null,
      ownerEmail: null,
      ownerUserId: null,
      unlocked: false,
    };
  }
  return {
    kind: owner.kind ? entitlementKindSchema.parse(owner.kind) : null,
    ownerEmail: owner.ownerEmail,
    ownerUserId: owner.ownerUserId,
    unlocked: owner.unlocked,
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
